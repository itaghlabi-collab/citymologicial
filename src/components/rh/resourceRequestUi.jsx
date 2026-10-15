/** Helpers UI — Demandes ressources RH */
import {
  computeRequestCoverage,
  deriveRequestStatut,
  deriveRequestStatutLabel,
} from '../../services/rh/resourceRequestCoverage';

export const RH_REQUEST_TABS = [
  { key: 'all', label: 'Toutes', statuts: null },
  { key: 'en_attente', label: 'En attente', statuts: ['en_attente'] },
  { key: 'en_cours', label: 'En cours', statuts: ['en_cours'] },
  { key: 'partielle', label: 'Partiellement couvertes', statuts: ['partielle'] },
  { key: 'affectee', label: 'Couvertes', statuts: ['affectee'] },
  { key: 'recrutement', label: 'Recrutement en cours', statuts: ['recrutement_en_cours'] },
  { key: 'cloturee', label: 'Clôturées', statuts: ['cloturee', 'refusee'] },
];

export function getRequestCoverage(r) {
  return computeRequestCoverage(r);
}

export function getDerivedRequestStatut(r) {
  const cov = computeRequestCoverage(r);
  return {
    statut: deriveRequestStatut(r, cov),
    label: deriveRequestStatutLabel(r, cov),
    coverage: cov,
  };
}

export function computeResourceRequestStats(requests = []) {
  const enriched = requests.map((r) => ({ r, cov: computeRequestCoverage(r), derived: deriveRequestStatut(r) }));
  const open = enriched.filter(({ derived }) => !['cloturee', 'refusee'].includes(derived));
  const totalDemandes = open.reduce((s, { cov }) => s + cov.demanded, 0);
  const totalAffectes = open.reduce((s, { cov }) => s + cov.assigned, 0);
  return {
    total: requests.length,
    enAttente: enriched.filter(({ derived }) => derived === 'en_attente').length,
    enCoursPartiel: enriched.filter(({ derived }) => ['en_cours', 'partielle'].includes(derived)).length,
    couvertes: enriched.filter(({ derived }) => derived === 'affectee').length,
    recrutement: enriched.filter(({ derived }) => derived === 'recrutement_en_cours').length,
    aRecruter: open.reduce((s, { cov }) => s + cov.manque, 0),
    urgentes: enriched.filter(({ r, derived }) => ['Urgente', 'Critique'].includes(r.priorite) && !['cloturee', 'refusee'].includes(derived)).length,
    cloturees: enriched.filter(({ derived }) => ['cloturee', 'refusee'].includes(derived)).length,
    taux: totalDemandes > 0 ? Math.round((totalAffectes / totalDemandes) * 100) : 0,
  };
}

export function deleteResourceRequestWarnMessage(r) {
  const cov = computeRequestCoverage(r);
  if (cov.assigned > 0) {
    return `Des ouvriers sont affectés (${cov.assigned}). Supprimer définitivement cette demande RH et le besoin projet lié ?`;
  }
  return 'Supprimer définitivement cette demande ? Le besoin projet lié sera également supprimé.';
}

export function canDeleteRequest() {
  return true;
}

export function filterRequestsByTab(requests, tabKey) {
  const tab = RH_REQUEST_TABS.find((t) => t.key === tabKey) || RH_REQUEST_TABS[0];
  if (!tab.statuts) return requests;
  return requests.filter((r) => tab.statuts.includes(deriveRequestStatut(r, computeRequestCoverage(r))));
}

export function statutBadgeClass(statut) {
  if (statut === 'affectee') return 'badge-green';
  if (statut === 'partielle' || statut === 'en_attente') return 'badge-orange';
  if (statut === 'en_cours') return 'badge-blue';
  if (statut === 'recrutement_en_cours') return 'badge-purple';
  if (statut === 'refusee') return 'badge-red';
  return 'badge-grey';
}

export function prioriteBadgeClass(priorite) {
  if (priorite === 'Critique') return 'badge-red';
  if (priorite === 'Urgente') return 'badge-orange';
  return 'badge-grey';
}

export function canAssignRequest(r) {
  const statut = deriveRequestStatut(r, computeRequestCoverage(r));
  return ['en_attente', 'en_cours', 'partielle', 'recrutement_en_cours'].includes(statut);
}

export function canCloseRequest(r) {
  const statut = deriveRequestStatut(r, computeRequestCoverage(r));
  return ['affectee', 'partielle', 'recrutement_en_cours'].includes(statut);
}

export function canRecruitRequest(r) {
  return computeRequestCoverage(r).manque > 0 && canAssignRequest(r);
}

export function CoverageProgressBar({ taux, color = '#1565C0' }) {
  const pct = Math.min(100, Math.max(0, Number(taux) || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.25s ease' }} />
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color, minWidth: 34, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export function CoverageBadge({ coverage }) {
  if (!coverage) return null;
  return <span className={`badge ${coverage.badge}`}>{coverage.label}</span>;
}

/** Délai de prise en charge RH — même règle que public.check_resource_requests_sla. */
export const RH_SLA_HOURS = 48;
const HOUR_MS = 3600000;
const SLA_WARN_MS = 12 * HOUR_MS;

export function getRequestSla(r, now = Date.now()) {
  if (!r?.created_at || r.statut !== 'en_attente') return null;
  if (r.request_type === 'recrutement' || r.parent_request_id) return null;
  const start = new Date(r.created_at).getTime();
  if (Number.isNaN(start)) return null;
  const deadline = start + RH_SLA_HOURS * HOUR_MS;
  const remaining = deadline - now;
  return {
    deadline,
    remaining,
    overdue: remaining <= 0,
    level: remaining <= 0 ? 'late' : remaining <= SLA_WARN_MS ? 'warn' : 'ok',
    elapsedPct: Math.min(100, Math.max(0, ((now - start) / (RH_SLA_HOURS * HOUR_MS)) * 100)),
  };
}

function fmtSlaDuration(ms) {
  const totalMin = Math.floor(Math.abs(ms) / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days) return `${days} j ${hours} h`;
  if (hours) return `${hours} h ${String(minutes).padStart(2, '0')}`;
  return `${minutes} min`;
}

const SLA_COLORS = { ok: '#2E7D32', warn: '#E65100', late: '#C62828' };

export function SlaCountdown({ request, now, compact = false }) {
  const sla = getRequestSla(request, now);
  if (!sla) {
    return compact ? null : <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Prise en charge</span>;
  }
  const color = SLA_COLORS[sla.level];
  const badge = sla.level === 'late' ? 'badge-red' : sla.level === 'warn' ? 'badge-orange' : 'badge-green';
  const label = sla.overdue
    ? `Retard ${fmtSlaDuration(sla.remaining)}`
    : `${fmtSlaDuration(sla.remaining)} restantes`;
  const title = `Échéance de prise en charge RH : ${new Date(sla.deadline).toLocaleString('fr-FR')}`;
  return (
    <div title={title} style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, minWidth: compact ? 0 : 120 }}>
      <span className={`badge ${badge}`} style={{ whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
        {sla.overdue ? '⏰ ' : '⏳ '}{label}
      </span>
      {!compact ? (
        <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${sla.elapsedPct}%`, height: '100%', background: color, borderRadius: 2 }} />
        </div>
      ) : null}
    </div>
  );
}
