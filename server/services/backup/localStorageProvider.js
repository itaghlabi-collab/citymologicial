/**
 * Stockage local sur disque Railway (fallback / dev).
 */
const fs = require('fs');
const path = require('path');

const BASE_DIR = process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), 'data', 'backups');

function resolvePath(filePath) {
  const full = path.join(BASE_DIR, filePath);
  if (!full.startsWith(BASE_DIR)) {
    throw new Error('Chemin de sauvegarde invalide.');
  }
  return full;
}

async function upload(filePath, buffer) {
  const full = resolvePath(filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return { path: filePath, bucket: 'local' };
}

async function download(filePath) {
  const full = resolvePath(filePath);
  if (!fs.existsSync(full)) throw new Error('Fichier sauvegarde introuvable.');
  return fs.readFileSync(full);
}

async function getSignedUrl(filePath) {
  return `file://${resolvePath(filePath)}`;
}

async function remove(filePath) {
  const full = resolvePath(filePath);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

async function list(prefix) {
  const dir = resolvePath(prefix || '.');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => ({ name }));
}

module.exports = { upload, download, getSignedUrl, remove, list };
