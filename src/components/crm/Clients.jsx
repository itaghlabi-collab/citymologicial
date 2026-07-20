import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, Plus, Search, Edit2, Trash2, Eye, FileText, Receipt,
  X, ChevronLeft, Building2, Phone, Mail, MapPin, User,
  TrendingUp, DollarSign, FolderOpen, Clock, CheckCircle,
  AlertCircle, Zap, CreditCard, Activity, Loader2, Archive, Download
} from 'lucide-react';
import { TYPE_PROJET_VALUES, TYPE_PROJET_LABEL } from '../../constants/commercial';
import { useClients } from '../../hooks/useClients';
import { listClientImportedArchives } from '../../services/crm/crmArchives';
import { openArchivePdf, downloadArchivePdf } from './crmArchiveDisplay';
import CrmOverflowMenu from './CrmOverflowMenu';

/* ── Helpers ── */
function fmtMAD(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[\s,]/g, '')) : Number(v);
  if (isNaN(n) || n === 0) return '0 MAD';
  return n.toLocaleString('fr-MA') + ' MAD';
}

function IS(err) {
  return {
    padding: '9px 12px',
    border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6,
    fontSize: '0.875rem',
    background: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-body)',
    color: 'var(--text)',
  };
}

/* ── Statuts ── */
const STATUT_CLIENT_VALUES = ['actif', 'en_attente', 'important', 'archive'];
const STATUT_CLIENT_LABEL = { actif: 'Actif', en_attente: 'En attente', important: 'Important', archive: 'Archive' };
const STATUT_CLIENT_BADGE = { actif: 'badge-green', en_attente: 'badge-orange', important: 'badge-red', archive: 'badge-grey' };

const STATUT_DEVIS_VALUES = ['brouillon', 'soumis', 'approuve', 'rejete', 'converti'];
const STATUT_DEVIS_LABEL = { brouillon: 'Brouillon', soumis: 'Soumis', approuve: 'Approuve', rejete: 'Rejete', converti: 'Converti' };
const STATUT_DEVIS_BADGE = { brouillon: 'badge-grey', soumis: 'badge-blue', approuve: 'badge-green', rejete: 'badge-red', converti: 'badge-orange' };

const STATUT_FACT_VALUES = ['payee', 'partielle', 'impayee'];
const STATUT_FACT_LABEL = { payee: 'Payee', partielle: 'Partielle', impayee: 'Impayee' };
const STATUT_FACT_BADGE = { payee: 'badge-green', partielle: 'badge-orange', impayee: 'badge-red' };

const MOYENS_PAIEMENT = ['Virement', 'Cheque', 'Especes', 'Carte bancaire', 'Autre'];
const RESPONSABLES = ['Ahmed Bennani', 'Sara Idrissi', 'Youssef Alami', 'Nadia Tazi', 'Karim Fassi'];
const VILLES = ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tanger', 'Agadir', 'Meknes', 'Autre'];
const SECTEURS = ['Immobilier', 'BTP', 'Promotion immobiliere', 'Architecture', 'Finance', 'Industrie', 'Commerce', 'Autre'];

/* ── Seed data ── */
const SEED_CLIENTS    = [];
const SEED_PROJETS    = [];
const SEED_DEVIS      = [];
const SEED_FACTURES   = [];
const SEED_PAIEMENTS  = [];

/* ── Toast ── */
function Toast({ msg, onClose }) {
  const t = useRef();
  useEffect(() => {
    t.current = setTimeout(onClose, 3000);
    return () => clearTimeout(t.current);
  }, [onClose]);
  if (!msg) return null;
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, background: 'var(--text)', color: '#fff', borderRadius: 8, padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', maxWidth: 340 }}>
      {msg}
    </div>
  );
}

