/** @type {import('next').NextConfig} */
const nextConfig = {
  // Statik export — FastAPI'den serve etmek için 'frontend/out' üretir.
  // Geliştirme sırasında `next dev` ile çalışır, output ayarı sadece build'i etkiler.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
