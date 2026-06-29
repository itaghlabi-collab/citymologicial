/**
 * scanFeedback.js — Retour audio / visuel après scan douchette
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      audioCtx = null;
    }
  }
  return audioCtx;
}

/** Bip court succès ou erreur (si le navigateur autorise l'audio). */
export function playScanBeep(type = 'success') {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = type === 'success' ? 880 : 220;
    gain.gain.value = 0.08;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (type === 'success' ? 0.12 : 0.25));
    osc.stop(ctx.currentTime + (type === 'success' ? 0.12 : 0.25));
  } catch {
    /* audio non disponible */
  }
}

export function articleScanLabel(article) {
  if (!article) return '';
  const code = article.code || article.reference || '';
  const name = article.designation || article.nom || '';
  return code ? `${code} — ${name}` : name;
}
