// Kalıcı durum: daha önce görülen repolar ve üretilen fikirler (idempotent çalışma için).
'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join(__dirname, '..', 'state');

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadJSON(name, fallback) {
  ensureDir();
  const p = path.join(STATE_DIR, name);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJSON(name, data) {
  ensureDir();
  fs.writeFileSync(path.join(STATE_DIR, name), JSON.stringify(data, null, 2) + '\n');
}

// Görülen repolar: { "owner/repo": { firstSeen, capabilities, scores... } }
const SEEN_FILE = 'seen-repos.json';
// Üretilen fikirler (deduplikasyon ve geçmiş için)
const IDEAS_FILE = 'ideas.json';

function loadSeen() { return loadJSON(SEEN_FILE, {}); }
function saveSeen(d) { saveJSON(SEEN_FILE, d); }
function loadIdeas() { return loadJSON(IDEAS_FILE, []); }
function saveIdeas(d) { saveJSON(IDEAS_FILE, d); }

module.exports = { loadSeen, saveSeen, loadIdeas, saveIdeas, STATE_DIR };
