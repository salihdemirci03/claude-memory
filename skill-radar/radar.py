#!/usr/bin/env python3
"""skill-radar — discover Claude Code skill candidates from GitHub.

Usage:
  radar.py scan                  Tara, yeni adayları candidates/ altına yaz
  radar.py list                  Bekleyen adayları listele
  radar.py show <name>           Bir adayın SKILL.md'sini göster
  radar.py approve <name> [--local|--global]
                                 Adayı ~/.claude/skills/ veya .claude/skills/'e kur
  radar.py reject <name>         Adayı reddet, bir daha gösterme
  radar.py status                Veritabanı istatistikleri
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

def _require(module: str, pip_name: str | None = None):
    """Lazy import; bağımlılık eksikse anlamlı hata ver."""
    try:
        return __import__(module)
    except ImportError:
        name = pip_name or module
        print(f"Eksik bağımlılık: {name}. `pip install -r requirements.txt` çalıştırın.", file=sys.stderr)
        sys.exit(1)


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "radar.db"
CONFIG_PATH = ROOT / "config.yaml"

GITHUB_API = "https://api.github.com"
USER_AGENT = "skill-radar/0.1"


# ---------- Config ----------

def load_config() -> dict[str, Any]:
    yaml = _require("yaml", "PyYAML")
    if not CONFIG_PATH.exists():
        sys.exit(f"config.yaml bulunamadı: {CONFIG_PATH}")
    with CONFIG_PATH.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def github_token(cfg: dict[str, Any]) -> str | None:
    return os.environ.get("GITHUB_TOKEN") or cfg.get("github", {}).get("token")


def anthropic_client(cfg: dict[str, Any]):
    key = os.environ.get("ANTHROPIC_API_KEY") or cfg.get("claude", {}).get("api_key")
    if not key:
        sys.exit("ANTHROPIC_API_KEY env değişkeni veya config.yaml'da claude.api_key zorunlu.")
    from anthropic import Anthropic  # lazy
    return Anthropic(api_key=key)


# ---------- DB ----------

def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS seen (
            full_name TEXT PRIMARY KEY,
            first_seen TEXT NOT NULL,
            last_pushed TEXT,
            stars INTEGER,
            status TEXT NOT NULL,  -- candidate|approved|rejected|skipped
            skill_name TEXT,
            score INTEGER,
            summary TEXT,
            html_url TEXT
        )"""
    )
    return conn


