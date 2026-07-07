/**
 * notificationSound.js — Son à l'arrivée d'une notification ERP
 */
let audioCtx = null;
let unlocked = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

/** Débloque l'audio après un geste utilisateur (requis Chrome/Safari). */
export function unlockNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => { unlocked = true; }).catch(() => {});
    } else {
      unlocked = true;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch {
    /* ignore */
  }
}

function playTone(ctx, frequency, startAt, duration, volume = 0.12) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Double tonalité type « notification » (discret mais audible). */
export function playNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const t = ctx.currentTime;
    playTone(ctx, 880, t, 0.1, 0.1);
    playTone(ctx, 1318.5, t + 0.12, 0.14, 0.09);
  } catch {
    /* ignore */
  }
}

/** Écoute le premier clic/touche pour autoriser le son. */
export function initNotificationSoundUnlock() {
  if (typeof window === 'undefined') return () => {};
  const unlock = () => unlockNotificationSound();
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

export function isNotificationSoundUnlocked() {
  return unlocked && audioCtx?.state === 'running';
}
