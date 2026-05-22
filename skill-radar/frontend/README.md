# skill-radar frontend (PWA)

Next.js 14 + Tailwind. Mobile-first. PWA olarak "Ana Ekrana Ekle" ile uygulama gibi durur.

## Geliştirme

```bash
# Terminal 1: backend
cd ../backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2: frontend
cd frontend
npm install                     # veya pnpm/bun install
echo "NEXT_PUBLIC_API_BASE=http://localhost:8000" > .env.local
npm run dev                     # http://localhost:3000
```

## Production build — tek port'tan serve

Frontend'i statik export et, FastAPI'den serve et:

```bash
cd frontend
npm run build                   # frontend/out/ üretir
# Backend tarafı zaten out/'u görüyorsa otomatik mount eder
cd ../backend
uvicorn main:app --port 8000    # http://localhost:8000 (hem API hem UI)
```

## Mobil cihazda denemek

1. Backend'i lokalde çalıştır (yukarıdaki "tek port" akışı)
2. Telefon ile aynı Wi-Fi'da olduğundan emin ol
3. Bilgisayarın IP'sini bul: `ifconfig | grep inet` (Mac) veya `ipconfig` (Win)
4. Telefondan `http://<bilgisayar-ip>:8000` aç
5. iOS Safari'de: Paylaş → "Ana Ekrana Ekle"
   Chrome'da: ⋮ menü → "Uygulamayı yükle"
6. Artık ana ekranında uygulama gibi açılır

## Yapı

```
app/
├── layout.tsx         # PWA meta, viewport
├── page.tsx           # Tüm UI (liste + detay modal + scan)
└── globals.css        # Tailwind + markdown stilleri
lib/
└── api.ts             # Backend fetch wrapper
public/
├── manifest.json
├── icon.svg
└── icon-{192,512}.png
```
