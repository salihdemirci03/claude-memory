"""Demo client: ANTHROPIC_API_KEY olmadan akışı görmek için mock.

Gerçek scan ile aynı code path'i kullanır — sadece Anthropic client'ı sahte.
Çalıştır:  python demo_scan.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import radar


class FakeContentBlock:
    def __init__(self, text: str):
        self.type = "text"
        self.text = text


class FakeMessage:
    def __init__(self, text: str):
        self.content = [FakeContentBlock(text)]


class FakeMessages:
    def create(self, *, model, max_tokens, system, messages):
        user = messages[0]["content"]
        # Sistem prompt'una göre cevap üret
        if "skill yazarısın" in system:
            return FakeMessage(self._fake_skill_md(user))
        return FakeMessage(self._fake_analysis(user))

    @staticmethod
    def _fake_analysis(user_json: str) -> str:
        data = json.loads(user_json)
        full = data.get("full_name", "unknown/repo")
        desc = data.get("description") or ""
        topics = data.get("topics", [])
        is_skill = any("skill" in t for t in topics) or "skill" in desc.lower()
        return json.dumps({
            "is_skill": is_skill,
            "score": 8 if is_skill else 3,
            "suggested_name": full.split("/")[-1].lower().replace("_", "-"),
            "summary": f"[MOCK] {desc[:80] or full}",
            "reason": "[MOCK] Bu yanıt demo amaçlı — gerçek Claude değerlendirmesi değil.",
            "trigger_keywords": ["mock", "demo"],
        })

    @staticmethod
    def _fake_skill_md(user_json: str) -> str:
        data = json.loads(user_json)
        name = data.get("suggested_name", "demo-skill")
        summary = data.get("summary", "")
        url = data.get("html_url", "")
        return (
            f"---\n"
            f"name: {name}\n"
            f"description: |\n"
            f"  [MOCK SKILL] {summary}\n"
            f"---\n\n"
            f"# {name}\n\n"
            f"## Ne işe yarar\n"
            f"[MOCK] Bu demo amaçlı üretilmiş bir SKILL.md taslağıdır.\n"
            f"Kaynak: {url}\n\n"
            f"## Ne zaman kullan\n"
            f"- Bu repo'nun kapsamıyla ilgili bir görev geldiğinde\n\n"
            f"## Kullanım\n"
            f"```bash\n# Repo README'sini incele: {url}\n```\n\n"
            f"## Notlar\n"
            f"Bu içerik demo modunda üretildi. Gerçek tarama için ANTHROPIC_API_KEY ayarla.\n"
        )


class FakeAnthropic:
    def __init__(self, **_):
        self.messages = FakeMessages()


# radar'ı monkey-patch et: anthropic_client demo client döner
radar.anthropic_client = lambda cfg: FakeAnthropic()


# GitHub'ı da mock'la (sandbox'ta rate limit veya token yoksa diye)
FAKE_REPOS = [
    {
        "full_name": "garrytan/gstack",
        "name": "gstack",
        "description": "Garry Tan'in Claude Code skill koleksiyonu — ekip yerine geçen 23 uzman skill.",
        "stargazers_count": 1200,
        "size": 8500,
        "fork": False,
        "archived": False,
        "pushed_at": "2026-05-20T10:00:00Z",
        "html_url": "https://github.com/garrytan/gstack",
        "topics": ["claude-code-skill", "ai-agents"],
    },
    {
        "full_name": "demo-org/coffee-recipes",
        "name": "coffee-recipes",
        "description": "Espresso ve filtre kahve tarifleri koleksiyonu.",
        "stargazers_count": 42,
        "size": 800,
        "fork": False,
        "archived": False,
        "pushed_at": "2026-05-01T10:00:00Z",
        "html_url": "https://github.com/demo-org/coffee-recipes",
        "topics": ["coffee", "recipes"],
    },
    {
        "full_name": "demo-org/claude-pr-reviewer",
        "name": "claude-pr-reviewer",
        "description": "Claude Code skill: PR'lara güvenlik ve mantık hatası bakar.",
        "stargazers_count": 87,
        "size": 1200,
        "fork": False,
        "archived": False,
        "pushed_at": "2026-05-18T10:00:00Z",
        "html_url": "https://github.com/demo-org/claude-pr-reviewer",
        "topics": ["claude-code-skill", "pr-review", "security"],
    },
]

FAKE_READMES = {
    "garrytan/gstack": (
        "# gstack\n\nClaude Code'u sanal bir mühendislik ekibine çeviren skill koleksiyonu.\n\n"
        "## Skills\n- /office-hours — ürün sorgulama\n- /ship — PR aç ve deploy et\n- /review — kod incele\n"
    ),
    "demo-org/coffee-recipes": (
        "# Coffee Recipes\n\nGünlük kahve tarifleri. AeroPress, V60, French Press...\n"
    ),
    "demo-org/claude-pr-reviewer": (
        "# claude-pr-reviewer\n\nClaude Code skill'i. PR diff'lerini OWASP + STRIDE açısından inceler.\n\n"
        "## Kullanım\n```\n/review-pr <pr-url>\n```\n\nÇıktı: bulunan bug'lar JSON listesi.\n"
    ),
}


def fake_search(q, sort, per_page, token):
    # q'ya göre kabaca filtrele
    if "claude" in q.lower() or "skill" in q.lower():
        return [r for r in FAKE_REPOS if "claude-code-skill" in r["topics"] or "claude" in r["description"].lower()]
    return FAKE_REPOS


def fake_readme(full_name, token):
    return FAKE_READMES.get(full_name)


def fake_tree(full_name, token, max_entries=50):
    return ["README.md", "SKILL.md"] if "claude" in full_name else ["README.md"]


radar.gh_search_repos = fake_search
radar.gh_get_readme = fake_readme
radar.gh_get_tree = fake_tree


# Demo hızlı olsun: limit'i 3'e düşür
_orig_load = radar.load_config
def _demo_load():
    cfg = _orig_load()
    cfg["limits"]["max_candidates_per_scan"] = 3
    cfg["queries"] = cfg["queries"][:1]  # sadece 1 query yeter
    return cfg
radar.load_config = _demo_load


if __name__ == "__main__":
    print("=" * 60)
    print("DEMO MODU — gerçek GitHub verisi + mock Claude yanıtı")
    print("=" * 60)
    import argparse
    args = argparse.Namespace()
    sys.exit(radar.cmd_scan(args))
