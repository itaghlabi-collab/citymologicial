/**
 * notificationSound.js — Son notification ERP (HTML5 Audio + Web Audio, multi-navigateurs)
 */
let audioCtx = null;
let audioEl = null;
let wavUrl = null;
let unlocked = false;
let unlockListenersAttached = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

/** Génère un WAV double-bip en mémoire (pas de fichier externe). */
function buildNotificationWavUrl() {
  if (wavUrl) return wavUrl;
  const sampleRate = 22050;
  const durationSec = 0.45;
  const numSamples = Math.floor(sampleRate * durationSec);
  const pcm = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    if (t < 0.11) {
      sample = Math.sin(2 * Math.PI * 880 * t) * 0.55 * Math.exp(-t * 7);
    } else if (t >= 0.13 && t < 0.34) {
      sample = Math.sin(2 * Math.PI * 1318 * t) * 0.45 * Math.exp(-(t - 0.13) * 5);
    }
    pcm[i] = Math.max(-1, Math.min(1, sample)) * 32767;
  }

  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(offset, pcm[i], true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  wavUrl = URL.createObjectURL(blob);
  return wavUrl;
}

function getAudioElement() {
  if (typeof window === 'undefined') return null;
  if (!audioEl) {
    buildNotificationWavUrl();
    audioEl = new Audio(wavUrl);
    audioEl.preload = 'auto';
    audioEl.volume = 0.85;
  }
  return audioEl;
}

function playWebAudioChime() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const playTone = (freq, start, dur, vol) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };
    playTone(880, t, 0.1, 0.15);
    playTone(1318, t + 0.13, 0.14, 0.12);
    return true;
  } catch {
    return false;
  }
}

async function playHtmlAudio() {
  const el = getAudioElement();
  if (!el) return false;
  try {
    el.currentTime = 0;
    await el.play();
    return true;
  } catch {
    return false;
  }
}

/** Débloque l'audio (à appeler sur interaction utilisateur). */
export function unlockNotificationSound() {
  if (typeof window === 'undefined') return;
  getAudioElement();
  const ctx = getAudioContext();
  try {
    if (ctx?.state === 'suspended') {
      ctx.resume().then(() => { unlocked = true; }).catch(() => {});
    } else if (ctx) {
      unlocked = true;
    }
    const el = getAudioElement();
    if (el) {
      const prev = el.volume;
      el.volume = 0.001;
      const p = el.play();
      if (p?.then) {
        p.then(() => {
          el.pause();
          el.currentTime = 0;
          el.volume = prev;
          unlocked = true;
        }).catch(() => {
          el.volume = prev;
        });
      }
    }
  } catch {
    /* ignore */
  }
}

/** Joue le son — HTML5 Audio en priorité, Web Audio en secours. */
export async function playNotificationSound() {
  if (typeof window === 'undefined') return;
  unlockNotificationSound();

  const htmlOk = await playHtmlAudio();
  if (htmlOk) return;

  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }
  if (!playWebAudioChime()) {
    await new Promise((r) => setTimeout(r, 80));
    await playHtmlAudio();
  }
}

function detachUnlockListeners(listeners) {
  listeners.forEach(({ target, event, handler }) => {
    target.removeEventListener(event, handler);
  });
}

/** Réessaie le déblocage à chaque interaction jusqu'à succès. */
export function initNotificationSoundUnlock() {
  if (typeof window === 'undefined' || unlockListenersAttached) return () => {};
  unlockListenersAttached = true;

  const events = ['pointerdown', 'touchstart', 'keydown', 'click'];
  const listeners = [];

  const tryUnlock = () => {
    unlockNotificationSound();
    if (unlocked || audioEl) {
      detachUnlockListeners(listeners);
      unlockListenersAttached = false;
    }
  };

  events.forEach((event) => {
    const handler = tryUnlock;
    window.addEventListener(event, handler, { passive: true });
    document.addEventListener(event, handler, { passive: true });
    listeners.push({ target: window, event, handler });
    listeners.push({ target: document, event, handler });
  });

  const onVisible = () => {
    if (document.visibilityState === 'visible') tryUnlock();
  };
  document.addEventListener('visibilitychange', onVisible);
  listeners.push({ target: document, event: 'visibilitychange', handler: onVisible });

  return () => detachUnlockListeners(listeners);
}

export function isNotificationSoundUnlocked() {
  return unlocked || audioCtx?.state === 'running';
}
