import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0e14',
        card: '#151921',
        border: '#252a36',
        accent: '#6c8eef',
        muted: '#8b93a7',
      },
    },
  },
  plugins: [],
};

export default config;
