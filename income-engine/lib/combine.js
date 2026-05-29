// Kombinasyon motoru: keşfedilen repoların yeteneklerini "gelir reçeteleri" ile eşleştirip
// somut pasif gelir fikirleri üretir. LLM gerektirmez; varsa generate.js içinde zenginleştirilir.
'use strict';

// Reçeteler: belirli yetenek kombinasyonları -> gelir modeli.
// need: gerekli yetenek id'leri (her slot için repo eşleştirilir)
// revenue/effort/passive: 0-1 (revenue=potansiyel, effort=kurulum eforu [düşük iyi], passive=otonomluk)
const RECIPES = [
  {
    id: 'scrape-to-digest',
    need: ['scraping', 'text-gen'],
    title: 'Niş Otomatik Bülten / Digest SaaS',
    model: 'Belirli bir niş için web kaynaklarını sürekli tarayıp LLM ile özetleyen, abonelik bazlı günlük/haftalık bülten servisi.',
    pricing: 'Aylık $5-15 abonelik veya sponsorlu bülten.',
    revenue: 0.7, effort: 0.4, passive: 0.85,
  },
  {
    id: 'scrape-data-api',
    need: ['scraping', 'data-api'],
    title: 'Veri-as-a-Service API',
    model: 'Toplanan/temizlenen niş veriyi (fiyatlar, ilanlar, trendler) ücretli API veya CSV aboneliği olarak satmak.',
    pricing: 'API çağrısı başına veya $20-99/ay kademeli plan.',
    revenue: 0.75, effort: 0.5, passive: 0.85,
  },
  {
    id: 'image-social',
    need: ['image-gen', 'social'],
    title: 'Otomatik Sosyal Medya İçerik Stüdyosu',
    model: 'Markalar için AI görsel üretip otomatik zamanlayan/paylaşan içerik servisi (faceless brand sayfaları dahil).',
    pricing: 'Marka başına $49-199/ay yönetim ücreti.',
    revenue: 0.8, effort: 0.5, passive: 0.7,
  },
  {
    id: 'video-shorts',
    need: ['video-gen', 'automation'],
    title: 'Faceless Short-Form Video Fabrikası',
    model: 'Konudan otomatik kısa video (Shorts/Reels/TikTok) üretip kanallara yükleyen pipeline; reklam + affiliate geliri.',
    pricing: 'Reklam paylaşımı, sponsorluk, veya $30-100/ay üretim aboneliği.',
    revenue: 0.8, effort: 0.6, passive: 0.65,
  },
  {
    id: 'voice-content',
    need: ['voice', 'text-gen'],
    title: 'Otomatik Podcast / Sesli İçerik Kanalı',
    model: 'Metin içeriğini sese çevirip otomatik podcast/sesli makale kanalı; reklam ve premium abonelik.',
    pricing: 'Reklam + $5/ay premium feed.',
    revenue: 0.65, effort: 0.45, passive: 0.8,
  },
  {
    id: 'seo-content-engine',
    need: ['seo-content', 'text-gen'],
    title: 'Programatik SEO İçerik Sitesi',
    model: 'Anahtar kelime kümeleri için otomatik makale üreten, affiliate/AdSense ile gelir sağlayan içerik ağı.',
    pricing: 'AdSense + affiliate komisyonu; site portföyü satışı.',
    revenue: 0.7, effort: 0.4, passive: 0.85,
  },
  {
    id: 'api-monetize',
    need: ['api-wrap', 'payments'],
    title: 'Paketlenmiş Ücretli API (API-as-a-Product)',
    model: 'Karmaşık bir yeteneği basit, ölçülen, ücretli bir API olarak paketleyip satmak (rate-limit + faturalama).',
    pricing: 'Freemium + kullanım bazlı; $9-49/ay planlar.',
    revenue: 0.7, effort: 0.45, passive: 0.85,
  },
  {
    id: 'saas-micro',
    need: ['saas-kit', 'payments'],
    title: 'Tek Özellikli Mikro-SaaS',
    model: 'Hazır SaaS iskeleti + ödeme ile dar bir acıyı çözen küçük araç; düşük bakım, abonelik geliri.',
    pricing: '$9-29/ay abonelik veya tek seferlik lisans.',
    revenue: 0.7, effort: 0.5, passive: 0.8,
  },
  {
    id: 'agent-saas',
    need: ['agent', 'api-wrap'],
    title: 'Dikey AI Agent SaaS',
    model: 'Belirli bir iş akışını (destek, araştırma, raporlama) baştan sona yapan agent\'ı SaaS olarak sunmak.',
    pricing: 'Koltuk başına $20-99/ay veya iş başına ücret.',
    revenue: 0.75, effort: 0.6, passive: 0.75,
  },
  {
    id: 'rag-knowledge',
    need: ['vector-db', 'text-gen'],
    title: 'Niş Bilgi Asistanı (RAG)',
    model: 'Belirli bir doküman/veri kümesi üzerine soru-cevap asistanı; B2B abonelik.',
    pricing: 'Kurum başına $50-500/ay.',
    revenue: 0.65, effort: 0.55, passive: 0.8,
  },
  {
    id: 'doc-automation',
    need: ['pdf-docs', 'automation'],
    title: 'Doküman Otomasyonu Servisi',
    model: 'Fatura/sözleşme/rapor üretimi veya OCR ile veri çıkarımını otomatikleştiren ücretli servis.',
    pricing: 'Doküman başına veya $19-99/ay.',
    revenue: 0.65, effort: 0.45, passive: 0.85,
  },
  {
    id: 'data-dashboard',
    need: ['data-api', 'analytics'],
    title: 'Niş Analitik Dashboard Aboneliği',
    model: 'Toplanan veriyi anlamlı bir dashboard\'a çevirip karar vericilere abonelikle sunmak.',
    pricing: '$29-149/ay abonelik.',
    revenue: 0.65, effort: 0.5, passive: 0.8,
  },
  {
    id: 'ecommerce-content',
    need: ['ecommerce', 'image-gen'],
    title: 'Otomatik Ürün İçeriği / Dropship Asistanı',
    model: 'Ürün görselleri ve açıklamalarını otomatik üreten, mağazalara entegre araç.',
    pricing: 'Mağaza başına $29-99/ay veya komisyon.',
    revenue: 0.7, effort: 0.5, passive: 0.75,
  },
  {
    id: 'agent-content-loop',
    need: ['agent', 'seo-content', 'social'],
    title: 'Uçtan Uca Otonom İçerik İşletmesi',
    model: 'Trend bul -> içerik üret -> yayınla -> dağıt döngüsünü tek agent ile yöneten otonom içerik markası.',
    pricing: 'Reklam + affiliate + ürün satışı; çoklu gelir akışı.',
    revenue: 0.8, effort: 0.7, passive: 0.7,
  },
];

