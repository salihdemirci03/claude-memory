// Opsiyonel LLM zenginleştirme. ANTHROPIC_API_KEY varsa en iyi fikirleri somutlaştırır.
// Yoksa sessizce atlanır (heuristik çıktı yeterlidir). Harici SDK gerektirmez (fetch).
'use strict';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.INCOME_ENGINE_MODEL || 'claude-haiku-4-5-20251001';

async function enrichIdeas(ideas, { max = 5 } = {}) {
  if (!KEY || ideas.length === 0) return ideas;
  const top = ideas.slice(0, max);

  const prompt = `Aşağıda GitHub repolarının yeteneklerini birleştirerek üretilmiş pasif gelir fikirleri var.
Her fikir için TEK cümlelik, somut ve eyleme dönük bir "ilk hamle" notu yaz (Türkçe, en fazla 25 kelime):
ilk MVP'de tam olarak ne yapılmalı ve ilk gelir nasıl test edilir.

Fikirler:
${top.map((it, i) => `${i + 1}. ${it.title} — ${it.model} (repolar: ${it.repos.map((r) => r.fullName).join(', ')})`).join('\n')}

Sadece geçerli JSON dizisi döndür: [{"i":1,"note":"..."}, ...]. Başka metin yok.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      console.warn(`  [llm] zenginleştirme atlandı (HTTP ${res.status})`);
      return ideas;
    }
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || '').join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return ideas;
    const notes = JSON.parse(match[0]);
    for (const n of notes) {
      const idx = n.i - 1;
      if (top[idx]) top[idx].llmNotes = n.note;
    }
    console.log(`  [llm] ${notes.length} fikir ${MODEL} ile zenginleştirildi`);
  } catch (e) {
    console.warn(`  [llm] zenginleştirme hatası: ${e.message}`);
  }
  return ideas;
}

module.exports = { enrichIdeas, hasKey: () => Boolean(KEY) };