/* ── Modal wrapper ── */
function Modal({ title, onClose, children, maxWidth = 560 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ActionInfoModal({ title, message, onClose }) {
  return (
    <Modal title={title} onClose={onClose} maxWidth={440}>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

function clientDisplayName(c) {
  return [c?.prenom, c?.nom].filter(Boolean).join(' ') || c?.nom || 'Client';
}

/* ═══════════════════════════════════════════════
   DETAIL CLIENT
   ═══════════════════════════════════════════════ */
function ClientDetail({ client, initialTab = 'overview', onBack, onEdit, onDevisEmpty, onFactureEmpty, onProjetEmpty, onCreateProforma }) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [client.id, initialTab]);
  const [projets] = useState(SEED_PROJETS.filter(p => p.client_id === client.id));
  const [devis] = useState(SEED_DEVIS.filter(d => d.client_id === client.id));
  const [factures] = useState(SEED_FACTURES.filter(f => f.client_id === client.id));
  const [paiements] = useState(SEED_PAIEMENTS.filter(p => p.client_id === client.id));
  const [clientArchives, setClientArchives] = useState([]);

  useEffect(() => {
    listClientImportedArchives(client.id).then(setClientArchives).catch(() => setClientArchives([]));
  }, [client.id]);

  /* KPI calculs */
  const totalFacture = factures.reduce((s, f) => s + f.montant_total, 0);
  const totalPaye = factures.reduce((s, f) => s + f.montant_paye, 0);
  const totalRestant = totalFacture - totalPaye;
  const totalPaiements = paiements.reduce((s, p) => s + p.montant, 0);

  const TABS = [
    { k: 'overview', label: "Vue d'ensemble" },
    { k: 'projets', label: 'Projets' },
    { k: 'devis', label: 'Devis' },
    { k: 'factures', label: 'Factures' },
    { k: 'paiements', label: 'Paiements' },
    { k: 'historique', label: 'Historique' },
  ];

  /* Timeline historique */
  const timeline = [
    { icon: User, color: '#1976D2', label: 'Client cree', date: client.created_at, desc: "Fiche client creee dans le CRM" },
    ...devis.map(d => ({ icon: FileText, color: '#7B1FA2', label: 'Devis envoye', date: d.date, desc: d.ref + ' — ' + fmtMAD(d.montant) })),
    ...factures.map(f => ({ icon: Receipt, color: 'var(--red)', label: 'Facture creee', date: f.echeance, desc: f.ref + ' — ' + fmtMAD(f.montant_total) })),
    ...paiements.map(p => ({ icon: CreditCard, color: '#2E7D32', label: 'Paiement recu', date: p.date, desc: fmtMAD(p.montant) + ' via ' + p.moyen })),
    ...projets.map(p => ({ icon: FolderOpen, color: '#F57C00', label: 'Projet ajoute', date: p.date_debut, desc: p.titre })),
    ...clientArchives.map((a) => ({
      icon: Archive,
      color: '#5D4037',
      label: a.doc_type === 'facture' ? 'Facture archive importee' : 'Devis archive importe',
      date: a.date_document || a.imported_at,
      desc: `${a.reference || a.file_name} — ${fmtMAD(a.total_ttc)}`,
      archive: a,
    })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const nomComplet = [client.prenom, client.nom].filter(Boolean).join(' ') || client.nom;

  return (
    <div className="animate-fade-in crm-module crm-module--clients">
      {/* Back button */}
      <button
        type="button"
        className="crm-back-btn"
        onClick={onBack}
        aria-label="Retour aux clients"
      >
        <ChevronLeft size={16} /> Retour aux clients
      </button>

      {/* Header client */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.4rem', flexShrink: 0 }}>
            {nomComplet.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.4rem', letterSpacing: '0.02em' }}>{nomComplet}</h2>
              <span className={'badge ' + STATUT_CLIENT_BADGE[client.statut]}>{STATUT_CLIENT_LABEL[client.statut]}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', color: 'var(--text-2)', fontSize: '0.85rem' }}>
              {client.ice && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Building2 size={13} /> ICE: {client.ice}</span>}
              {client.telephone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={13} /> {client.telephone}</span>}
              {client.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={13} /> {client.email}</span>}
              {client.responsable && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={13} /> {client.responsable}</span>}
              {client.ville && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {client.ville}</span>}
            </div>
          </div>
          {/* Actions rapides */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={onEdit}><Edit2 size={13} /> Modifier</button>
            <button type="button" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => (devis.length ? setTab('devis') : onDevisEmpty?.())}><Plus size={13} /> Devis</button>
            <button type="button" className="btn btn-primary btn-sm" style={{ background: '#455A64', borderColor: '#455A64', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => onCreateProforma?.(client)}><FileText size={13} /> Proforma</button>
            <button type="button" className="btn btn-primary btn-sm" style={{ background: '#1976D2', borderColor: '#1976D2', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => (factures.length ? setTab('factures') : onFactureEmpty?.())}><Receipt size={13} /> Facture</button>
            <button type="button" className="btn btn-primary btn-sm" style={{ background: '#2E7D32', borderColor: '#2E7D32', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => (projets.length ? setTab('projets') : onProjetEmpty?.())}><FolderOpen size={13} /> Projet</button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon purple"><FileText size={18} /></div>
          <div className="stat-body"><div className="stat-value">{devis.length}</div><div className="stat-label">Total devis</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><DollarSign size={18} /></div>
          <div className="stat-body"><div className="stat-value">{(totalFacture / 1000000).toFixed(1)}M</div><div className="stat-label">Total facture (MAD)</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{(totalPaye / 1000000).toFixed(1)}M</div><div className="stat-label">Total paye (MAD)</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: 'var(--red)' }}><AlertCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{(totalRestant / 1000000).toFixed(1)}M</div><div className="stat-label">Restant (MAD)</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><FolderOpen size={18} /></div>
          <div className="stat-body"><div className="stat-value">{projets.length}</div><div className="stat-label">Projets</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(({ k, label }) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 18px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem', background: 'none', whiteSpace: 'nowrap', color: tab === k ? 'var(--red)' : 'var(--text-2)', borderBottom: tab === k ? '2px solid var(--red)' : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Vue d'ensemble ── */}
      {tab === 'overview' && (
        <div className="crm-detail-sections" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}><User size={15} /> Informations</div>
            {[
              ['Nom complet', nomComplet],
              ['ICE', client.ice || '-'],
              ['Secteur', client.secteur || '-'],
              ['Responsable', client.responsable || '-'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
                <span style={{ color: 'var(--text)', fontWeight: 500, textAlign: 'right', maxWidth: '55%' }}>{val}</span>
              </div>
            ))}
            {client.notes && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, fontSize: '0.82rem', color: 'var(--text-2)' }}>
                {client.notes}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}><Phone size={15} /> Contacts</div>
            {[
              ['Telephone', client.telephone || '-'],
              ['Email', client.email || '-'],
              ['Adresse', client.adresse || '-'],
              ['Ville', client.ville || '-'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
                <span style={{ color: 'var(--text)', fontWeight: 500, textAlign: 'right', maxWidth: '55%' }}>{val}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}><Activity size={15} /> Activite recente</div>
            {timeline.slice(0, 6).map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < 5 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: item.color + '20', color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={14} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.83rem' }}>{item.label}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 1 }}>{item.desc}</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', flexShrink: 0 }}>{item.date}</div>
                </div>
              );
            })}
          </div>
          {clientArchives.length > 0 && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-title" style={{ marginBottom: 14 }}><Archive size={15} /> Documents archives ({clientArchives.length})</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Type</th><th>Reference</th><th>Date</th><th>Montant TTC</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {clientArchives.map((a) => (
                      <tr key={a.id}>
                        <td><span className="badge badge-orange">{a.doc_type === 'facture' ? 'Facture' : 'Devis'}</span></td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{a.reference || '—'}</td>
                        <td>{a.date_document || '—'}</td>
                        <td>{fmtMAD(a.total_ttc)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" className="btn btn-ghost btn-sm" title="Voir PDF" onClick={() => openArchivePdf(a)}><Eye size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Telecharger" onClick={() => downloadArchivePdf(a)}><Download size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Projets ── */}
      {tab === 'projets' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}><FolderOpen size={15} /> Projets ({projets.length})</div>
            <button className="btn btn-primary btn-sm"><Plus size={13} /> Ajouter projet</button>
          </div>
          {projets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucun projet lie a ce client.</div>
          ) : (
            <div className="crm-table-scroll">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Projet</th><th>Type projet</th><th>Statut</th><th>Budget (MAD)</th><th>Date debut</th><th>Responsable</th></tr></thead>
                <tbody>
                  {projets.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.titre}</td>
                      <td><span className="badge badge-blue">{TYPE_PROJET_LABEL[p.type_projet] || p.type_projet}</span></td>
                      <td><span className={'badge ' + (p.statut === 'Termine' ? 'badge-green' : p.statut === 'En cours' ? 'badge-blue' : 'badge-orange')}>{p.statut}</span></td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(p.budget)}</td>
                      <td>{p.date_debut}</td>
                      <td>{p.responsable}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Devis ── */}
      {tab === 'devis' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}><FileText size={15} /> Devis ({devis.length})</div>
            <button className="btn btn-primary btn-sm"><Plus size={13} /> Nouveau devis</button>
          </div>
          {devis.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucun devis pour ce client.</div>
          ) : (
            <div className="crm-table-scroll">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Reference</th><th>Type projet</th><th>Date</th><th>Montant (MAD)</th><th>Statut</th><th>Responsable</th><th>Actions</th></tr></thead>
                <tbody>
                  {devis.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{d.ref}</td>
                      <td><span className="badge badge-blue">{TYPE_PROJET_LABEL[d.type_projet] || d.type_projet}</span></td>
                      <td>{d.date}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(d.montant)}</td>
                      <td><span className={'badge ' + STATUT_DEVIS_BADGE[d.statut]}>{STATUT_DEVIS_LABEL[d.statut]}</span></td>
                      <td>{d.responsable}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Eye size={13} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Edit2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Factures ── */}
      {tab === 'factures' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}><Receipt size={15} /> Factures ({factures.length})</div>
            <button className="btn btn-primary btn-sm"><Plus size={13} /> Nouvelle facture</button>
          </div>
          {factures.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucune facture pour ce client.</div>
          ) : (
            <div className="crm-table-scroll">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Reference</th><th>Montant total</th><th>Montant paye</th><th>Reste a payer</th><th>Echeance</th><th>Statut</th></tr></thead>
                <tbody>
                  {factures.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{f.ref}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(f.montant_total)}</td>
                      <td style={{ color: '#2E7D32', fontWeight: 600 }}>{fmtMAD(f.montant_paye)}</td>
                      <td style={{ color: f.montant_total - f.montant_paye > 0 ? 'var(--red)' : '#2E7D32', fontWeight: 600 }}>{fmtMAD(f.montant_total - f.montant_paye)}</td>
                      <td>{f.echeance}</td>
                      <td><span className={'badge ' + STATUT_FACT_BADGE[f.statut]}>{STATUT_FACT_LABEL[f.statut]}</span></td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Paiements ── */}
      {tab === 'paiements' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}><CreditCard size={15} /> Historique paiements</div>
          </div>
          {/* Total */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#E8F5E9', color: '#2E7D32', borderRadius: 6, padding: '8px 14px', marginBottom: 16, fontWeight: 700, fontSize: '0.9rem' }}>
            <CheckCircle size={15} /> Total paiements : {fmtMAD(totalPaiements)}
          </div>
          {paiements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucun paiement enregistre.</div>
          ) : (
            <div className="crm-table-scroll">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Ref. facture</th><th>Montant paye</th><th>Moyen</th><th>Validateur</th></tr></thead>
                <tbody>
                  {paiements.map(p => (
                    <tr key={p.id}>
                      <td>{p.date}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{p.ref_facture}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: '#2E7D32' }}>{fmtMAD(p.montant)}</td>
                      <td><span className="badge badge-blue">{p.moyen}</span></td>
                      <td>{p.validateur}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Historique timeline ── */}
      {tab === 'historique' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 18 }}><Clock size={15} /> Historique activite</div>
          <div style={{ position: 'relative', paddingLeft: 32 }}>
            <div style={{ position: 'absolute', left: 12, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
            {timeline.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} style={{ position: 'relative', marginBottom: 20 }}>
                  <div style={{ position: 'absolute', left: -26, top: 4, width: 28, height: 28, borderRadius: '50%', background: item.color + '20', color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid ' + item.color + '40' }}>
                    <Icon size={13} />
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.label}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{item.date}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{item.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MODAL NOUVEAU CLIENT
   ═══════════════════════════════════════════════ */
const EMPTY_CLIENT = { nom: '', prenom: '', telephone: '', email: '', ice: '', responsable: '', adresse: '', ville: '', secteur: '', notes: '' };

function ClientModal({ client, onClose, onSave, saving }) {
  const [form, setForm] = useState(client ? { ...client } : { ...EMPTY_CLIENT });
  const [errors, setErrors] = useState({});

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function validate() {
    const e = {};
    if (!form.nom?.trim()) e.nom = 'Requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const result = await onSave({ ...form, statut: form.statut || 'actif' });
    if (result && result.success === false) return;
  }

  return (
    <Modal title={client ? 'Modifier client' : 'Nouveau client'} onClose={onClose} maxWidth={600}>
      <form className="crm-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button type="button" className="crm-back-btn crm-back-btn--modal" onClick={onClose} aria-label="Retour aux clients">
          <ChevronLeft size={16} /> Retour aux clients
        </button>
        <div className="crm-form-grid">
          <div className="form-group">
            <label>Nom *</label>
            <input value={form.nom} onChange={e => setField('nom', e.target.value)} placeholder="Nom ou societe" style={IS(errors.nom)} />
            {errors.nom && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.nom}</span>}
          </div>
          <div className="form-group">
            <label>Prenom</label>
            <input value={form.prenom} onChange={e => setField('prenom', e.target.value)} placeholder="Prenom" style={IS(false)} />
          </div>
        </div>
        <div className="crm-form-grid">
          <div className="form-group">
            <label>Telephone</label>
            <input value={form.telephone} onChange={e => setField('telephone', e.target.value)} placeholder="+212 600 000 000" style={IS(false)} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="contact@client.ma" style={IS(false)} />
          </div>
        </div>
        <div className="form-group">
          <label>ICE</label>
          <input value={form.ice} onChange={e => setField('ice', e.target.value)} placeholder="000000000000000" style={IS(false)} />
        </div>
        <div className="crm-form-grid">
          <div className="form-group">
            <label>Responsable</label>
            <input value={form.responsable || ''} onChange={e => setField('responsable', e.target.value)} placeholder="Nom du responsable" style={IS(false)} />
          </div>
          <div className="form-group">
            <label>Secteur activite</label>
            <select value={form.secteur} onChange={e => setField('secteur', e.target.value)} style={IS(false)}>
              <option value="">Choisir...</option>
              {SECTEURS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Adresse</label>
          <input value={form.adresse} onChange={e => setField('adresse', e.target.value)} placeholder="Adresse complete" style={IS(false)} />
        </div>
        <div className="crm-form-grid">
          <div className="form-group">
            <label>Ville</label>
            <select value={form.ville} onChange={e => setField('ville', e.target.value)} style={IS(false)}>
              <option value="">Choisir...</option>
              {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {client && (
            <div className="form-group">
              <label>Statut</label>
              <select value={form.statut || 'actif'} onChange={e => setField('statut', e.target.value)} style={IS(false)}>
                {STATUT_CLIENT_VALUES.map(s => <option key={s} value={s}>{STATUT_CLIENT_LABEL[s]}</option>)}
              </select>
            </div>
          )}
        </div>
        <details className="crm-form-collapse" open>
          <summary>Notes</summary>
          <div className="form-group" style={{ marginTop: 10 }}>
            <textarea rows={3} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Notes internes..." style={{ ...IS(false), resize: 'vertical' }} />
          </div>
        </details>
        <div className="crm-form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <><Plus size={14} /> {client ? 'Enregistrer' : 'Creer client'}</>
            }
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════
   PAGE PRINCIPALE CLIENTS
   ═══════════════════════════════════════════════ */
export default function Clients({ onNavigate }) {
  const {
    records: clients,
    responsables,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterClients,
    computeClientsStats,
  } = useClients();

  const [selectedClient, setSelectedClient] = useState(null);
  const [detailInitialTab, setDetailInitialTab] = useState('overview');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterResponsable, setFilterResponsable] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState('');
  const [infoModal, setInfoModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const PER_PAGE = 10;

  function showToast(msg) { setToast(msg); }
  function hideToast() { setToast(''); }

  /* KPI */
  const allDevis = SEED_DEVIS;
  const allFactures = SEED_FACTURES;
  const totalEncaisse = allFactures.reduce((s, f) => s + f.montant_paye, 0);
  const totalRestant = allFactures.reduce((s, f) => s + (f.montant_total - f.montant_paye), 0);

  /* Filters */
  const filtered = useMemo(
    () => filterClients(clients, { search, statut: filterStatut, responsable: filterResponsable }),
    [clients, search, filterStatut, filterResponsable, filterClients],
  );
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const clientStats = useMemo(() => computeClientsStats(clients), [clients, computeClientsStats]);
  const responsableFilterOptions = useMemo(
    () => [...new Set([...RESPONSABLES, ...responsables])].sort((a, b) => a.localeCompare(b, 'fr')),
    [responsables],
  );

  function getClientStats(clientId) {
    const d = SEED_DEVIS.filter(x => x.client_id === clientId);
    const f = SEED_FACTURES.filter(x => x.client_id === clientId);
    const p = SEED_PROJETS.filter(x => x.client_id === clientId);
    const totalFact = f.reduce((s, x) => s + x.montant_total, 0);
    const totalPaye = f.reduce((s, x) => s + x.montant_paye, 0);
    return { nDevis: d.length, nFactures: f.length, nProjets: p.length, totalFacture: totalFact, restant: totalFact - totalPaye };
  }

  async function handleSave(data) {
    const result = editingClient
      ? await update(editingClient.id, data)
      : await create(data);
    if (!result.success) {
      showToast(result.error || 'Erreur enregistrement.');
      return result;
    }
    showToast(editingClient ? 'Client modifie avec succes !' : 'Client cree avec succes !');
    setShowModal(false);
    setEditingClient(null);
    return { success: true };
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce client ?')) return;
    setDeletingId(id);
    const result = await remove(id);
    setDeletingId(null);
    showToast(result.success ? 'Client supprime.' : (result.error || 'Erreur suppression.'));
    if (result.success && selectedClient && String(selectedClient.id) === String(id)) {
      setSelectedClient(null);
      setDetailInitialTab('overview');
    }
  }

  function openEdit(c) { setEditingClient(c); setShowModal(true); }

  function openView(c, tab = 'overview') {
    setDetailInitialTab(tab);
    setSelectedClient(c);
  }

  function openClientDevis(c) {
    const stats = getClientStats(c.id);
    if (stats.nDevis > 0) {
      openView(c, 'devis');
    } else {
      setInfoModal({
        title: 'Devis client',
        message: `Aucun devis disponible pour ${clientDisplayName(c)}. Fonction en preparation — le module Devis CRM sera bientot connecte.`,
      });
    }
  }

  function openClientFactures(c) {
    const stats = getClientStats(c.id);
    if (stats.nFactures > 0 || stats.totalFacture > 0) {
      openView(c, 'factures');
    } else {
      setInfoModal({
        title: 'Factures client',
        message: `Aucune facture disponible pour ${clientDisplayName(c)}. Fonction en preparation — le module Facturation sera bientot connecte.`,
      });
    }
  }

  function openClientProjets(c) {
    const stats = getClientStats(c.id);
    if (stats.nProjets > 0) {
      openView(c, 'projets');
    } else {
      setInfoModal({
        title: 'Projets client',
        message: `Aucun projet disponible pour ${clientDisplayName(c)}. Fonction en preparation.`,
      });
    }
  }

  function openCreateProforma(c) {
    try {
      sessionStorage.setItem('crm_proforma_intent', JSON.stringify({
        openCreate: true,
        clientId: c?.id ? String(c.id) : '',
      }));
    } catch { /* ignore */ }
    if (typeof onNavigate === 'function') {
      onNavigate('factures');
      return;
    }
    setInfoModal({
      title: 'Proforma',
      message: 'Ouvrez le menu CRM → Factures → onglet Proformas pour créer la proforma.',
    });
  }

  const freshSelectedClient = selectedClient
    ? clients.find(c => String(c.id) === String(selectedClient.id)) || selectedClient
    : null;

  if (freshSelectedClient) {
  return (
    <div className="animate-fade-in crm-module crm-module--clients">
      <Toast msg={toast} onClose={hideToast} />
      <ClientDetail
          client={freshSelectedClient}
          initialTab={detailInitialTab}
          onBack={() => { setSelectedClient(null); setDetailInitialTab('overview'); }}
          onEdit={() => openEdit(freshSelectedClient)}
          onDevisEmpty={() => openClientDevis(freshSelectedClient)}
          onFactureEmpty={() => openClientFactures(freshSelectedClient)}
          onProjetEmpty={() => openClientProjets(freshSelectedClient)}
          onCreateProforma={openCreateProforma}
        />
        {infoModal && (
          <ActionInfoModal
            title={infoModal.title}
            message={infoModal.message}
            onClose={() => setInfoModal(null)}
          />
        )}
        {showModal && (
          <ClientModal
            client={editingClient}
            onClose={() => { setShowModal(false); setEditingClient(null); }}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in crm-module crm-module--clients">
      <Toast msg={toast} onClose={hideToast} />

      {/* Header */}
      <div className="page-header flex-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">Gestion des clients, projets, devis et facturation</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingClient(null); setShowModal(true); }} disabled={loading || saving || !configured}>
          <Plus size={15} /> Nouveau client
        </button>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#C62828' }}>
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={load}>Réessayer</button>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '24px 0', color: 'var(--text-3)', fontSize: '0.875rem' }}>
          <Loader2 size={18} className="spin" /> Chargement des clients...
        </div>
      )}

      {!loading && (
      <>
      {/* KPI */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Users size={18} /></div>
          <div className="stat-body"><div className="stat-value">{clientStats.total}</div><div className="stat-label">Total clients</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><FileText size={18} /></div>
          <div className="stat-body"><div className="stat-value">{allDevis.length}</div><div className="stat-label">Total devis</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Receipt size={18} /></div>
          <div className="stat-body"><div className="stat-value">{allFactures.length}</div><div className="stat-label">Total factures</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><TrendingUp size={18} /></div>
          <div className="stat-body"><div className="stat-value">{(totalEncaisse / 1000000).toFixed(1)}M</div><div className="stat-label">Total encaisse (MAD)</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: 'var(--red)' }}><AlertCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{(totalRestant / 1000000).toFixed(1)}M</div><div className="stat-label">Restant a payer (MAD)</div></div>
        </div>
      </div>

      {/* Filtres */}
      <div className="card crm-filter-bar" style={{ marginBottom: 16 }}>
        <div className="crm-filter-row">
          <div className="crm-filter-search">
            <Search size={15} className="crm-filter-search-icon" />
            <input
              className="crm-filter-input"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher nom, email, telephone, ICE..."
            />
          </div>
          <select className="crm-filter-select crm-filter-select--md" value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }}>
            <option value="">Tous les statuts</option>
            {STATUT_CLIENT_VALUES.map(s => <option key={s} value={s}>{STATUT_CLIENT_LABEL[s]}</option>)}
          </select>
          <select className="crm-filter-select" value={filterResponsable} onChange={e => { setFilterResponsable(e.target.value); setPage(1); }}>
            <option value="">Tous responsables</option>
            {responsableFilterOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {(search || filterStatut || filterResponsable) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterResponsable(''); setPage(1); }}>
              <X size={13} /> Effacer
            </button>
          )}
          <span className="crm-filter-count">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="crm-table-desktop">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nom</th>
                  <th>Telephone</th>
                  <th>Email</th>
                  <th>ICE</th>
                  <th>Responsable</th>
                  <th>Projets</th>
                  <th>Devis</th>
                  <th>Total facture (MAD)</th>
                  <th>Reste (MAD)</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={12} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucun client trouve.</td></tr>
                ) : paginated.map(c => {
                  const stats = getClientStats(c.id);
                  const nomComplet = [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom;
                  return (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text-3)', fontSize: '0.8rem' }}>#{String(c.id).slice(0, 8)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>
                            {nomComplet.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{nomComplet}</div>
                            {c.secteur && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{c.secteur}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{c.telephone || '-'}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{c.email || '-'}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>{c.ice || '-'}</td>
                      <td style={{ fontSize: '0.85rem' }}>{c.responsable || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: stats.nProjets > 0 ? '#E3F2FD' : 'var(--bg)', color: stats.nProjets > 0 ? '#1976D2' : 'var(--text-3)', fontWeight: 700, fontSize: '0.8rem' }}>{stats.nProjets}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: stats.nDevis > 0 ? '#F3E5F5' : 'var(--bg)', color: stats.nDevis > 0 ? '#7B1FA2' : 'var(--text-3)', fontWeight: 700, fontSize: '0.8rem' }}>{stats.nDevis}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem' }}>{stats.totalFacture > 0 ? fmtMAD(stats.totalFacture) : '-'}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', color: stats.restant > 0 ? 'var(--red)' : '#2E7D32' }}>{stats.totalFacture > 0 ? fmtMAD(stats.restant) : '-'}</td>
                      <td><span className={'badge ' + STATUT_CLIENT_BADGE[c.statut]}>{STATUT_CLIENT_LABEL[c.statut]}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Voir fiche" onClick={(e) => { e.stopPropagation(); openView(c, 'overview'); }}><Eye size={13} /></button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Modifier" onClick={(e) => { e.stopPropagation(); openEdit(c); }}><Edit2 size={13} /></button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Devis" onClick={(e) => { e.stopPropagation(); openClientDevis(c); }}><FileText size={13} /></button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Factures" onClick={(e) => { e.stopPropagation(); openClientFactures(c); }}><Receipt size={13} /></button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Supprimer" disabled={deletingId === c.id || saving} onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>
                            {deletingId === c.id ? <Loader2 size={13} className="spin" style={{ color: 'var(--red)' }} /> : <Trash2 size={13} style={{ color: 'var(--red)' }} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {paginated.length === 0 ? (
          <div className="crm-mobile-only" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)' }}>Aucun client trouve.</div>
        ) : (
          <div className="crm-client-list crm-mobile-only" style={{ padding: '12px' }}>
            {paginated.map(c => {
              const stats = getClientStats(c.id);
              const nomComplet = [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom;
              const initials = nomComplet.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
              return (
                <div key={c.id} className="crm-client-card">
                  <div className="crm-client-top">
                    <div className="crm-client-avatar" aria-hidden="true">{initials}</div>
                    <div className="crm-client-info">
                      <div className="crm-client-name">{nomComplet}</div>
                      {(c.responsable || c.secteur) && (
                        <div className="crm-client-contact">{c.responsable || c.secteur}</div>
                      )}
                      <div className="crm-client-sub">
                        {[c.telephone, c.email].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <span className={'badge ' + STATUT_CLIENT_BADGE[c.statut]}>{STATUT_CLIENT_LABEL[c.statut]}</span>
                  </div>
                  <div className="crm-client-stats">
                    <span>Devis <strong>{stats.nDevis}</strong></span>
                    <span>Factures <strong>{stats.totalFacture > 0 ? fmtMAD(stats.totalFacture) : '—'}</strong></span>
                    <span>Reste <strong style={{ color: stats.restant > 0 ? 'var(--red)' : '#2E7D32' }}>{stats.totalFacture > 0 ? fmtMAD(stats.restant) : '—'}</strong></span>
                  </div>
                  <div className="crm-client-actions">
                    <button type="button" className="btn btn-ghost btn-sm crm-icon-btn" title="Voir" aria-label="Voir" onClick={() => openView(c, 'overview')}><Eye size={14} /></button>
                    <button type="button" className="btn btn-ghost btn-sm crm-icon-btn" title="Modifier" aria-label="Modifier" onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                    <CrmOverflowMenu
                      items={[
                        { icon: FileText, label: 'Documents / Devis', onClick: () => openClientDevis(c) },
                        { icon: Receipt, label: 'Factures', onClick: () => openClientFactures(c) },
                        { divider: true },
                        {
                          icon: Trash2,
                          label: deletingId === c.id ? 'Suppression…' : 'Supprimer',
                          danger: true,
                          disabled: deletingId === c.id || saving,
                          onClick: () => handleDelete(c.id),
                        },
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="crm-pagination">
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prec.</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const n = start + i;
              return (
              <button key={n} onClick={() => setPage(n)} className={'crm-page-btn' + (n === page ? ' crm-page-btn--active' : '')}>{n}</button>
            );})}
            <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Suiv.</button>
          </div>
        )}
      </div>
      </>
      )}

      {infoModal && (
        <ActionInfoModal
          title={infoModal.title}
          message={infoModal.message}
          onClose={() => setInfoModal(null)}
        />
      )}

      {/* Modal */}
      {showModal && (
        <ClientModal
          client={editingClient}
          onClose={() => { setShowModal(false); setEditingClient(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}