// Yetenek id -> okunabilir etiket (rol gösterimi için).
const { CAPABILITIES } = require('./analyze');
const CAP_LABEL = Object.fromEntries(CAPABILITIES.map((c) => [c.id, c.label]));

// Repolardan yetenek -> repo indeksini kurar (composite skora göre sıralı).
function indexByCapability(scoredRepos) {
  const idx = {};
  for (const r of scoredRepos) {
    for (const c of r.capabilities) {
      (idx[c.id] = idx[c.id] || []).push(r);
    }
  }
  for (const k of Object.keys(idx)) idx[k].sort((a, b) => b.composite - a.composite);
  return idx;
}

// Reçeteleri repolarla eşleştirip fikir üretir.
function generateIdeas(scoredRepos, cfg, { perRecipe = 2 } = {}) {
  const idx = indexByCapability(scoredRepos);
  const ideas = [];

  for (const recipe of RECIPES) {
    // Her gerekli yetenek için aday repolar var mı?
    const slots = recipe.need.map((cap) => idx[cap] || []);
    if (slots.some((s) => s.length === 0)) continue;

    // Primary slot için top-N varyant, diğerleri için top-1 (çeşitlilik + sınırlı kombinasyon)
    const primaryVariants = slots[0].slice(0, perRecipe);
    for (const primary of primaryVariants) {
      // repoSet öğeleri: { repo, role } — role reçetenin o slottaki gereksinimi
      const repoSet = [{ repo: primary, role: recipe.need[0] }];
      const used = new Set([primary.fullName]);
      let ok = true;
      for (let i = 1; i < slots.length; i++) {
        const pick = slots[i].find((r) => !used.has(r.fullName));
        if (!pick) { ok = false; break; }
        used.add(pick.fullName);
        repoSet.push({ repo: pick, role: recipe.need[i] });
      }
      if (!ok) continue;

      const repoScoreAvg = repoSet.reduce((s, x) => s + x.repo.composite, 0) / repoSet.length;
      // Fikir skoru: reçete gelir/pasiflik + repo kalitesi - efor
      const score =
        0.35 * recipe.revenue +
        0.2 * recipe.passive +
        0.3 * repoScoreAvg +
        0.15 * (1 - recipe.effort);

      ideas.push({
        recipeId: recipe.id,
        title: recipe.title,
        model: recipe.model,
        pricing: recipe.pricing,
        revenue: recipe.revenue,
        effort: recipe.effort,
        passive: recipe.passive,
        score: Number(score.toFixed(4)),
        repos: repoSet.map((x) => ({
          fullName: x.repo.fullName,
          url: x.repo.url,
          stars: x.repo.stars,
          description: x.repo.description,
          role: CAP_LABEL[x.role] || '',
        })),
        key: recipe.id + '|' + repoSet.map((x) => x.repo.fullName).sort().join('+'),
      });
    }
  }

  // Aynı repo-seti + reçete tekrarını ele, skora göre sırala
  const seen = new Set();
  const unique = [];
  for (const idea of ideas.sort((a, b) => b.score - a.score)) {
    if (seen.has(idea.key)) continue;
    seen.add(idea.key);
    unique.push(idea);
  }
  return unique;
}

module.exports = { RECIPES, generateIdeas, indexByCapability };
