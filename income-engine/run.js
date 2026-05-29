#!/usr/bin/env node
// Passive Income Engine — orkestratör.
// Akış: keşfet -> analiz et + skorla -> kombinle -> rapor yaz.
// Idempotent: daha önce görülen repolar tekrar analiz edilmez (state/seen-repos.json).
'use strict';

const path = require('path');
const github = require('./lib/github');
const store = require('./lib/store');
const { extractCapabilities, scoreRepo } = require('./lib/analyze');
const { generateIdeas } = require('./lib/combine');
const { enrichIdeas, hasKey } = require('./lib/llm');
const { buildReport, writeReport } = require('./lib/report');

const cfg = require('./config.json');

function composite(scores, weights) {
  return (
    weights.stars * scores.starsScore +
    weights.recency * scores.recencyScore +
    weights.capabilityFit * scores.capFit +
    weights.monetization * scores.monetization +
    weights.passiveness * scores.passiveness
  );
}

async function discover() {
  const { perDomain, minStars, createdWithinDays, maxReadmeChars, maxReadmeFetches } = cfg.discovery;
  const readmeCap = maxReadmeFetches || 40;
  let readmeFetched = 0;
  const seen = store.loadSeen();
  const newRepos = [];
  const allCurrent = []; // bu çalışmadaki tüm geçerli repolar (yeni + eski havuz)

  for (const domain of cfg.domains) {
    console.log(`\n▶ Alan: ${domain.label}`);
    const collected = new Map();
    for (const q of domain.queries) {
      try {
        const repos = await github.searchRepos(q, { minStars, createdWithinDays, perPage: perDomain });
        for (const r of repos) collected.set(r.fullName, r);
        process.stdout.write(`  · "${q}" → ${repos.length}\n`);
      } catch (e) {
        console.warn(`  ! "${q}" hata: ${e.message}`);
      }
    }

    for (const repo of collected.values()) {
      repo.domain = domain.id;
      if (seen[repo.fullName]) {
        // Havuzdan: kayıtlı yetenekleri kullan, README tekrar çekme
        const rec = seen[repo.fullName];
        repo.capabilities = rec.capabilities || [];
        repo.stars = repo.stars || rec.stars || 0;
      } else {
        // Yeni repo: README çek (kota dahilinde), yetenek çıkar
        if (readmeFetched < readmeCap) {
          repo.readme = await github.fetchReadme(repo.fullName, maxReadmeChars);
          readmeFetched++;
        }
        repo.capabilities = extractCapabilities(repo);
        newRepos.push(repo);
        seen[repo.fullName] = {
          firstSeen: new Date().toISOString().slice(0, 10),
          domain: domain.id,
          stars: repo.stars,
          capabilities: repo.capabilities,
        };
      }
      allCurrent.push(repo);
    }
  }

  store.saveSeen(seen);
  return { newRepos, allCurrent, totalSeen: Object.keys(seen).length };
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  console.log(`💸 Passive Income Engine — ${date}`);
  console.log(`   GitHub: ${github.hasToken() ? 'authenticated' : 'anonim'} · LLM: ${hasKey() ? 'aktif' : 'kapalı (heuristik)'}`);

  const { newRepos, allCurrent, totalSeen } = await discover();
  console.log(`\n📊 ${newRepos.length} yeni repo · havuzda ${totalSeen} repo · ${allCurrent.length} aktif aday`);

  // Skorla
  const weights = cfg.scoring.weights;
  const scored = allCurrent
    .filter((r) => (r.capabilities || []).length > 0)
    .map((r) => {
      const s = scoreRepo(r, cfg);
      return { ...r, scores: s, composite: composite(s, weights) };
    });

  // Fikir üret
  let ideas = generateIdeas(scored, cfg, { perRecipe: 2 });
  console.log(`💡 ${ideas.length} fikir üretildi`);

  // Opsiyonel LLM zenginleştirme
  ideas = await enrichIdeas(ideas, { max: 5 });

  // Geçmişe kaydet
  const history = store.loadIdeas();
  history.push({ date, count: ideas.length, top: ideas.slice(0, 5).map((i) => ({ title: i.title, score: i.score, repos: i.repos.map((r) => r.fullName) })) });
  store.saveIdeas(history);

  // Rapor yaz
  const content = buildReport({
    date,
    newRepos,
    totalSeen,
    ideas,
    domainsCount: cfg.domains.length,
    tokenUsed: github.hasToken(),
  });
  const file = writeReport(content, date);
  console.log(`\n✅ Rapor: ${path.relative(process.cwd(), file)}`);
  console.log(`   En son: income-engine/reports/LATEST.md`);

  if (ideas[0]) {
    console.log(`\n🏆 En iyi fikir: ${ideas[0].title} (skor ${(ideas[0].score * 100).toFixed(0)})`);
    console.log(`   Repolar: ${ideas[0].repos.map((r) => r.fullName).join(' + ')}`);
  }
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
