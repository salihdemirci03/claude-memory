// GitHub REST API katmanı — token varsa kullanır, yoksa anonim (rate limit düşük ama haftalık çalışma için yeterli).
'use strict';

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function headers() {
  const h = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'passive-income-engine',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (TOKEN) h['Authorization'] = `Bearer ${TOKEN}`;
  return h;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// İstekler arası minimum aralık (anonim limitler çok düşük olduğu için token yoksa yavaşla).
const THROTTLE_MS = TOKEN ? 1200 : 7000;
// Tek bir rate-limit beklemesi için üst sınır (zamanlanmış çalışmada makul).
const MAX_WAIT_MS = 75_000;
let lastCall = 0;

async function ghFetch(url, opts = {}, { retried = false } = {}) {
  const since = Date.now() - lastCall;
  if (since < THROTTLE_MS) await sleep(THROTTLE_MS - since);
  lastCall = Date.now();

  const res = await fetch(url, { headers: headers(), ...opts });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    const waitMs = reset ? Math.max(0, Number(reset) * 1000 - Date.now()) : 0;
    if (!retried && waitMs > 0 && waitMs <= MAX_WAIT_MS) {
      await sleep(waitMs + 1500);
      return ghFetch(url, opts, { retried: true });
    }
    throw new Error(`GitHub rate limit (HTTP ${res.status}). ${TOKEN ? '' : 'GITHUB_TOKEN ayarlarsan limit 60→5000/saat olur. '}Reset ~${Math.ceil(waitMs / 1000)}s sonra.`);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}

// ISO tarih: bugünden N gün önce
function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

async function searchRepos(query, { minStars, createdWithinDays, perPage }) {
  const created = daysAgoISO(createdWithinDays);
  const q = `${query} stars:>=${minStars} created:>=${created}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`;
  const data = await ghFetch(url);
  return (data.items || []).map(normalizeRepo);
}

function normalizeRepo(r) {
  return {
    fullName: r.full_name,
    url: r.html_url,
    description: r.description || '',
    stars: r.stargazers_count || 0,
    language: r.language || '',
    topics: r.topics || [],
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    license: r.license ? r.license.spdx_id : null,
  };
}

async function fetchReadme(fullName, maxChars) {
  try {
    const data = await ghFetch(`https://api.github.com/repos/${fullName}/readme`);
    if (!data.content) return '';
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    return text.slice(0, maxChars);
  } catch {
    return '';
  }
}

module.exports = { searchRepos, fetchReadme, daysAgoISO, hasToken: () => Boolean(TOKEN) };
