import {
  X, FileDown, Printer, Building2, HardHat, Calendar, User,
  Clock, AlertTriangle, CalendarDays, ListOrdered,
} from 'lucide-react';
import AttendanceDailyDetailTable from './AttendanceDailyDetailTable';
import { fmtWeekRange } from '../../services/rh/attendance';

const STATUS_BADGE = {
  Present: 'badge-green',
  Absent: 'badge-red',
  Retard: 'badge-orange',
  'Demi-journee': 'badge-blue',
  Mixte: 'badge-grey',
};

function fmtDayEquiv(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtHours(n) {
  return `${Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`;
}

function SectionTitle({ icon: Icon, children, sub }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--text-3)',
      }}>
        {Icon && <Icon size={14} />}
        {children}
      </div>
      {sub && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 4, paddingLeft: 22 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, colorClass }) {
  return (
    <div className="stat-card" style={{ padding: '14px 16px', margin: 0 }}>
      <div className={`stat-icon ${colorClass || ''}`} style={{ width: 40, height: 40 }}>
        <Icon size={18} />
      </div>
      <div className="stat-body">
        <div className="stat-value" style={{ fontSize: '1.15rem' }}>{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function AttendanceDetailModal({
  summary,
  fonction = '',
  onClose,
  onEditLine,
  onDeleteLine,
  onPdf,
  onPrint,
}) {
  if (!summary) return null;

  const chefChantier = summary.chefChantier || '—';
  const badge = STATUS_BADGE[summary.statutGlobal] || 'badge-grey';
  const nbPresences = summary.nbPresences ?? summary.lignes?.length ?? 0;

  return (
    <div className="rh-ext-modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
      <div
        className="card rh-ext-modal-box rh-ext-modal-box--xl rh-pay-detail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="attendance-detail-title"
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', paddingTop: 4 }}>
            Détail présence ouvrier
          </div>
          <div className="rh-ext-detail-header-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onPdf} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <FileDown size={14} /> Télécharger
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onPrint} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Printer size={14} /> Imprimer
            </button>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginLeft: 4, color: 'var(--text-3)' }} aria-label="Fermer">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="card rh-pay-detail-header" style={{ padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h2 id="attendance-detail-title" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.35rem', margin: 0, color: 'var(--text)' }}>
                  {summary.ouvrier}
                </h2>
                <span className={`badge ${badge}`}>{summary.statutGlobal}</span>
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-2)', marginBottom: 12, fontWeight: 600 }}>
                {fonction || 'Fonction non renseignée'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px 24px', fontSize: '0.84rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--text-2)' }}>
                  <Building2 size={14} style={{ color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }} />
                  <span><span style={{ color: 'var(--text-3)' }}>Projet / Chantier · </span><strong>{summary.projet || '—'}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--text-2)' }}>
                  <HardHat size={14} style={{ color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }} />
                  <span><span style={{ color: 'var(--text-3)' }}>Chef de chantier · </span><strong>{chefChantier}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--text-2)' }}>
                  <Calendar size={14} style={{ color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }} />
                  <span><span style={{ color: 'var(--text-3)' }}>Période · </span><strong>{fmtWeekRange(summary.semaineDebut, summary.semaineFin)}</strong></span>
                </div>
              </div>
            </div>
            <div style={{
              textAlign: 'center', padding: '14px 20px', background: '#E3F2FD',
              borderRadius: 10, border: '1px solid rgba(21,101,192,0.15)', minWidth: 100,
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Présences
              </div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.5rem', color: '#1565C0', lineHeight: 1.1 }}>
                {nbPresences}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                {summary.nbJoursTravailles ?? 0} j. travaillé{(summary.nbJoursTravailles ?? 0) > 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        <div className="rh-pay-detail-kpi-grid" style={{ marginBottom: 16 }}>
          <KpiCard icon={CalendarDays} label="Jours travaillés" value={summary.nbJoursTravailles ?? '—'} sub={`${nbPresences} saisie${nbPresences > 1 ? 's' : ''}`} colorClass="blue" />
          <KpiCard icon={Clock} label="Heures travaillées" value={fmtHours(summary.totalHeures)} colorClass="green" />
          <KpiCard
            icon={AlertTriangle}
            label="Retard total"
            value={summary.totalRetard > 0 ? fmtHours(summary.totalRetard) : '—'}
            colorClass="orange"
          />
          <KpiCard icon={User} label="Équiv. jours" value={`${fmtDayEquiv(summary.joursEquivalent)} j`} colorClass="purple" />
        </div>

        <div className="rh-detail-table-card">
          <SectionTitle icon={ListOrdered} sub="Date, horaires, statut et notes — tel que saisi dans le formulaire">
            Détail jour par jour
          </SectionTitle>
          <AttendanceDailyDetailTable
            lignes={summary.lignes || []}
            showActions
            showJour
            striped
            compact
            onEdit={onEditLine}
            onDelete={onDeleteLine}
          />
        </div>
      </div>
    </div>
  );
}
