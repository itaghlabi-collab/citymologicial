import {
  X, Edit2, FileDown, Printer, Building2, HardHat, Calendar, User,
  Clock, AlertTriangle, Banknote, CalendarDays,
} from 'lucide-react';
import AttendanceDailyDetailTable from './AttendanceDailyDetailTable';
import { fmtWeekRange } from '../../services/rh/workerPayroll';

function fmtMAD(n) {
  return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function fmtDayEquiv(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtHours(n) {
  return `${Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`;
}

function statutBadgeClass(statut) {
  if (statut === 'Payé') return 'badge-green';
  if (statut === 'En attente') return 'badge-orange';
  if (statut === 'Partiellement payé') return 'badge-blue';
  return 'badge-red';
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 12,
    }}>
      {Icon && <Icon size={14} />}
      {children}
    </div>
  );
}

function FinRow({ label, value, accent, bold }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid var(--border)',
      fontSize: '0.88rem',
    }}>
      <span style={{ color: accent || 'var(--text-2)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: accent || 'var(--text)', fontFamily: bold ? 'var(--font-head)' : 'inherit' }}>
        {value}
      </span>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, colorClass }) {
  return (
    <div className="stat-card" style={{ padding: '14px 16px' }}>
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

export default function WorkerPaymentDetailModal({
  record,
  chefChantierFallback = '',
  onClose,
  onEdit,
  onPdf,
  onPrint,
}) {
  if (!record) return null;

  const chefChantier = record.chefChantier || chefChantierFallback || '—';

  return (
    <div className="rh-ext-modal-overlay" style={{ zIndex: 1000 }}>
      <div className="card rh-ext-modal-box rh-ext-modal-box--xl rh-pay-detail-modal">

        {/* Barre supérieure : titre + actions */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', paddingTop: 4 }}>
            Détail paiement ouvrier
          </div>
          <div className="rh-ext-detail-header-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Edit2 size={14} /> Modifier
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onPdf} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <FileDown size={14} /> PDF
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onPrint} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Printer size={14} /> Imprimer
            </button>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginLeft: 4, color: 'var(--text-3)' }} aria-label="Fermer">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Header — carte principale */}
        <div className="card rh-pay-detail-header" style={{ padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.35rem', margin: 0, color: 'var(--text)' }}>
                  {record.ouvrier}
                </h2>
                <span className={`badge ${statutBadgeClass(record.statut)}`}>{record.statut}</span>
              </div>
              {record.fonction && (
                <div style={{ fontSize: '0.88rem', color: 'var(--text-2)', marginBottom: 12, fontWeight: 600 }}>
                  {record.fonction}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px 24px', fontSize: '0.84rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}>
                  <Building2 size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  <span><span style={{ color: 'var(--text-3)' }}>Projet / Chantier · </span><strong>{record.projet || '—'}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}>
                  <HardHat size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  <span><span style={{ color: 'var(--text-3)' }}>Chef de chantier · </span><strong>{chefChantier}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}>
                  <Calendar size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  <span><span style={{ color: 'var(--text-3)' }}>Période · </span><strong>{
                    record.mergeAllWeeks || !record.semaineDebut
                      ? (() => {
                        const dates = (record.presenceLignes || []).map((l) => l.date).filter(Boolean).sort();
                        if (dates.length >= 2) return fmtWeekRange(dates[0], dates[dates.length - 1]);
                        if (dates.length === 1) return fmtWeekRange(dates[0], dates[0]);
                        return 'Toutes les semaines';
                      })()
                      : fmtWeekRange(record.semaineDebut, record.semaineFin)
                  }</strong></span>
                </div>
              </div>
            </div>
            <div style={{
              textAlign: 'right', padding: '12px 18px', background: 'var(--red-light)',
              borderRadius: 10, border: '1px solid rgba(211,47,47,0.15)', minWidth: 140,
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Net à payer
              </div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--red)', lineHeight: 1.1 }}>
                {fmtMAD(record.total)}
              </div>
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="rh-pay-detail-kpi-grid" style={{ marginBottom: 16 }}>
          <KpiCard icon={CalendarDays} label="Jours travaillés" value={record.nbJoursTravailles ?? '—'} sub={`${fmtDayEquiv(record.joursPaies)} j équiv.`} colorClass="blue" />
          <KpiCard icon={Clock} label="Heures travaillées" value={fmtHours(record.heuresNormales)} colorClass="green" />
          <KpiCard
            icon={AlertTriangle}
            label="Retard total"
            value={record.totalRetard > 0 ? fmtHours(record.totalRetard) : '—'}
            colorClass="orange"
          />
          <KpiCard icon={Banknote} label="Net à payer" value={fmtMAD(record.total)} colorClass="" />
        </div>

        {/* Récapitulatif financier */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <SectionTitle icon={Banknote}>Récapitulatif financier</SectionTitle>
          <FinRow
            label="Tarif journalier"
            value={`${fmtMAD(record.tarifJournalier)}/j${record.tarifHoraire ? ` (${Number(record.tarifHoraire).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD/h × 8)` : ''}`}
          />
          <FinRow label="Montant brut" value={fmtMAD(record.montantBrut)} />
          <FinRow
            label="Heures supplémentaires"
            value={record.heuresSup > 0 ? `${record.heuresSup} h · ${fmtMAD(record.montantSup)}` : '—'}
          />
          <FinRow label="Avances" value={fmtMAD(record.avances || 0)} accent={record.avances > 0 ? '#E65100' : undefined} />
          <FinRow label="Retenues" value={fmtMAD(record.retenues || 0)} accent={record.retenues > 0 ? '#C62828' : undefined} />
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 12, padding: '14px 16px', background: 'var(--red-light)',
            borderRadius: 8, border: '1.5px solid rgba(211,47,47,0.2)',
          }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>Net à payer</span>
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--red)' }}>
              {fmtMAD(record.total)}
            </span>
          </div>
        </div>

        {/* Détail présences */}
        <div>
          <SectionTitle icon={User}>Détail des présences</SectionTitle>
          <AttendanceDailyDetailTable
            lignes={record.presenceLignes || []}
            showActions={false}
            showJour
            striped
          />
        </div>
      </div>
    </div>
  );
}
