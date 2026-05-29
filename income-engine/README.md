# 💸 Passive Income Engine

Sürekli yeni GitHub repoları keşfedip yeteneklerini **kombinleyerek** somut pasif gelir
fikirleri üreten otomasyon. Her çalışmada gelir potansiyeli, pasiflik ve kurulum eforuna
göre sıralı bir markdown rapor üretir.

Bu, mevcut `github-star-analyzer` otomasyonunun bir üst seviyesi: o sadece starred repoları
tarıyordu; bu, dört alanda (AI/agent, SaaS/API, içerik/medya, veri/scraping) **yeni** repolar
keşfedip ikili/üçlü kombinasyonlardan iş fikirleri çıkarıyor.

## Akış

```
discover  → GitHub Search API ile 4 alanda yeni repolar bul (idempotent: görülenler atlanır)
analyze   → README + topic + açıklamadan yetenek çıkar, 0-1 alt skorlar hesapla
combine   → yetenekleri "gelir reçeteleri" ile eşleştir → fikir üret + skorla
report    → reports/<tarih>-ideas.md ve reports/LATEST.md yaz
```

## Çalıştırma

```bash
cd income-engine
node run.js
```

Bağımlılık yok (saf Node.js 18+, yerleşik `fetch`).

### Ortam değişkenleri (opsiyonel ama önerilir)

| Değişken | Etki |
|----------|------|
| `GITHUB_TOKEN` | Rate limit 60→5000/saat. Token'sız da çalışır ama yavaş (throttle 7s). |
| `ANTHROPIC_API_KEY` | En iyi 5 fikre LLM ile somut "ilk hamle" notu ekler (Haiku, ~birkaç cent). |
| `INCOME_ENGINE_MODEL` | LLM modelini değiştir (varsayılan `claude-haiku-4-5-20251001`). |

## Yapılandırma

`config.json` — keşif alanları, arama sorguları, eşikler ve skor ağırlıkları.
Yeni bir alan veya sorgu eklemek için `domains` dizisini düzenle. Yeni bir gelir modeli
eklemek için `lib/combine.js` içindeki `RECIPES` dizisine ekle, yeni bir yetenek için
`lib/analyze.js` içindeki `CAPABILITIES` dizisine ekle.

## Dosyalar

```
config.json          alanlar, sorgular, ağırlıklar
run.js               orkestratör
lib/github.js        Search API + README (throttle + retry)
lib/analyze.js       yetenek taksonomisi + repo skorlama
lib/combine.js       gelir reçeteleri + kombinasyon motoru
lib/llm.js           opsiyonel LLM zenginleştirme
lib/report.js        markdown rapor
state/seen-repos.json    görülen repolar (idempotency hafızası — commit edilir)
state/ideas.json         üretilen fikir geçmişi
reports/                 tarihli raporlar + LATEST.md
```

## Zamanlama

Haftalık çalışan bir **remote scheduled agent** olarak kurulur (Anthropic cloud).
Trigger her hafta bu repoyu klonlar, `node run.js` çalıştırır, raporu commit + push eder.
Detay için ana repo köküne bakın.

## Uyarı

Üretilen fikirler **otomatik başlangıç noktalarıdır**, doğrulanmış iş planları değil.
Ticari kullanımdan önce repoların lisanslarını kontrol et ve pazar doğrulaması yap.
