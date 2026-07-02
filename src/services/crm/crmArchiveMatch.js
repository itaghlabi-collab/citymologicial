/**
 * crmArchiveMatch.js — Rattachement client pour archives CRM
 */
import { clientDisplayName } from './clients';

function normStr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normPhone(s) {
  return String(s || '').replace(/\D/g, '').slice(-9);
}

function normIce(s) {
  return String(s || '').replace(/\D/g, '');
}

function scoreName(detected, client) {
  const a = normStr(detected);
  const b = normStr(clientDisplayName(client));
  const bn = normStr(client.nom);
  if (!a || (!b && !bn)) return 0;
  if (a === b || a === bn) return 100;
  if (b.includes(a) || a.includes(b)) return 80;
  if (bn && (bn.includes(a) || a.includes(bn))) return 75;
  const aw = a.split(' ').filter(Boolean);
  const bw = b.split(' ').filter(Boolean);
  const common = aw.filter((w) => w.length > 2 && bw.some((x) => x === w || x.includes(w)));
  if (common.length >= 2) return 60;
  if (common.length === 1) return 40;
  return 0;
}

/**
 * @returns {{ client: object|null, confidence: string, label: string }}
 */
export function matchClientForArchive(meta, clients = []) {
  const ice = normIce(meta.client_ice);
  const email = normStr(meta.client_email);
  const phone = normPhone(meta.client_telephone);
  const detected = meta.client_detected_name;

  if (ice) {
    const byIce = clients.find((c) => normIce(c.ice) === ice);
    if (byIce) {
      return { client: byIce, confidence: 'high', label: clientDisplayName(byIce) };
    }
  }

  if (email) {
    const byEmail = clients.find((c) => normStr(c.email) === email);
    if (byEmail) {
      return { client: byEmail, confidence: 'high', label: clientDisplayName(byEmail) };
    }
  }

  if (phone) {
    const byPhone = clients.find((c) => normPhone(c.telephone) === phone);
    if (byPhone) {
      return { client: byPhone, confidence: 'medium', label: clientDisplayName(byPhone) };
    }
  }

  if (detected) {
    let best = null;
    let bestScore = 0;
    for (const c of clients) {
      const s = scoreName(detected, c);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best && bestScore >= 75) {
      return { client: best, confidence: 'high', label: clientDisplayName(best) };
    }
    if (best && bestScore >= 50) {
      return { client: best, confidence: 'medium', label: clientDisplayName(best) };
    }
    if (best && bestScore >= 35) {
      return { client: best, confidence: 'low', label: clientDisplayName(best) };
    }
  }

  return {
    client: null,
    confidence: 'none',
    label: detected || 'Client à associer manuellement',
  };
}

export function resolveArchiveStatutAfterMatch(baseStatut, match) {
  if (baseStatut === 'erreur_lecture' || baseStatut === 'doublon') return baseStatut;
  if (!match.client || match.confidence === 'low' || match.confidence === 'none') {
    return 'client_a_verifier';
  }
  if (baseStatut === 'client_a_verifier' && match.confidence === 'high') {
    return 'pret_import';
  }
  return baseStatut === 'en_attente' ? 'pret_import' : baseStatut;
}
