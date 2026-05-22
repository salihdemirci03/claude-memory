# skill-radar

GitHub'ı periyodik olarak tarayıp **Claude Code skill adaylarını** keşfeden,
Claude API ile değerlendiren ve onay sonrası `~/.claude/skills/` altına kuran
bir keşif sistemi.

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
                                  (manuel onay)
                                       │
                                       ▼
                          ~/.claude/skills/<name>/
```

## Kurulum

```bash
cd skill-radar
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...     # opsiyonel ama rate limit için önerilir
```

## Kullanım

```bash
# Yeni adayları keşfet (config.yaml'daki query'leri çalıştırır)
python radar.py scan

# Bekleyen adayları listele
python radar.py list

# Bir adayın SKILL.md'sini incele
python radar.py show my-skill-name

# Onayla ve kullanıcı seviyesine kur (varsayılan)
python radar.py approve my-skill-name

# Veya proje seviyesine
python radar.py approve my-skill-name --local

# Reddet (bir daha gösterilmez)
python radar.py reject my-skill-name

# İstatistik
python radar.py status
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
