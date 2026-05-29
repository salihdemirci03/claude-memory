# ⏰ Haftalık Zamanlama (Remote Scheduled Agent)

Bu pipeline'ı Anthropic cloud'unda haftalık çalışan bir **remote scheduled agent** olarak
kurmak için aşağıdaki adımları izle. Agent her hafta bu repoyu klonlar, `node income-engine/run.js`
çalıştırır, yeni raporu ve güncellenen state'i commit + push eder. Senin makinen kapalı olsa
da çalışır.

## Etkinleştirme (tek adım)

Claude Code'da yeni bir oturumda şunu yaz:

> "income-engine'i her Pazartesi 09:00'da çalıştıran bir scheduled agent kur. Repo:
> salihdemirci03/claude-memory. Aşağıdaki SCHEDULING.md'deki trigger config'ini kullan."

Claude `RemoteTrigger` aracını yükleyip trigger'ı oluşturacaktır. Ya da doğrudan
https://claude.ai/code/scheduled üzerinden yönet.

## Hazır Trigger Yapılandırması

```json
{
  "name": "Passive Income Engine — haftalık",
  "cron_expression": "0 6 * * 1",
  "enabled": true,
  "job_config": {
    "ccr": {
      "environment_id": "<ENVIRONMENT_ID — claude.ai/code/scheduled'dan seç>",
      "session_context": {
        "model": "claude-sonnet-4-6",
        "sources": [
          {"git_repository": {"url": "https://github.com/salihdemirci03/claude-memory"}}
        ],
        "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
      },
      "events": [
        {"data": {
          "uuid": "<yeni lowercase v4 uuid>",
          "session_id": "",
          "type": "user",
          "parent_tool_use_id": null,
          "message": {
            "role": "user",
            "content": "income-engine pipeline'ını çalıştır ve sonuçları kaydet. Adımlar: 1) `cd income-engine && node run.js` çalıştır (GITHUB_TOKEN ve ANTHROPIC_API_KEY env'de varsa otomatik kullanılır). 2) Üretilen income-engine/reports/<tarih>-ideas.md ve LATEST.md raporunu oku. 3) En iyi 3 fikri kısaca değerlendir; mantıksız/alakasız eşleşme varsa bir cümleyle not düş. 4) Değişen tüm dosyaları (reports/, state/seen-repos.json, state/ideas.json) git add edip 'income-engine: haftalık çalışma <tarih>' mesajıyla commit et ve push et. 5) Push başarısız olursa 2-4-8-16s exponential backoff ile 4 kez dene. Yeni PR AÇMA. Kısa bir özet bırak: kaç yeni repo, kaç fikir, en iyi fikir ne."
          }
        }}
      ]
    }
  }
}
```

## Notlar

- **Zaman:** `0 6 * * 1` = her Pazartesi 06:00 UTC = **09:00 Europe/Istanbul**. (Mevcut
  github-star-analyzer da Pazartesi 09:00'da çalışıyordu; bu onun bir üst katmanı.)
- **Minimum aralık 1 saat.** Haftalık ideal: havuz birikir, fikirler çeşitlenir.
- **Token önerisi:** Trigger ortamında `GITHUB_TOKEN` ayarlamak rate limit'i 60→5000/saat
  yapar ve çalışmayı hızlandırır. `ANTHROPIC_API_KEY` eklersen fikirler LLM ile zenginleşir.
- **Branch:** Trigger varsayılan branch'e (genelde `main`) push eder. Şu an kod
  `claude/passive-income-automation-jXVV1` branch'inde; merge ettikten sonra trigger'ı kur.
- Trigger ID'sini aldıktan sonra: `https://claude.ai/code/scheduled/<TRIGGER_ID>`
