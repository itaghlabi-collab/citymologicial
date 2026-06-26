/** Helpers UI — Demandes ressources RH */
import { BESOIN_REQUEST_STATUTS } from '../../constants/projectBesoins';

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
  const demanded = Number(r?.quantite) || 0;
  const assigned = r?.workers?.length ?? r?.workers_count ?? 0;
  const manque = Math.max(0, demanded - assigned);
  const taux = demanded > 0 ? Math.round((assigned / demanded) * 100) : 0;

  if (r?.statut === 'recrutement_en_cours') {
    return { demanded, assigned, manque, taux, label: 'Recrutement en cours', badge: 'badge-purple', color: '#7B1FA2' };
  }
  if (manque === 0 && assigned > 0) {
    return { demanded, assigned, manque, taux, label: 'Couvert', badge: 'badge-green', color: '#2E7D32' };
  }
  if (assigned > 0) {
    return { demanded, assigned, manque, taux, label: 'Partiellement couvert', badge: 'badge-orange', color: '#F57C00' };
  }
  return { demanded, assigned, manque, taux, label: 'Non couvert', badge: 'badge-red', color: '#C62828' };
}

export function computeResourceRequestStats(requests = []) {
  const open = requests.filter((r) => !['cloturee', 'refusee'].includes(r.statut));
  const totalDemandes = open.reduce((s, r) => s + (Number(r.quantite) || 0), 0);
  const totalAffectes = open.reduce((s, r) => s + getRequestCoverage(r).assigned, 0);
  return {
    total: requests.length,
    enAttente: requests.filter((r) => r.statut === 'en_attente').length,
    enCoursPartiel: requests.filter((r) => ['en_cours', 'partielle'].includes(r.statut)).length,
    couvertes: requests.filter((r) => r.statut === 'affectee').length,
    recrutement: requests.filter((r) => r.statut === 'recrutement_en_cours').length,
    aRecruter: open.reduce((s, r) => s + getRequestCoverage(r).manque, 0),
    urgentes: requests.filter((r) => ['Urgente', 'Critique'].includes(r.priorite) && !['cloturee', 'refusee'].includes(r.statut)).length,
    cloturees: requests.filter((r) => ['cloturee', 'refusee'].includes(r.statut)).length,
    taux: totalDemandes > 0 ? Math.round((totalAffectes / totalDemandes) * 100) : 0,
  };
}

export function deleteResourceRequestWarnMessage(r) {
  const cov = getRequestCoverage(r);
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
  return requests.filter((r) => tab.statuts.includes(r.statut));
}

export function statutBadgeClass(statut) {
  if (statut === 'affectee') return 'badge-green';
  if (statut === 'partielle' || statut === 'en_attente') return 'badge-orange';
  if (statut === 'en_cours') return 'badge-blue';
  if (statut === 'recrutement_en_cours') return 'badge-purple';
  if (statut === 'refusee') return 'badge-red';
  if (!BESOIN_REQUEST_STATUTS.find((s) => s.value === statut)) return 'badge-grey';
  return 'badge-grey';
}

export function prioriteBadgeClass(priorite) {
  if (priorite === 'Critique') return 'badge-red';
  if (priorite === 'Urgente') return 'badge-orange';
  return 'badge-grey';
}

export function canAssignRequest(r) {
  return ['en_attente', 'en_cours', 'partielle', 'recrutement_en_cours'].includes(r?.statut);
}

export function canCloseRequest(r) {
  return ['affectee', 'partielle', 'recrutement_en_cours'].includes(r?.statut);
}

export function canRecruitRequest(r) {
  return getRequestCoverage(r).manque > 0 && canAssignRequest(r);
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
