/**
 * auth.js — CITYMO Auth Service
 * Handles login validation, session persistence, and logout.
 * Architecture is ready for Supabase Auth / JWT / Railway backend replacement.
 *
 * To switch to a real backend:
 *   1. Replace `loginWithCredentials` body with: await supabase.auth.signInWithPassword(...)
 *   2. Replace `restoreSession` with: await supabase.auth.getSession()
 *   3. Replace `logout` with: await supabase.auth.signOut()
 */

const SESSION_KEY = 'citymo_session';

// ── Static credentials (replace with API call for production backend) ──────────
const AUTHORIZED_USERS = [
  {
    email: 'selim.moumni@gmail.com',
    password: 'Citymo@228',
    profile: {
      id: 'usr_001',
      nom: 'Selim Moumni',
      email: 'selim.moumni@gmail.com',
      role: 'Super Admin',
      initiales: 'SM',
    },
  },
];

/**
 * Attempt login with email + password.
 * Returns { success: true, user } or { success: false, error: string }
 */
export async function loginWithCredentials(email, password) {
  // Simulate async network latency (replace with real fetch when backend is ready)
  await delay(800);

  const match = AUTHORIZED_USERS.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!match) {
    return { success: false, error: 'Email ou mot de passe incorrect.' };
  }

  const token = generateToken(match.profile.id);
  const session = {
    token,
    user: match.profile,
    loggedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8h
  };

  persistSession(session);
  return { success: true, user: match.profile };
}

/**
 * Restore session from storage (call on app mount).
 * Returns user object if valid session exists, null otherwise.
 */
export function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.token || !session.user) return null;
    // Check expiry
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      clearSession();
      return null;
    }
    return session.user;
  } catch (_) {
    clearSession();
    return null;
  }
}

/**
 * Logout: clear session from storage.
 */
export function logout() {
  clearSession();
}

/**
 * Get current auth token (for API requests).
 */
export function getAuthToken() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.token || null;
  } catch (_) {
    return null;
  }
}

// ── Private helpers ──────────────────────────────────────────────────────────

function persistSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function generateToken(userId) {
  // Lightweight pseudo-token (replace with real JWT from backend)
  const rand = Math.random().toString(36).slice(2);
  const ts = Date.now().toString(36);
  return `citymo_${userId}_${ts}_${rand}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
