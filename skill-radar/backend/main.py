"""FastAPI backend — radar.py'yi REST API olarak sunar.

Çalıştır:
  cd backend && uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# radar.py'yi import yoluna ekle
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import radar  # noqa: E402

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

app = FastAPI(title="skill-radar API", version="0.1.0")

# Dev için CORS — prod'da daraltılmalı
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- State ----------

@dataclass
class ScanState:
    running: bool = False
    started_at: float | None = None
    finished_at: float | None = None
    last_error: str | None = None
    new_candidates: list[str] = field(default_factory=list)


scan_state = ScanState()


# ---------- Models ----------

class CandidateSummary(BaseModel):
    name: str
    score: int | str
    source_repo: str
    source_url: str
    summary: str
    discovered_at: str | None = None


class CandidateDetail(CandidateSummary):
    skill_md: str
    reason: str
    trigger_keywords: list[str]
    stars: int


class StatusResponse(BaseModel):
    total: int
    candidate: int
    approved: int
    rejected: int
    skipped: int


class ScanStatusResponse(BaseModel):
    running: bool
    started_at: float | None
    finished_at: float | None
    last_error: str | None
    new_candidates: list[str]


class ApproveRequest(BaseModel):
    target: str = "global"  # "global" | "local"


# ---------- Helpers ----------

def _candidates_dir() -> Path:
    cfg = radar.load_config()
    return radar.ROOT / cfg["output"]["candidates_dir"]


def _meta(cdir: Path) -> dict[str, Any]:
    return json.loads((cdir / "_meta.json").read_text(encoding="utf-8"))


# ---------- Endpoints ----------

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/candidates", response_model=list[CandidateSummary])
def list_candidates() -> list[CandidateSummary]:
    cdir_root = _candidates_dir()
    if not cdir_root.exists():
        return []
    out: list[CandidateSummary] = []
    for cdir in sorted(cdir_root.iterdir()):
        if not cdir.is_dir() or not (cdir / "_meta.json").exists():
            continue
        m = _meta(cdir)
        out.append(CandidateSummary(
            name=cdir.name,
            score=m.get("score", "?"),
            source_repo=m.get("source_repo", ""),
            source_url=m.get("source_url", ""),
            summary=m.get("summary", ""),
            discovered_at=m.get("discovered_at"),
        ))
    return out


@app.get("/api/candidates/{name}", response_model=CandidateDetail)
def get_candidate(name: str) -> CandidateDetail:
    cdir = _candidates_dir() / name
    if not cdir.exists() or not (cdir / "_meta.json").exists():
        raise HTTPException(404, f"Aday bulunamadı: {name}")
    m = _meta(cdir)
    skill_md = (cdir / "SKILL.md").read_text(encoding="utf-8") if (cdir / "SKILL.md").exists() else ""
    return CandidateDetail(
        name=name,
        score=m.get("score", "?"),
        source_repo=m.get("source_repo", ""),
        source_url=m.get("source_url", ""),
        summary=m.get("summary", ""),
        discovered_at=m.get("discovered_at"),
        skill_md=skill_md,
        reason=m.get("reason", ""),
        trigger_keywords=m.get("trigger_keywords", []),
        stars=m.get("stars", 0),
    )


@app.post("/api/candidates/{name}/approve")
def approve_candidate(name: str, req: ApproveRequest) -> dict[str, str]:
    cdir = _candidates_dir() / name
    if not cdir.exists():
        raise HTTPException(404, f"Aday bulunamadı: {name}")
    if req.target not in ("global", "local"):
        raise HTTPException(400, "target 'global' veya 'local' olmalı")

    import argparse
    args = argparse.Namespace(name=name, local=(req.target == "local"), global_=(req.target == "global"))
    try:
        radar.cmd_approve(args)
    except SystemExit as e:
        raise HTTPException(400, str(e))
    return {"status": "approved", "target": req.target}


@app.post("/api/candidates/{name}/reject")
def reject_candidate(name: str) -> dict[str, str]:
    cdir = _candidates_dir() / name
    if not cdir.exists():
        raise HTTPException(404, f"Aday bulunamadı: {name}")
    import argparse
    args = argparse.Namespace(name=name)
    try:
        radar.cmd_reject(args)
    except SystemExit as e:
        raise HTTPException(400, str(e))
    return {"status": "rejected"}


@app.post("/api/scan")
async def trigger_scan() -> dict[str, str]:
    if scan_state.running:
        raise HTTPException(409, "Scan zaten çalışıyor")
    asyncio.create_task(_run_scan())
    return {"status": "started"}


@app.get("/api/scan/status", response_model=ScanStatusResponse)
def scan_status() -> ScanStatusResponse:
    return ScanStatusResponse(
        running=scan_state.running,
        started_at=scan_state.started_at,
        finished_at=scan_state.finished_at,
        last_error=scan_state.last_error,
        new_candidates=list(scan_state.new_candidates),
    )


@app.get("/api/status", response_model=StatusResponse)
def db_status() -> StatusResponse:
    if not radar.DB_PATH.exists():
        return StatusResponse(total=0, candidate=0, approved=0, rejected=0, skipped=0)
    conn = radar.db_connect()
    counts = {row["status"]: row["n"] for row in conn.execute(
        "SELECT status, COUNT(*) AS n FROM seen GROUP BY status"
    )}
    return StatusResponse(
        total=sum(counts.values()),
        candidate=counts.get("candidate", 0),
        approved=counts.get("approved", 0),
        rejected=counts.get("rejected", 0),
        skipped=counts.get("skipped", 0),
    )


# ---------- Static frontend (build edilmişse) ----------

FRONTEND_OUT = ROOT / "frontend" / "out"
if FRONTEND_OUT.exists():
    app.mount("/_next", StaticFiles(directory=FRONTEND_OUT / "_next"), name="next-static")

    @app.get("/{path:path}")
    def spa(path: str):
        # API yolları zaten yukarıda yakalanmış olmalı; burada SPA fallback
        candidate = FRONTEND_OUT / (path or "index.html")
        if candidate.is_file():
            return FileResponse(candidate)
        # Default index
        return FileResponse(FRONTEND_OUT / "index.html")


# ---------- Background scan ----------

async def _run_scan() -> None:
    scan_state.running = True
    scan_state.started_at = time.time()
    scan_state.finished_at = None
    scan_state.last_error = None
    scan_state.new_candidates = []

    # Adayların listesini scan öncesi al
    before = {c.name for c in list_candidates()}

    loop = asyncio.get_event_loop()
    try:
        import argparse
        args = argparse.Namespace()
        await loop.run_in_executor(None, radar.cmd_scan, args)
    except Exception as e:
        scan_state.last_error = str(e)

    after = {c.name for c in list_candidates()}
    scan_state.new_candidates = sorted(after - before)
    scan_state.running = False
    scan_state.finished_at = time.time()
