/**
 * OrdresPaiement.jsx — Gestion des ordres de paiement ERP CITYMO
 * Backend-ready / Supabase/S3-ready
 */
import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { usePaymentOrders } from '../../hooks/usePaymentOrders';
import { exportPaymentOrderPdf } from '../../services/finance/paymentOrderPdf';
import { normalizePaymentOrderStatut } from '../../services/finance/paymentOrders';
import {
  CreditCard, Plus, Eye, Edit2, Trash2, Download,
  CheckCircle, XCircle, Search, Filter, FileText,
  Paperclip, BookOpen, Clock, PlayCircle, AlertTriangle,
} from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  MODES_PAIEMENT, STATUTS_ORDRE, BADGE_STATUT_ORDRE, TYPES_BENEF,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
  formatMAD, genRef, genId
} from './shared.jsx';

const EMPTY_FORM = {
  beneficiaire: '', type_benef: 'Fournisseur', fournisseur_lie: '', employe_lie: '',
  montant: '', mode_paiement: 'Virement', ref_reglement: '',
  comptabilise: 'Non', motif: '', commentaire: '', observation: '',
  date: '', date_prevue: '', prepare_par: '', valide_par: '',
  category_id: '', project_id: '', statut: 'À préparer', justificatifs: [],
};

function OrdreForm({ initial, categories, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.beneficiaire.trim()) e.beneficiaire = 'Requis';
    if (!form.montant || isNaN(Number(form.montant))) e.montant = 'Montant invalide';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...form, montant: parseFloat(form.montant) || 0 });
  }

  const inp = (k) => ({ ...INPUT_STYLE, borderColor: errors[k] ? 'var(--red)' : 'var(--border)' });

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<CreditCard size={12} />}>Bénéficiaire</SectionTitle>
      <FRow>
        <FField label="Bénéficiaire" required>
          <input value={form.beneficiaire} onChange={e => set('beneficiaire', e.target.value)} placeholder="Nom du bénéficiaire..." style={inp('beneficiaire')} />
          {errors.beneficiaire && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.beneficiaire}</div>}
        </FField>
        <FField label="Type bénéficiaire">
          <select value={form.type_benef} onChange={e => set('type_benef', e.target.value)} style={SELECT_STYLE}>
            {TYPES_BENEF.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Fournisseur lié">
          <input value={form.fournisseur_lie} onChange={e => set('fournisseur_lie', e.target.value)} placeholder="Réf. fournisseur..." style={INPUT_STYLE} />
        </FField>
        <FField label="Employé lié (si applicable)">
          <input value={form.employe_lie} onChange={e => set('employe_lie', e.target.value)} placeholder="Nom ou matricule..." style={INPUT_STYLE} />
        </FField>
      </FRow>

      <SectionTitle icon={<BookOpen size={12} />}>Paiement</SectionTitle>
      <FRow>
        <FField label="Montant (MAD)" required>
          <input type="number" min="0" step="0.01" value={form.montant} onChange={e => set('montant', e.target.value)} placeholder="0.00" style={inp('montant')} />
          {errors.montant && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.montant}</div>}
        </FField>
        <FField label="Mode de paiement">
          <select value={form.mode_paiement} onChange={e => set('mode_paiement', e.target.value)} style={SELECT_STYLE}>
            {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </FField>
        <FField label="Référence règlement">
          <input value={form.ref_reglement} onChange={e => set('ref_reglement', e.target.value)} placeholder="N° virement, chèque..." style={INPUT_STYLE} />
        </FField>
        <FField label="Date paiement prévue">
          <input type="date" value={form.date_prevue} onChange={e => set('date_prevue', e.target.value)} style={INPUT_STYLE} />
        </FField>
      </FRow>

      <SectionTitle icon={<FileText size={12} />}>Comptabilisation</SectionTitle>
      <FRow>
        <FField label="Comptabilisé">
          <select value={form.comptabilise} onChange={e => set('comptabilise', e.target.value)} style={SELECT_STYLE}>
            <option value="Non">Non</option>
            <option value="Oui">Oui</option>
          </select>
        </FField>
        <FField label="Statut validation">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_ORDRE.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<Paperclip size={12} />}>Justificatifs</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <UploadField label="Facture / Document paiement / Preuve virement" />
      </div>

      <SectionTitle icon={<CheckCircle size={12} />}>Détails</SectionTitle>
      <FRow>
        <FField label="Date ordre">
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="Motif du règlement">
          <input value={form.motif} onChange={e => set('motif', e.target.value)} placeholder="Motif du paiement..." style={INPUT_STYLE} />
        </FField>
        <FField label="Préparé par">
          <input value={form.prepare_par} onChange={e => set('prepare_par', e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="Validé par">
          <input value={form.valide_par} onChange={e => set('valide_par', e.target.value)} style={INPUT_STYLE} />
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Observation">
          <textarea value={form.observation || form.commentaire} onChange={e => set('observation', e.target.value)} placeholder="Observation, note de validation..." style={TEXTAREA_STYLE} />
        </FField>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Créer ordre'}
        </button>
      </div>
    </form>
  );
}

