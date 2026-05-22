'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, type Candidate, type CandidateDetail, type DbStatus, type ScanStatus } from '../lib/api';

export default function Home() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [scan, setScan] = useState<ScanStatus | null>(null);
  const [selected, setSelected] = useState<CandidateDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [cs, st, sc] = await Promise.all([api.listCandidates(), api.dbStatus(), api.scanStatus()]);
      setCandidates(cs);
      setStatus(st);
      setScan(sc);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Scan çalışıyorken her 2 saniyede bir poll et
  useEffect(() => {
    if (!scan?.running) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [scan?.running, refresh]);

  const handleScan = async () => {
    setError(null);
    try {
      await api.triggerScan();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openDetail = async (name: string) => {
    setBusy(name);
    setError(null);
    try {
      const d = await api.getCandidate(name);
      setSelected(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (target: 'global' | 'local') => {
    if (!selected) return;
    setBusy(selected.name);
    try {
      await api.approve(selected.name, target);
      setSelected(null);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setBusy(selected.name);
    try {
      await api.reject(selected.name);
      setSelected(null);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">skill-radar</h1>
          <p className="text-sm text-muted">Claude Code skill keşif radarı</p>
        </div>
        <button
          onClick={handleScan}
          disabled={scan?.running}
          className="px-4 py-2 bg-accent text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition"
        >
          {scan?.running ? 'Taranıyor…' : 'Tara'}
        </button>
      </header>

      {/* Status bar */}
      {status && (
        <div className="grid grid-cols-4 gap-2 mb-4 text-center">
          <Stat label="Aday" value={status.candidate} highlight />
          <Stat label="Onaylı" value={status.approved} />
          <Stat label="Red" value={status.rejected} />
          <Stat label="Atlanan" value={status.skipped} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-200">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">kapat</button>
        </div>
      )}

      {/* Scan result hint */}
      {scan?.new_candidates && scan.new_candidates.length > 0 && !scan.running && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/40 rounded-lg text-sm">
          Son taramada {scan.new_candidates.length} yeni aday: {scan.new_candidates.join(', ')}
        </div>
      )}
      {scan?.last_error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-200">
          Son scan hatası: {scan.last_error}
        </div>
      )}

      {/* Candidate list */}
      {candidates === null ? (
        <p className="text-muted">Yükleniyor…</p>
      ) : candidates.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="mb-2">Henüz bekleyen aday yok.</p>
          <p className="text-sm">Yukarıdaki <strong>Tara</strong> butonuna bas.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li key={c.name}>
              <button
                onClick={() => openDetail(c.name)}
                disabled={busy === c.name}
                className="w-full text-left p-4 bg-card border border-border rounded-lg active:scale-[0.99] transition disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-semibold truncate">{c.name}</span>
                  <ScoreBadge score={c.score} />
                </div>
                <div className="text-xs text-muted truncate mb-1">{c.source_repo}</div>
                <div className="text-sm text-gray-300 line-clamp-2">{c.summary}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-bg border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between p-4 border-b border-border">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{selected.name}</h2>
                <a
                  href={selected.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent underline truncate block"
                >
                  {selected.source_repo} ★ {selected.stars}
                </a>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 text-muted hover:text-white"
                aria-label="Kapat"
              >
                ✕
              </button>
            </header>

            <div className="overflow-y-auto p-4 flex-1">
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <ScoreBadge score={selected.score} />
                {selected.trigger_keywords.map((k) => (
                  <span key={k} className="px-2 py-1 bg-card border border-border rounded">
                    {k}
                  </span>
                ))}
              </div>
              {selected.reason && (
                <div className="mb-3 p-3 bg-card border border-border rounded text-sm text-gray-300">
                  <div className="text-xs text-muted mb-1">Değerlendirme</div>
                  {selected.reason}
                </div>
              )}
              <div className="md text-sm">
                <ReactMarkdown>{selected.skill_md}</ReactMarkdown>
              </div>
            </div>

            <footer className="p-4 border-t border-border grid grid-cols-3 gap-2">
              <button
                onClick={handleReject}
                disabled={busy === selected.name}
                className="py-3 bg-red-900/50 border border-red-700 rounded-lg font-medium active:scale-95 transition disabled:opacity-50"
              >
                Reddet
              </button>
              <button
                onClick={() => handleApprove('local')}
                disabled={busy === selected.name}
                className="py-3 bg-card border border-border rounded-lg font-medium active:scale-95 transition disabled:opacity-50"
              >
                Projeye
              </button>
              <button
                onClick={() => handleApprove('global')}
                disabled={busy === selected.name}
                className="py-3 bg-accent text-white rounded-lg font-medium active:scale-95 transition disabled:opacity-50"
              >
                Kur (~/)
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded-lg border ${highlight ? 'border-accent bg-accent/10' : 'border-border bg-card'}`}>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | string }) {
  const n = typeof score === 'number' ? score : 0;
  const color = n >= 8 ? 'bg-green-700' : n >= 6 ? 'bg-accent' : 'bg-gray-600';
  return <span className={`text-xs px-2 py-1 rounded ${color} text-white font-medium`}>★ {score}</span>;
}
