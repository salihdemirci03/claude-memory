# skill-radar

GitHub'ı periyodik olarak tarayıp **Claude Code skill adaylarını** keşfeden,
Claude API ile değerlendiren ve onay sonrası `~/.claude/skills/` altına kuran
bir keşif sistemi.

**3 katmanı var:**

1. `radar.py` — CLI çekirdeği (scan, list, approve, reject)
2. `backend/` — FastAPI, radar.py'yi REST API olarak sunar
3. `frontend/` — Next.js PWA, telefondan da kullanılır

## Hızlı başlangıç (tek port, hem UI hem API)

```bash
# 1) Bağımlılıklar
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r backend/requirements.txt
(cd frontend && bun install || npm install)

# 2) Frontend'i statik build et (FastAPI bunu otomatik mount eder)
(cd frontend && npm run build)

# 3) API key'leri ayarla
export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...

# 4) Çalıştır
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
# → http://localhost:8000  (hem UI hem /api/* aynı port)
```

Telefondan açmak için: bilgisayarın LAN IP'sini bul (`ifconfig` / `ipconfig`),
telefonun aynı Wi-Fi'da olduğundan emin ol, telefonun tarayıcısında
`http://<ip>:8000` aç. iOS Safari'de **Paylaş → Ana Ekrana Ekle**; Android
Chrome'da **⋮ → Uygulamayı yükle**. App ikon olarak ana ekranına gelir.

## Sadece CLI kullanmak istiyorsan

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...
python radar.py scan
python radar.py list
python radar.py show <name>
python radar.py approve <name>
```

## Backend tek başına

```bash
cd backend
uvicorn main:app --reload --port 8000
# → http://localhost:8000/docs (Swagger UI)
```

## Frontend geliştirme modu

```bash
cd frontend
echo "NEXT_PUBLIC_API_BASE=http://localhost:8000" > .env.local
npm run dev      # http://localhost:3000 — backend ayrı port'ta çalışırken
```

## Akış

```
GitHub Search ──► Pre-filter ──► Claude (analiz)
                                       │
                                       ▼
                              is_skill? & score≥6
                                       │
                                       ▼
                              Claude (SKILL.md üret)
                                       │
                                       ▼
                          candidates/<name>/SKILL.md
                                       │
                              (PWA'dan veya CLI'dan onay)
                                       │
                                       ▼
                          ~/.claude/skills/<name>/
```

## API endpoint'leri

| Method | Path | Açıklama |
|--------|------|----------|
| GET    | `/api/health` | sağlık kontrolü |
| GET    | `/api/status` | DB istatistikleri |
| GET    | `/api/candidates` | bekleyen adayların listesi |
| GET    | `/api/candidates/{name}` | aday detayı (SKILL.md dahil) |
| POST   | `/api/candidates/{name}/approve` | kur (body: `{"target":"global"\|"local"}`) |
| POST   | `/api/candidates/{name}/reject` | reddet |
| POST   | `/api/scan` | yeni bir tarama başlat (background) |
| GET    | `/api/scan/status` | tarama durumu (polling için) |

## API key olmadan demo

```bash
python demo_scan.py     # Mock GitHub + Mock Claude, akışı tam görmek için
```

## Otomasyon (cron örneği)

```cron
# Her gün 09:00'da tara, çıktıyı log dosyasına yaz
0 9 * * * cd /path/to/skill-radar && /path/to/.venv/bin/python radar.py scan >> radar.log 2>&1
```

## Yapılandırma — `config.yaml`

- `queries[]` — GitHub search sorguları (`q`, `sort`)
- `filters` — yıldız min, repo size max, fork/archived hariç
- `scoring.min_score` — Claude'un verdiği 1-10 skoru için eşik (varsayılan 6)
- `limits.max_candidates_per_scan` — tarama başına Claude'a yollanacak max aday

## Veritabanı

`radar.db` (SQLite) — görülen her repo işaretlenir, ikinci taramada tekrar
analiz için Claude'a yollanmaz. Status değerleri: `candidate`, `approved`,
`rejected`, `skipped`.

## Testler

```bash
python tests/test_helpers.py
```

## Sınırlamalar

- Şu an sadece GitHub. v2: HN, Reddit, Twitter eklenecek.
- Otomatik kurulum YOK — her aday manuel onaylanır (güvenlik için).
- Skill'in çalışıp çalışmadığı doğrulanmaz; sadece SKILL.md taslağı üretilir.
- Auth yok; tek kullanıcılık. Birden fazla kişi için reverse-proxy + basic auth ekle.
