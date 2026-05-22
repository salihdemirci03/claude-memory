// API client. NEXT_PUBLIC_API_BASE ile dev'de ayrı backend port'una yönlendirilir.
// Build edilip FastAPI'den serve edilirse aynı origin'den çalışır.

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export type Candidate = {
  name: string;
  score: number | string;
  source_repo: string;
  source_url: string;
  summary: string;
  discovered_at?: string;
};

export type CandidateDetail = Candidate & {
  skill_md: string;
  reason: string;
  trigger_keywords: string[];
  stars: number;
};

export type DbStatus = {
  total: number;
  candidate: number;
  approved: number;
  rejected: number;
  skipped: number;
};

export type ScanStatus = {
  running: boolean;
  started_at: number | null;
  finished_at: number | null;
  last_error: string | null;
  new_candidates: string[];
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`${r.status} ${r.statusText}: ${text}`);
  }
  return r.json();
}

export const api = {
  listCandidates: () => req<Candidate[]>('/api/candidates'),
  getCandidate: (name: string) => req<CandidateDetail>(`/api/candidates/${encodeURIComponent(name)}`),
  approve: (name: string, target: 'global' | 'local') =>
    req(`/api/candidates/${encodeURIComponent(name)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),
  reject: (name: string) =>
    req(`/api/candidates/${encodeURIComponent(name)}/reject`, { method: 'POST' }),
  triggerScan: () => req<{ status: string }>('/api/scan', { method: 'POST' }),
  scanStatus: () => req<ScanStatus>('/api/scan/status'),
  dbStatus: () => req<DbStatus>('/api/status'),
};