function DetailOrdre({ ordre, onBack, onEdit, onDelete, onValider, onExecuter, onComptabiliser }) {
  return (
    <div className="animate-fade-in">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
        ← Retour
      </button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{ordre.ref}</h1>
          <p className="page-subtitle">{ordre.beneficiaire} — {ordre.motif || 'Ordre de paiement'}</p>
        </div>
        <div className="finance-page-actions">
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => exportPaymentOrderPdf(ordre)}>
            <Download size={13} /> PDF
          </button>
          {(['À préparer', 'Brouillon', 'En attente', 'Soumis'].includes(normalizePaymentOrderStatut(ordre.statut))) && (
            <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onValider(ordre)}>
              <CheckCircle size={13} /> Préparer
            </button>
          )}
          {normalizePaymentOrderStatut(ordre.statut) === 'Préparé' && (
            <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onExecuter(ordre)}>
              <PlayCircle size={13} /> Marquer payé
            </button>
          )}
          {ordre.statut === 'Payé' && ordre.comptabilise === 'Non' && (
            <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onComptabiliser(ordre)}>
              <BookOpen size={13} /> Comptabiliser
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onDelete(ordre.id)}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="finance-detail-grid">
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle icon={<CreditCard size={13} />}>Informations ordre</SectionTitle>
            <div className="finance-detail-fields">
              {[
                ['Origine', ordre.origine || '—'],
                ['Bénéficiaire', ordre.beneficiaire],
                ['Type', ordre.type_benef || '—'],
                ['Fournisseur lié', ordre.fournisseur_lie || '—'],
                ['Employé lié', ordre.employe_lie || '—'],
                ['Mode paiement', ordre.mode_paiement || '—'],
                ['Référence règl.', ordre.ref_reglement || '—'],
                ['Date prévue', ordre.date_prevue || '—'],
                ['Motif', ordre.motif || '—'],
                ...(ordre.origine === 'Achats' ? [
                  ['Demande d\'achat', ordre.purchase_request_ref || '—'],
                  ['Ordre d\'achat', ordre.purchase_oa_ref || '—'],
                ] : []),
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ paddingBottom: 10, borderBottom: '1px solid var(--surface-2)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle icon={<Paperclip size={13} />}>Justificatifs</SectionTitle>
            <EmptyState icon={<Paperclip size={20} />} title="Aucun justificatif" sub="Les documents joints apparaîtront ici" />
          </div>

          <div className="card">
            <SectionTitle icon={<CheckCircle size={13} />}>Historique</SectionTitle>
            <EmptyState icon={<CheckCircle size={20} />} title="Aucune action" sub="Les validations et modifications apparaîtront ici" />
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={<BookOpen size={13} />}>Synthèse</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['Référence', ordre.ref],
              ['Montant', <span style={{ fontFamily: 'var(--font-head)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--red)' }}>{formatMAD(ordre.montant)}</span>],
              ['Statut', <span className={"badge " + (BADGE_STATUT_ORDRE[normalizePaymentOrderStatut(ordre.statut)] || 'badge-grey')}>{normalizePaymentOrderStatut(ordre.statut)}</span>],
              ['Comptabilisé', <span className={"badge " + (ordre.comptabilise === 'Oui' ? 'badge-green' : 'badge-grey')}>{ordre.comptabilise}</span>],
              ['Créé le', ordre.date_creation || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lbl}</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>{val}</span>
              </div>
            ))}
            {ordre.commentaire && (
              <div style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-2)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Commentaire</div>
                {ordre.commentaire}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrdresPaiement({ categories = [] }) {
  const { records: ordres, loading, error, save, remove } = usePaymentOrders();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterCompta, setFilterCompta] = useState('');
  const [filterOrigine, setFilterOrigine] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editOrdre, setEditOrdre] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  const handleSave = useCallback(async (data) => {
    const payload = editOrdre ? data : { ...data, ref: genRef('OP'), date: data.date || today };
    const res = await save(payload, editOrdre?.id);
    if (res.success) {
      setShowModal(false);
      setEditOrdre(null);
    }
  }, [editOrdre, save, today]);

  async function handleDelete(id) {
    if (window.confirm('Supprimer cet ordre de paiement ?')) {
      await remove(id);
      setDetailId(null);
    }
  }

  async function handleValider(ordre) {
    await save({ ...ordre, statut: 'Préparé' }, ordre.id);
  }

  async function handleExecuter(ordre) {
    await save({
      ...ordre,
      statut: 'Payé',
      comptabilise: 'Oui',
      date_paiement: ordre.date_paiement || today,
    }, ordre.id);
  }

  async function handleStatusChange(ordre, newStatut) {
    const payload = { ...ordre, statut: newStatut };
    if (newStatut === 'Payé') {
      payload.comptabilise = 'Oui';
      payload.date_paiement = ordre.date_paiement || today;
    }
    await save(payload, ordre.id);
  }

  async function handleComptabiliser(ordre) {
    await save({ ...ordre, statut: 'Comptabilisé', comptabilise: 'Oui' }, ordre.id);
  }

  const filtered = ordres.filter(o => {
    const q = search.toLowerCase();
    const matchQ = !q || o.ref?.toLowerCase().includes(q) || o.beneficiaire?.toLowerCase().includes(q) || (o.motif || '').toLowerCase().includes(q) || (o.fournisseur_lie || '').toLowerCase().includes(q) || (o.purchase_request_ref || '').toLowerCase().includes(q) || (o.purchase_oa_ref || '').toLowerCase().includes(q);
    const matchS = !filterStatut || normalizePaymentOrderStatut(o.statut) === filterStatut;
    const matchM = !filterMode || o.mode_paiement === filterMode;
    const matchC = !filterCompta || o.comptabilise === filterCompta;
    const matchO = !filterOrigine || o.origine === filterOrigine;
    return matchQ && matchS && matchM && matchC && matchO;
  });

  const enAttente = ordres.filter((o) => normalizePaymentOrderStatut(o.statut) === 'À préparer').length;
  const valides = ordres.filter((o) => normalizePaymentOrderStatut(o.statut) === 'Préparé').length;
  const executes = ordres.filter((o) => normalizePaymentOrderStatut(o.statut) === 'Payé').length;
  const montantAttente = ordres
    .filter((o) => normalizePaymentOrderStatut(o.statut) === 'À préparer')
    .reduce((s, o) => s + (o.montant || 0), 0);
  const comptabilises = ordres.filter((o) => o.comptabilise === 'Oui' || o.statut === 'Comptabilisé').length;

  if (loading && !ordres.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement des ordres de paiement…
      </div>
    );
  }

  if (detailId) {
    const ordre = ordres.find(o => o.id === detailId);
    if (!ordre) { setDetailId(null); return null; }
    return (
      <DetailOrdre
        ordre={ordre}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditOrdre(ordre); setShowModal(true); setDetailId(null); }}
        onDelete={handleDelete}
        onValider={() => handleValider(ordre)}
        onExecuter={() => handleExecuter(ordre)}
        onComptabiliser={() => handleComptabiliser(ordre)}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}
      {/* Header */}
      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">ORDRES DE PAIEMENT</h1>
          <p className="page-subtitle finance-sub-hide-mobile">Gestion des paiements et validations financières.</p>
        </div>
        <div className="finance-page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditOrdre(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter ordre de paiement
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid finance-kpi-grid finance-kpi-strip">
        <KpiCard icon={<Clock size={17} />}        label="En attente"          value={enAttente}              color="orange" />
        <KpiCard icon={<CheckCircle size={17} />}  label="Validés"             value={valides}                color="green"  />
        <KpiCard icon={<PlayCircle size={17} />}   label="Exécutés"            value={executes}               color="blue"   />
        <KpiCard icon={<AlertTriangle size={17} />} label="Montant en attente" value={formatMAD(montantAttente)} color="red"  />
        <KpiCard icon={<BookOpen size={17} />}     label="Comptabilisés"       value={comptabilises}          color="purple" />
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div className="finance-toolbar-inner">
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Réf., bénéficiaire, motif..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous les statuts</option>
              {STATUTS_ORDRE.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterMode} onChange={e => setFilterMode(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous modes</option>
              {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={filterCompta} onChange={e => setFilterCompta(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Comptabilisation</option>
              <option value="Oui">Comptabilisé</option>
              <option value="Non">Non comptabilisé</option>
            </select>
            <select value={filterOrigine} onChange={e => setFilterOrigine(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Toutes origines</option>
              <option value="Achats">Achats</option>
              <option value="Finance / Trésorerie">Finance / Trésorerie</option>
              <option value="Manuel">Manuel</option>
              <option value="Autre">Autre</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterMode(''); setFilterCompta(''); setFilterOrigine(''); }}>
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un ordre de paiement..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={24} />}
            title="Aucun ordre de paiement"
            sub="Créez votre premier ordre de paiement"
            action="Ajouter ordre de paiement"
            onAction={() => { setEditOrdre(null); setShowModal(true); }}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Origine</th>
                  <th>Bénéficiaire</th>
                  <th>Montant</th>
                  <th>Mode</th>
                  <th>Comptabilisé</th>
                  <th>Date prévue</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td data-label="Référence">
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{o.ref}</span>
                    </td>
                    <td data-label="Origine">
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{o.origine || '—'}</span>
                    </td>
                    <td data-label="Bénéficiaire">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{o.beneficiaire}</div>
                        {o.type_benef && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{o.type_benef}</div>}
                      </div>
                    </td>
                    <td data-label="Montant">
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{formatMAD(o.montant)}</span>
                    </td>
                    <td data-label="Mode">{o.mode_paiement || '—'}</td>
                    <td data-label="Comptabilisé">
                      <span className={"badge " + (o.comptabilise === 'Oui' ? 'badge-green' : 'badge-grey')} style={{ fontSize: '0.72rem' }}>{o.comptabilise}</span>
                    </td>
                    <td data-label="Date prévue">{o.date_prevue || '—'}</td>
                    <td data-label="Statut">
                      <select
                        value={normalizePaymentOrderStatut(o.statut)}
                        onChange={(e) => handleStatusChange(o, e.target.value)}
                        style={{ ...SELECT_STYLE, maxWidth: 140, fontSize: '0.78rem', padding: '5px 8px' }}
                      >
                        {STATUTS_ORDRE.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(o.id)}><Eye size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditOrdre(o); setShowModal(true); }}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="PDF" onClick={() => exportPaymentOrderPdf(o)}><Download size={13} /></button>
                        {normalizePaymentOrderStatut(o.statut) === 'À préparer' && (
                          <button className="btn btn-ghost btn-sm" title="Marquer préparé" onClick={() => handleValider(o)} style={{ color: '#2E7D32' }}><CheckCircle size={13} /></button>
                        )}
                        {normalizePaymentOrderStatut(o.statut) === 'Préparé' && (
                          <button className="btn btn-ghost btn-sm" title="Marquer payé" onClick={() => handleExecuter(o)} style={{ color: '#1565C0' }}><PlayCircle size={13} /></button>
                        )}
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(o.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditOrdre(null); }} title={editOrdre ? "Modifier l'ordre" : 'Nouvel ordre de paiement'} width={720}>
        <OrdreForm initial={editOrdre} categories={categories} onSave={handleSave} onCancel={() => { setShowModal(false); setEditOrdre(null); }} />
      </Modal>
    </div>
  );
}
