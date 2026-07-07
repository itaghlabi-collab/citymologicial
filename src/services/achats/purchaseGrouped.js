/**
 * purchaseGrouped.js — Demandes d'achat groupées (plusieurs projets par demande)
 */
import Big from 'big.js';
import { normalizeQuoteLines } from './purchaseRequestQuotes';
import { projectOptionLabel } from './purchaseRequests';

export function isGroupedPurchaseRequest(formOrRequest) {
  if (!formOrRequest) return false;
  return formOrRequest.payload?.is_grouped === true || formOrRequest.is_grouped === true;
}

export function groupedProjectCount(request) {
  const lines = request?.payload?.lines || [];
  return new Set(lines.map((l) => l.project_id).filter(Boolean)).size;
}

export function groupedProjectLabel(request) {
  const n = groupedProjectCount(request);
  if (n === 0) return 'Achats groupés';
  if (n === 1) {
    const line = (request?.payload?.lines || []).find((l) => l.project_id);
    return line?.projet_lie || line?.project_name || 'Achats groupés (1 projet)';
  }
  return `Achats groupés (${n} projets)`;
}

/** Valide les lignes d'une demande groupée (projet obligatoire par ligne). */
export function validateGroupedRequestLines(lignes) {
  const lines = (lignes || []).filter((l) => String(l.designation || '').trim());
  if (!lines.length) {
    const err = new Error('Ajoutez au moins une ligne avec une désignation.');
    err.code = 'VALIDATION';
    throw err;
  }
  const missing = lines.find((l) => !l.project_id);
  if (missing) {
    const err = new Error('Chaque ligne doit être liée à un projet.');
    err.code = 'VALIDATION';
    throw err;
  }
  return lines;
}

export function buildGroupedLinePayload(l, projects = []) {
  const p = projects.find((x) => String(x.id) === String(l.project_id));
  const projetLie = l.projet_lie || (p ? projectOptionLabel(p) : '') || l.project_name || '';
  return {
    id: l.id,
    designation: String(l.designation).trim(),
    quantite: l.quantite !== '' && l.quantite != null ? Number(l.quantite) : null,
    unite: (l.unite || 'u').trim(),
    project_id: l.project_id || null,
    project_ref: l.project_ref || p?.ref || null,
    project_name: l.project_name || p?.nom || null,
    projet_lie: projetLie || null,
    fournisseur: (l.fournisseur || '').trim() || null,
    supplier_id: l.supplier_id || null,
    commentaire: (l.commentaire || '').trim() || null,
  };
}

export function buildGroupedFormPayload(form, existingPayload = {}, attachments = [], projects = []) {
  const lignes = validateGroupedRequestLines(form.lignes);
  return {
    ...existingPayload,
    is_grouped: true,
    off_project: false,
    attachments: (attachments || []).map((a) => ({
      name: a.name,
      size: a.size,
      type: a.type,
      storage_path: a.storage_path,
      added_at: a.added_at || null,
      added_by_name: a.added_by_name || null,
      added_by: a.added_by || null,
    })),
    lines: lignes.map((l) => buildGroupedLinePayload(l, projects)),
  };
}

/** Répartit le devis retenu par projet (HT des lignes devis, TTC proportionnel). */
export function buildProjectSplitsFromQuote(request, quote) {
  const requestLines = (request?.payload?.lines || []).filter((l) => l.designation);
  const quoteLines = normalizeQuoteLines(quote?.lines || []);

  const paired = requestLines.map((reqLine, i) => {
    const quoteLine = quoteLines.find((q) => q.request_line_id && q.request_line_id === reqLine.id)
      || quoteLines[i]
      || null;
    return { requestLine: reqLine, quoteLine };
  });

  const quoteHt = Number(quote?.montant_ht) || 0;
  const quoteTtc = Number(quote?.montant_ttc) || 0;
  const tvaRate = Number(quote?.tva_rate) || 20;

  const byProject = new Map();
  for (const { requestLine, quoteLine } of paired) {
    const pid = requestLine.project_id;
    if (!pid) continue;
    const lineHt = Number(quoteLine?.montant_ht) || 0;
    if (!byProject.has(pid)) {
      byProject.set(pid, {
        project_id: pid,
        project_ref: requestLine.project_ref || '',
        project_name: requestLine.project_name || '',
        projet_lie: requestLine.projet_lie || requestLine.project_name || '',
        lines: [],
        montant_ht: 0,
      });
    }
    const g = byProject.get(pid);
    g.lines.push(requestLine);
    g.montant_ht += lineHt;
  }

  const groups = Array.from(byProject.values());
  if (!groups.length) {
    const err = new Error('Impossible de répartir le devis : aucune ligne liée à un projet.');
    err.code = 'VALIDATION';
    throw err;
  }

  const sumHt = groups.reduce((s, g) => s + g.montant_ht, 0) || quoteHt;
  const baseHt = sumHt > 0 ? sumHt : quoteHt;
  let allocatedTtc = new Big(0);

  groups.forEach((g, i) => {
    const ht = new Big(g.montant_ht || 0);
    g.montant_ht = Number(ht.round(2, Big.roundHalfUp).toString());
    if (quoteTtc > 0 && baseHt > 0) {
      if (i === groups.length - 1) {
        g.montant_ttc = Number(new Big(quoteTtc).minus(allocatedTtc).round(2, Big.roundHalfUp).toString());
      } else {
        const share = ht.div(baseHt).times(quoteTtc);
        g.montant_ttc = Number(share.round(2, Big.roundHalfUp).toString());
        allocatedTtc = allocatedTtc.plus(share.round(2, Big.roundHalfUp));
      }
    } else {
      g.montant_ttc = Number(ht.times(new Big(1).plus(new Big(tvaRate).div(100))).round(2, Big.roundHalfUp).toString());
    }
  });

  return groups;
}
