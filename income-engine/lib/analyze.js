// Yetenek çıkarımı ve repo skorlama (heuristik, LLM gerektirmez).
'use strict';

// Yetenek taksonomisi: her yeteneğin keyword'leri + gelir potansiyeli ipucu.
// monetization: bu yeteneğin tek başına paraya dönüşme kolaylığı (0-1)
// passive: bir kez kurulunca insan müdahalesi olmadan çalışabilirlik (0-1)
const CAPABILITIES = [
  { id: 'text-gen',    label: 'Metin/LLM üretimi', kw: ['llm', 'gpt', 'language model', 'text generation', 'chatbot', 'completion', 'prompt', 'claude', 'openai'], monetization: 0.7, passive: 0.7 },
  { id: 'agent',       label: 'Otonom agent', kw: ['agent', 'autonomous', 'orchestrat', 'multi-agent', 'tool use', 'react loop', 'planner'], monetization: 0.6, passive: 0.8 },
  { id: 'image-gen',   label: 'Görsel üretimi', kw: ['image generation', 'stable diffusion', 'text-to-image', 'img2img', 'inpaint', 'flux', 'dall'], monetization: 0.8, passive: 0.7 },
  { id: 'video-gen',   label: 'Video üretimi', kw: ['video generation', 'text-to-video', 'video editing', 'clip', 'reels', 'shorts', 'ffmpeg pipeline'], monetization: 0.85, passive: 0.6 },
  { id: 'voice',       label: 'Ses/TTS/STT', kw: ['text-to-speech', 'tts', 'speech', 'voice clone', 'whisper', 'transcrib', 'audio gen'], monetization: 0.75, passive: 0.7 },
  { id: 'scraping',    label: 'Scraping/veri toplama', kw: ['scrap', 'crawler', 'crawl', 'extract data', 'web extraction', 'spider', 'harvest'], monetization: 0.7, passive: 0.85 },
  { id: 'data-api',    label: 'Veri/dataset API', kw: ['dataset', 'data api', 'data pipeline', 'etl', 'data extraction', 'structured data', 'parser'], monetization: 0.65, passive: 0.8 },
  { id: 'payments',    label: 'Ödeme/abonelik', kw: ['stripe', 'payment', 'subscription', 'billing', 'paddle', 'checkout', 'lemonsqueezy'], monetization: 0.9, passive: 0.9 },
  { id: 'auth',        label: 'Auth/kullanıcı', kw: ['auth', 'authentication', 'oauth', 'login', 'user management', 'clerk', 'supabase auth'], monetization: 0.4, passive: 0.8 },
  { id: 'saas-kit',    label: 'SaaS iskeleti', kw: ['saas', 'boilerplate', 'starter kit', 'template', 'nextjs starter', 'multi-tenant'], monetization: 0.75, passive: 0.7 },
  { id: 'api-wrap',    label: 'API sarmalayıcı', kw: ['api wrapper', 'rest api', 'sdk', 'client library', 'gateway', 'proxy api'], monetization: 0.6, passive: 0.85 },
  { id: 'automation',  label: 'Otomasyon/workflow', kw: ['automation', 'workflow', 'cron', 'scheduler', 'no-code', 'zapier', 'n8n', 'pipeline'], monetization: 0.7, passive: 0.9 },
  { id: 'social',      label: 'Sosyal medya', kw: ['social media', 'twitter', 'instagram', 'tiktok', 'linkedin', 'post scheduler', 'engagement'], monetization: 0.7, passive: 0.75 },
  { id: 'seo-content', label: 'SEO/içerik', kw: ['seo', 'blog', 'content marketing', 'article', 'newsletter', 'copywriting'], monetization: 0.7, passive: 0.8 },
  { id: 'analytics',   label: 'Analitik/dashboard', kw: ['analytics', 'dashboard', 'metrics', 'reporting', 'visualization', 'insights'], monetization: 0.6, passive: 0.8 },
  { id: 'ecommerce',   label: 'E-ticaret', kw: ['ecommerce', 'shopify', 'store', 'product listing', 'dropship', 'affiliate'], monetization: 0.8, passive: 0.7 },
  { id: 'pdf-docs',    label: 'Doküman/PDF', kw: ['pdf', 'document', 'invoice', 'report generation', 'docx', 'ocr'], monetization: 0.65, passive: 0.85 },
  { id: 'vector-db',   label: 'Vektör/arama', kw: ['vector', 'embedding', 'semantic search', 'rag', 'retrieval', 'pinecone', 'qdrant'], monetization: 0.5, passive: 0.8 },
];

function extractCapabilities(repo) {
  const hay = `${repo.description} ${(repo.topics || []).join(' ')} ${repo.readme || ''}`.toLowerCase();
  const found = [];
  for (const cap of CAPABILITIES) {
    let hits = 0;
    for (const k of cap.kw) if (hay.includes(k)) hits++;
    if (hits > 0) found.push({ id: cap.id, label: cap.label, hits, monetization: cap.monetization, passive: cap.passive });
  }
  // En çok eşleşen yetenekleri öne al
  return found.sort((a, b) => b.hits - a.hits);
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// Repo başına 0-1 arası alt skorlar üretir.
function scoreRepo(repo, cfg) {
  const caps = repo.capabilities || extractCapabilities(repo);
  const sat = cfg.scoring.starsSaturation || 4000;
  const starsScore = clamp01(Math.log10(1 + repo.stars) / Math.log10(1 + sat));

  const pushedDays = (Date.now() - new Date(repo.pushedAt).getTime()) / 86400_000;
  const recencyScore = clamp01(1 - pushedDays / 180); // 6 aydan eskiyse 0'a yaklaşır

  const capFit = caps.length === 0 ? 0 : clamp01(caps.slice(0, 3).reduce((s, c) => s + Math.min(c.hits, 3) / 3, 0) / 3);
  const monetization = caps.length === 0 ? 0.3 : caps.slice(0, 3).reduce((s, c) => Math.max(s, c.monetization), 0);
  const passiveness = caps.length === 0 ? 0.4 : caps.slice(0, 3).reduce((s, c) => s + c.passive, 0) / Math.min(caps.length, 3);

  return { starsScore, recencyScore, capFit, monetization, passiveness };
}

module.exports = { CAPABILITIES, extractCapabilities, scoreRepo, clamp01 };
