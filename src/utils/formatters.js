/**
 * formatters.js — CITYMO Utility Formatters
 *
 * Centralized formatting helpers for dates, numbers, currencies, etc.
 * Used across all modules.
 */

/**
 * Format a number as Moroccan Dirham (MAD).
 * @param {number|string} amount
 * @param {boolean} [compact] - Use compact notation (K / M)
 */
export function roundMoney(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/** MAD with exactly 2 decimals — avoids float artifacts like 32717.240000000005 */
export function formatMADPrecise(amount) {
  return roundMoney(amount).toLocaleString('fr-MA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' MAD';
}

export function formatMAD(amount, compact = false) {
  const n = roundMoney(amount);
  if (compact) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M MAD';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + ' K MAD';
  }
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

/**
 * Format a number compactly (K / M).
 * @param {number} n
 */
export function formatCompact(n) {
  const v = roundMoney(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + ' M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + ' K';
  return v.toLocaleString('fr-FR');
}

/**
 * Format an ISO date string to a localized French date.
 * @param {string} isoStr - e.g. "2026-01-15T10:30:00Z"
 * @param {'short'|'long'|'medium'} [style]
 */
export function formatDate(isoStr, style = 'short') {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d)) return isoStr.slice(0, 10);
    const opts = {
      short:  { day: '2-digit', month: '2-digit', year: 'numeric' },
      medium: { day: 'numeric', month: 'short', year: 'numeric' },
      long:   { day: 'numeric', month: 'long', year: 'numeric' },
    };
    return d.toLocaleDateString('fr-FR', opts[style] || opts.short);
  } catch (_) {
    return isoStr.slice(0, 10);
  }
}

/**
 * Format an ISO date string to date + time.
 * @param {string} isoStr
 */
export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d)) return isoStr.slice(0, 16).replace('T', ' ');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return isoStr.slice(0, 16).replace('T', ' ');
  }
}

/**
 * Return today's date as YYYY-MM-DD.
 */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return current ISO timestamp.
 */
export function nowISO() {
  return new Date().toISOString();
}

/**
 * Generate a sequential reference number.
 * @param {string} prefix - e.g. "DV", "FCT", "BC"
 * @param {number} count - current count (length of existing records)
 * @param {number} [pad] - zero-padding width (default 4)
 */
export function generateRef(prefix, count, pad = 4) {
  return `${prefix}-${String(count + 1).padStart(pad, '0')}`;
}

/**
 * Truncate a string to N characters with ellipsis.
 * @param {string} str
 * @param {number} max
 */
export function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

/**
 * Capitalize first letter of each word.
 * @param {string} str
 */
export function titleCase(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Get initials from a full name.
 * @param {string} name - e.g. "Selim Moumni"
 * @param {number} [n] - number of initials (default 2)
 */
export function getInitials(name, n = 2) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, n).join('').toUpperCase();
}

/**
 * Format a phone number for display.
 * @param {string} phone
 */
export function formatPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
  }
  return phone;
}

/**
 * Check if a date string is older than N hours.
 * @param {string} isoStr
 * @param {number} hours
 */
export function isOlderThan(isoStr, hours) {
  if (!isoStr) return false;
  return (Date.now() - new Date(isoStr).getTime()) > hours * 60 * 60 * 1000;
}
