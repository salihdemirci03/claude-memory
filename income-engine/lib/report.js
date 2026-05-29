// Markdown rapor üreticisi.
'use strict';

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

function bar(v, n = 5) {
  const filled = Math.round(v * n);
  return '█'.repeat(filled) + '░'.repeat(n - filled);
}

function buildReport({ date, newRepos, totalSeen, ideas, domainsCount, tokenUsed }) {
  const top = ideas.slice(0, 12);
  const lines = [];
  lines.push(`# 💸 Pasif Gelir Fikirleri — ${date}`);
  lines.push('');
  lines.push(`> Otomatik üretildi · ${newRepos.length} yeni repo keşfedildi · toplam ${totalSeen} repo havuzda · ${ideas.length} fikir üretildi`);
  lines.push(`> Keşif: GitHub API${tokenUsed ? ' (authenticated)' : ' (anonim)'} · ${domainsCount} alan`);
  lines.push('');
  lines.push('Skor = gelir potansiyeli + pasiflik + repo kalitesi − kurulum eforu. Yüksek skor = daha cazip fırsat.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 🏆 En İyi Fikirler');
  lines.push('');

  top.forEach((idea, i) => {
    lines.push(`### ${i + 1}. ${idea.title}  ·  skor ${(idea.score * 100).toFixed(0)}/100`);
    lines.push('');
    lines.push(idea.model);
    lines.push('');
    lines.push(`- **Gelir modeli:** ${idea.pricing}`);
    lines.push(`- **Gelir potansiyeli:** ${bar(idea.revenue)}  ·  **Pasiflik:** ${bar(idea.passive)}  ·  **Kurulum eforu:** ${bar(idea.effort)}`);
    lines.push(`- **Kombinlenen repolar:**`);
    for (const r of idea.repos) {
      lines.push(`  - [${r.fullName}](${r.url}) ★${r.stars} — ${r.role}${r.description ? ': ' + r.description.slice(0, 90) : ''}`);
    }
    if (idea.llmNotes) {
      lines.push('');
      lines.push(`  > 🤖 ${idea.llmNotes}`);
    }
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('## 🆕 Bu Çalışmada Keşfedilen Yeni Repolar');
  lines.push('');
  if (newRepos.length === 0) {
    lines.push('_Yeni repo bulunamadı (havuz güncel)._');
  } else {
    lines.push('| Repo | ★ | Alan | Yetenekler |');
    lines.push('|------|---|------|------------|');
    for (const r of newRepos.slice(0, 40)) {
      const caps = (r.capabilities || []).slice(0, 3).map((c) => c.label).join(', ');
      lines.push(`| [${r.fullName}](${r.url}) | ${r.stars} | ${r.domain} | ${caps || '—'} |`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('_⚠️ Bu fikirler otomatik üretilmiş başlangıç noktalarıdır; pazar doğrulaması ve lisans kontrolü senin kararın. Repoların lisanslarını ticari kullanımdan önce kontrol et._');
  lines.push('');
  return lines.join('\n');
}

function writeReport(content, date) {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `${date}-ideas.md`);
  fs.writeFileSync(file, content);
  // En son raporu kök seviyede de tut (kolay erişim)
  fs.writeFileSync(path.join(REPORTS_DIR, 'LATEST.md'), content);
  return file;
}

module.exports = { buildReport, writeReport, REPORTS_DIR };