def db_get(conn: sqlite3.Connection, full_name: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM seen WHERE full_name = ?", (full_name,)).fetchone()


def db_upsert(conn: sqlite3.Connection, row: dict[str, Any]) -> None:
    cols = ", ".join(row.keys())
    placeholders = ", ".join(["?"] * len(row))
    updates = ", ".join(f"{k} = excluded.{k}" for k in row.keys() if k != "full_name")
    conn.execute(
        f"INSERT INTO seen ({cols}) VALUES ({placeholders}) "
        f"ON CONFLICT(full_name) DO UPDATE SET {updates}",
        tuple(row.values()),
    )
    conn.commit()


# ---------- GitHub ----------

def gh_headers(token: str | None) -> dict[str, str]:
    h = {"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def gh_search_repos(q: str, sort: str, per_page: int, token: str | None) -> list[dict[str, Any]]:
    requests = _require("requests")
    pushed_cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    q_full = f"{q} pushed:>={pushed_cutoff}"
    r = requests.get(
        f"{GITHUB_API}/search/repositories",
        headers=gh_headers(token),
        params={"q": q_full, "sort": sort, "order": "desc", "per_page": per_page},
        timeout=30,
    )
    if r.status_code == 403 and "rate limit" in r.text.lower():
        sys.exit("GitHub rate limit. GITHUB_TOKEN ayarla.")
    r.raise_for_status()
    return r.json().get("items", [])


def gh_get_readme(full_name: str, token: str | None) -> str | None:
    requests = _require("requests")
    r = requests.get(
        f"{GITHUB_API}/repos/{full_name}/readme",
        headers=gh_headers(token),
        timeout=30,
    )
    if r.status_code == 404:
        return None
    r.raise_for_status()
    data = r.json()
    content = data.get("content", "")
    if data.get("encoding") == "base64":
        try:
            return base64.b64decode(content).decode("utf-8", errors="replace")
        except Exception:
            return None
    return content


def gh_get_tree(full_name: str, token: str | None, max_entries: int = 50) -> list[str]:
    """Repo'nun dosya ağacının ilk N girişini döndürür (sadece path'ler).

    Hata durumunda boş liste döner ama nedeni stderr'e loglar — sessiz başarısızlık değil.
    """
    requests = _require("requests")
    r = requests.get(f"{GITHUB_API}/repos/{full_name}", headers=gh_headers(token), timeout=30)
    if r.status_code != 200:
        print(f"    [warn] {full_name} repo metadata alınamadı: HTTP {r.status_code}", file=sys.stderr)
        return []
    default_branch = r.json().get("default_branch", "main")
    r = requests.get(
        f"{GITHUB_API}/repos/{full_name}/git/trees/{default_branch}?recursive=1",
        headers=gh_headers(token),
        timeout=30,
    )
    if r.status_code != 200:
        print(f"    [warn] {full_name} tree alınamadı ({default_branch}): HTTP {r.status_code}", file=sys.stderr)
        return []
    tree = r.json().get("tree", [])
    return [t["path"] for t in tree[:max_entries] if t.get("type") == "blob"]


# ---------- Filter ----------

def passes_prefilter(repo: dict[str, Any], cfg: dict[str, Any]) -> tuple[bool, str]:
    f = cfg.get("filters", {})
    if f.get("exclude_forks", True) and repo.get("fork"):
        return False, "fork"
    if f.get("exclude_archived", True) and repo.get("archived"):
        return False, "archived"
    if repo.get("stargazers_count", 0) < f.get("min_stars", 0):
        return False, "low_stars"
    if repo.get("size", 0) > f.get("max_repo_size_kb", 10**9):
        return False, "too_large"
    return True, ""


# ---------- Claude analysis ----------

ANALYZE_SYSTEM = """Sen bir Claude Code skill kürelisin. Verilen GitHub deposunun \
README'sine ve dosya yapısına bakarak şunu değerlendirirsin:

1) Bu repo bir Claude Code "skill"ine dönüştürülebilir mi?
   Bir skill: tek bir net kullanım senaryosu olan, Claude'a yeni bir yetenek \
veya kuralları kazandıran küçük talimat paketidir (SKILL.md formatında).

2) Eğer evetse, 1-10 arası bir skor ver (10 = mükemmel skill adayı).

YALNIZCA aşağıdaki JSON formatında cevap ver — başka metin yok:

{
  "is_skill": true|false,
  "score": 1-10,
  "suggested_name": "kebab-case-name",
  "summary": "Tek cümle özet (Türkçe).",
  "reason": "Niye is_skill=true/false (Türkçe, 1-2 cümle).",
  "trigger_keywords": ["kullanıcı bu kelimelerden bahsedince skill devreye girer"]
}
"""

GENERATE_SYSTEM = """Sen bir Claude Code skill yazarısın. Verilen repo bilgisinden \
geçerli bir SKILL.md üretirsin.

SKILL.md formatı:

---
name: kebab-case-name
description: |
  Bir cümlelik tetikleyici açıklama. Hangi kullanıcı isteklerinde devreye girmeli?
---

# Skill başlığı (insan-okur)

## Ne işe yarar
2-4 cümle.

## Ne zaman kullan
- Tetikleyici 1
- Tetikleyici 2

## Kullanım
Net adımlar veya komutlar. Markdown kod blokları kullan.

## Notlar
İsteğe bağlı uyarılar.

YALNIZCA SKILL.md içeriğini döndür. Açıklama veya kod bloğu sarmalama YOK.
"""


@dataclass
class Verdict:
    is_skill: bool
    score: int
    suggested_name: str
    summary: str
    reason: str
    trigger_keywords: list[str]


def analyze_repo(
    client,
    cfg: dict[str, Any],
    repo: dict[str, Any],
    readme: str,
    tree: list[str],
) -> Verdict | None:
    model = cfg["claude"]["model"]
    max_tokens = cfg["claude"].get("max_tokens", 4096)
    user_msg = json.dumps(
        {
            "full_name": repo["full_name"],
            "description": repo.get("description"),
            "stars": repo.get("stargazers_count"),
            "topics": repo.get("topics", []),
            "tree_sample": tree[:40],
            "readme_first_8000_chars": (readme or "")[:8000],
        },
        ensure_ascii=False,
    )
    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=ANALYZE_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    text = _strip_code_fence(text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        print(f"  [warn] Claude JSON parse hatası, atlandı: {text[:200]}")
        return None
    try:
        return Verdict(
            is_skill=bool(data.get("is_skill")),
            score=_coerce_int(data.get("score"), default=0),
            suggested_name=str(data.get("suggested_name", "")).strip(),
            summary=str(data.get("summary", "")).strip(),
            reason=str(data.get("reason", "")).strip(),
            trigger_keywords=_coerce_str_list(data.get("trigger_keywords")),
        )
    except (TypeError, ValueError) as e:
        print(f"  [warn] Claude yanıtı şekli beklenmedik: {e}")
        return None


def _coerce_int(v: Any, default: int) -> int:
    if isinstance(v, bool):
        return default
    if isinstance(v, int):
        return v
    if isinstance(v, str):
        try:
            return int(v.strip())
        except ValueError:
            return default
    if isinstance(v, float):
        return int(v)
    return default


def _coerce_str_list(v: Any) -> list[str]:
    if isinstance(v, list):
        return [str(x) for x in v]
    if isinstance(v, str) and v.strip():
        return [v.strip()]
    return []


def generate_skill_md(
    client,
    cfg: dict[str, Any],
    repo: dict[str, Any],
    verdict: Verdict,
    readme: str,
) -> str:
    model = cfg["claude"]["model"]
    max_tokens = cfg["claude"].get("max_tokens", 4096)
    user_msg = json.dumps(
        {
            "full_name": repo["full_name"],
            "html_url": repo["html_url"],
            "description": repo.get("description"),
            "suggested_name": verdict.suggested_name,
            "summary": verdict.summary,
            "trigger_keywords": verdict.trigger_keywords,
            "readme_first_12000_chars": (readme or "")[:12000],
        },
        ensure_ascii=False,
    )
    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=GENERATE_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    return _strip_code_fence(text)


def _strip_code_fence(text: str) -> str:
    """Claude bazen ```json ... ``` ile sarar. İç içeriği çıkar.

    Esnek: opening fence sonrası ve closing fence öncesi boşluk/newline tolere edilir.
    Eşleşmezse orijinal metni döndür.
    """
    stripped = text.strip()
    m = re.match(
        r"^```[a-zA-Z0-9_-]*[ \t]*\r?\n(.*?)\r?\n[ \t]*```[ \t]*$",
        stripped,
        re.DOTALL,
    )
    return m.group(1).strip() if m else stripped


# ---------- Commands ----------

def cmd_scan(args: argparse.Namespace) -> int:
    cfg = load_config()
    token = github_token(cfg)
    client = anthropic_client(cfg)
    conn = db_connect()

    candidates_dir = ROOT / cfg["output"]["candidates_dir"]
    candidates_dir.mkdir(exist_ok=True)

    seen_this_scan: set[str] = set()
    new_candidates: list[str] = []
    claude_calls = 0  # her aday için 1 analiz + (skill çıkarsa) 1 üretim
    per_scan_limit = cfg["limits"]["max_candidates_per_scan"]
    # En kötü durumda aday başına 2 çağrı olabileceği için limit*2 hard ceiling.
    max_claude_calls = per_scan_limit * 2

    for query in cfg["queries"]:
        if claude_calls >= max_claude_calls:
            print(f"[limit] Claude çağrı tavanı ({max_claude_calls}) doldu, kalan query'ler atlandı.")
            break
        print(f"[query] {query['name']}: {query['q']}")
        try:
            repos = gh_search_repos(
                query["q"],
                query.get("sort", "updated"),
                cfg["github"].get("per_page", 30),
                token,
            )
        except Exception as e:
            print(f"  [error] {e}")
            continue
        print(f"  → {len(repos)} sonuç")

        for repo in repos:
            if claude_calls >= max_claude_calls:
                break
            full = repo["full_name"]
            if full in seen_this_scan:
                continue
            seen_this_scan.add(full)

            existing = db_get(conn, full)
            if existing and existing["status"] in ("approved", "rejected", "candidate"):
                continue

            ok, reason = passes_prefilter(repo, cfg)
            if not ok:
                db_upsert(conn, _row_for_skipped(repo, reason))
                continue

            print(f"  [analyze] {full} (★{repo.get('stargazers_count', 0)})")
            try:
                readme = gh_get_readme(full, token) or ""
                tree = gh_get_tree(full, token)
            except Exception as e:
                print(f"    [error] readme/tree alınamadı: {e}")
                continue

            if not readme:
                db_upsert(conn, _row_for_skipped(repo, "no_readme"))
                continue

            verdict = analyze_repo(client, cfg, repo, readme, tree)
            claude_calls += 1
            if verdict is None:
                db_upsert(conn, _row_for_skipped(repo, "analyze_failed"))
                continue

            min_score = cfg["scoring"]["min_score"]
            if not verdict.is_skill or verdict.score < min_score:
                print(f"    → skill değil (score={verdict.score}, {verdict.reason[:80]})")
                db_upsert(conn, _row_for_skipped(repo, f"low_score:{verdict.score}"))
                continue

            name = _sanitize_name(verdict.suggested_name or repo["name"])
            print(f"    → aday (score={verdict.score}, name={name})")

            skill_md = generate_skill_md(client, cfg, repo, verdict, readme)
            claude_calls += 1
            _write_candidate(candidates_dir, name, repo, verdict, skill_md)
            db_upsert(
                conn,
                {
                    "full_name": full,
                    "first_seen": datetime.now(timezone.utc).isoformat(),
                    "last_pushed": repo.get("pushed_at"),
                    "stars": repo.get("stargazers_count", 0),
                    "status": "candidate",
                    "skill_name": name,
                    "score": verdict.score,
                    "summary": verdict.summary,
                    "html_url": repo["html_url"],
                },
            )
            new_candidates.append(name)
            time.sleep(0.3)  # API'lere nefes aldır

    print()
    print(f"[özet] {len(new_candidates)} yeni aday: {', '.join(new_candidates) or '(yok)'}")
    print(f"  Listele: python radar.py list")
    return 0


def _row_for_skipped(repo: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "full_name": repo["full_name"],
        "first_seen": datetime.now(timezone.utc).isoformat(),
        "last_pushed": repo.get("pushed_at"),
        "stars": repo.get("stargazers_count", 0),
        "status": "skipped",
        "skill_name": None,
        "score": None,
        "summary": reason,
        "html_url": repo.get("html_url"),
    }


def _sanitize_name(name: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-")
    return name or "unnamed-skill"


def _write_candidate(
    candidates_dir: Path,
    name: str,
    repo: dict[str, Any],
    verdict: Verdict,
    skill_md: str,
) -> None:
    cdir = candidates_dir / name
    cdir.mkdir(parents=True, exist_ok=True)
    (cdir / "SKILL.md").write_text(skill_md + "\n", encoding="utf-8")
    (cdir / "_meta.json").write_text(
        json.dumps(
            {
                "source_repo": repo["full_name"],
                "source_url": repo["html_url"],
                "stars": repo.get("stargazers_count", 0),
                "score": verdict.score,
                "summary": verdict.summary,
                "reason": verdict.reason,
                "trigger_keywords": verdict.trigger_keywords,
                "discovered_at": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def cmd_list(args: argparse.Namespace) -> int:
    cfg = load_config()
    candidates_dir = ROOT / cfg["output"]["candidates_dir"]
    if not candidates_dir.exists():
        print("(henüz aday yok — `python radar.py scan` çalıştır)")
        return 0
    rows = []
    for cdir in sorted(candidates_dir.iterdir()):
        meta_path = cdir / "_meta.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        rows.append((cdir.name, meta.get("score", "?"), meta.get("source_repo", ""), meta.get("summary", "")))
    if not rows:
        print("(henüz aday yok)")
        return 0
    print(f"{'NAME':<35} {'SCORE':<6} {'SOURCE':<40} SUMMARY")
    print("-" * 120)
    for name, score, source, summary in rows:
        print(f"{name:<35} {str(score):<6} {source:<40} {summary[:60]}")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    cfg = load_config()
    candidates_dir = ROOT / cfg["output"]["candidates_dir"]
    cdir = candidates_dir / args.name
    if not cdir.exists():
        sys.exit(f"Aday bulunamadı: {args.name}")
    print((cdir / "SKILL.md").read_text(encoding="utf-8"))
    return 0


def cmd_approve(args: argparse.Namespace) -> int:
    cfg = load_config()
    candidates_dir = ROOT / cfg["output"]["candidates_dir"]
    cdir = candidates_dir / args.name
    if not cdir.exists():
        sys.exit(f"Aday bulunamadı: {args.name}")

    target_setting = "local" if args.local else ("global" if args.global_ else cfg["output"]["default_approve_target"])
    if target_setting == "local":
        target_root = (ROOT / cfg["output"]["approved_local_dir"]).resolve()
    else:
        target_root = Path(os.path.expanduser(cfg["output"]["approved_global_dir"]))
    target_root.mkdir(parents=True, exist_ok=True)
    dst = target_root / args.name
    if dst.exists():
        sys.exit(f"Hedef zaten mevcut: {dst}")
    shutil.copytree(cdir, dst)
    print(f"[approved] {args.name} → {dst}")

    # DB'de işaretle
    conn = db_connect()
    meta = json.loads((cdir / "_meta.json").read_text(encoding="utf-8"))
    source = meta.get("source_repo")
    if source:
        conn.execute("UPDATE seen SET status = 'approved' WHERE full_name = ?", (source,))
        conn.commit()
    # Candidate'i temizle
    shutil.rmtree(cdir)
    return 0


def cmd_reject(args: argparse.Namespace) -> int:
    cfg = load_config()
    candidates_dir = ROOT / cfg["output"]["candidates_dir"]
    cdir = candidates_dir / args.name
    if not cdir.exists():
        sys.exit(f"Aday bulunamadı: {args.name}")
    meta = json.loads((cdir / "_meta.json").read_text(encoding="utf-8"))
    source = meta.get("source_repo")
    conn = db_connect()
    if source:
        conn.execute("UPDATE seen SET status = 'rejected' WHERE full_name = ?", (source,))
        conn.commit()
    shutil.rmtree(cdir)
    print(f"[rejected] {args.name}")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    if not DB_PATH.exists():
        print("(henüz DB yok — `python radar.py scan` çalıştır)")
        return 0
    conn = db_connect()
    counts = {row["status"]: row["n"] for row in conn.execute(
        "SELECT status, COUNT(*) AS n FROM seen GROUP BY status"
    )}
    total = sum(counts.values())
    print(f"Toplam görülen repo: {total}")
    for s in ("candidate", "approved", "rejected", "skipped"):
        print(f"  {s:<10}: {counts.get(s, 0)}")
    return 0


# ---------- Entry ----------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="radar.py", description="Claude Code skill keşif radarı")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("scan", help="Yeni adayları tara").set_defaults(func=cmd_scan)
    sub.add_parser("list", help="Bekleyen adayları listele").set_defaults(func=cmd_list)
    sub.add_parser("status", help="DB istatistikleri").set_defaults(func=cmd_status)

    show = sub.add_parser("show", help="Bir adayın SKILL.md'sini göster")
    show.add_argument("name")
    show.set_defaults(func=cmd_show)

    approve = sub.add_parser("approve", help="Adayı kur")
    approve.add_argument("name")
    g = approve.add_mutually_exclusive_group()
    g.add_argument("--local", action="store_true", help=".claude/skills/'e kur")
    g.add_argument("--global", action="store_true", dest="global_", help="~/.claude/skills/'e kur")
    approve.set_defaults(func=cmd_approve)

    reject = sub.add_parser("reject", help="Adayı reddet")
    reject.add_argument("name")
    reject.set_defaults(func=cmd_reject)

    return p


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
