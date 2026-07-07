/**
 * notificationSound.js — Alarme 3 bips (fichier statique + secours Web Audio)
 */
const ALARM_SOUND_URL = '/sounds/notification-alarm-v3.wav';
const SOUND_REVISION = 'alarm-v3';

let audioCtx = null;
let audioEl = null;
let unlocked = false;
let unlockListenersAttached = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

function resetAudioElement() {
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
    audioEl = null;
  }
}

function ensureSoundRevision() {
  if (typeof window === 'undefined') return;
  try {
    const key = 'citymo_notif_sound_rev';
    if (localStorage.getItem(key) !== SOUND_REVISION) {
      localStorage.setItem(key, SOUND_REVISION);
      resetAudioElement();
    }
  } catch {
    /* ignore */
  }
}

function getAudioElement() {
  if (typeof window === 'undefined') return null;
  ensureSoundRevision();
  if (!audioEl) {
    audioEl = new Audio(ALARM_SOUND_URL);
    audioEl.preload = 'auto';
    audioEl.volume = 1;
  }
  return audioEl;
}

function playWebAudioChime() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const playAlarmBeep = (freq, start, dur, vol) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(vol, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };
    playAlarmBeep(1180, t, 0.14, 0.28);
    playAlarmBeep(1180, t + 0.2, 0.14, 0.28);
    playAlarmBeep(1580, t + 0.4, 0.22, 0.32);
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
    resetAudioElement();
    try {
      const retry = getAudioElement();
      if (!retry) return false;
      retry.currentTime = 0;
      await retry.play();
      return true;
    } catch {
      return false;
    }
  }
}

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

export async function playNotificationSound() {
  if (typeof window === 'undefined') return;
  ensureSoundRevision();
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
