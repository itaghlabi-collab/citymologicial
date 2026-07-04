/**
 * Charges.jsx — Gestion des dépenses et charges ERP CITYMO
 * Backend-ready / Supabase/S3-ready
 */
import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useFinanceCharges } from '../../hooks/useFinanceCharges';
import { chargeDisplayRef } from '../../services/finance/charges';
import {
  TrendingDown, Plus, Eye, Edit2, Trash2, Archive, Download,
  CheckCircle, XCircle, Search, Filter, FileText, Paperclip,
  BookOpen, AlertTriangle
} from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  MODES_PAIEMENT, STATUTS_CHARGE, BADGE_STATUT_CHARGE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
  formatMAD
} from './shared.jsx';

const EMPTY_FORM = {
  date: '', libelle: '', categorie: '', category_id: '', montant: '',
  fournisseur: '', projet_lie: '', project_id: '', vehicle_id: '', worker_id: '', client_id: '',
  departement: '', mode_paiement: 'Virement', ref_paiement: '',
  statut: 'Brouillon', commentaire: '', validateur: '', justificatifs: [],
};

function ChargeForm({ initial, categories, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.libelle.trim()) e.libelle = 'Requis';
    if (!form.montant || isNaN(Number(form.montant))) e.montant = 'Montant invalide';
    if (!form.date) e.date = 'Requis';
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
      <SectionTitle icon={<TrendingDown size={12} />}>Informations générales</SectionTitle>
      <FRow>
        <FField label="Date" required>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp('date')} />
          {errors.date && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.date}</div>}
        </FField>
        <FField label="Libellé" required>
          <input value={form.libelle} onChange={e => set('libelle', e.target.value)} placeholder="Description de la dépense..." style={inp('libelle')} />
          {errors.libelle && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.libelle}</div>}
        </FField>
        <FField label="Catégorie">
          <select
            value={form.category_id || ''}
            onChange={(e) => {
              const cat = categories.find((c) => c.id === e.target.value);
              set('category_id', e.target.value);
              set('categorie', cat?.nom || '');
            }}
            style={SELECT_STYLE}
          >
            <option value="">Sélectionner...</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </FField>
        <FField label="Montant (MAD)" required>
          <input type="number" min="0" step="0.01" value={form.montant} onChange={e => set('montant', e.target.value)} placeholder="0.00" style={inp('montant')} />
          {errors.montant && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.montant}</div>}
        </FField>
      </FRow>

      <SectionTitle icon={<FileText size={12} />}>Affectation</SectionTitle>
      <FRow>
        <FField label="Fournisseur"><input value={form.fournisseur} onChange={e => set('fournisseur', e.target.value)} placeholder="Nom du fournisseur..." style={INPUT_STYLE} /></FField>
        <FField label="Projet lié"><input value={form.projet_lie} onChange={e => set('projet_lie', e.target.value)} placeholder="Réf. projet..." style={INPUT_STYLE} /></FField>
        <FField label="Département"><input value={form.departement} onChange={e => set('departement', e.target.value)} placeholder="Département concerné..." style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<BookOpen size={12} />}>Paiement</SectionTitle>
      <FRow>
        <FField label="Mode de paiement">
          <select value={form.mode_paiement} onChange={e => set('mode_paiement', e.target.value)} style={SELECT_STYLE}>
            {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </FField>
        <FField label="Référence paiement"><input value={form.ref_paiement} onChange={e => set('ref_paiement', e.target.value)} placeholder="N° chèque, virement..." style={INPUT_STYLE} /></FField>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_CHARGE.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<Paperclip size={12} />}>Documents justificatifs</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <UploadField label="Justificatif PDF / Image facture / Pièces jointes" />
      </div>

      <SectionTitle icon={<CheckCircle size={12} />}>Suivi & Validation</SectionTitle>
      <div style={{ marginBottom: 20 }}>
        <FField label="Commentaire / Note interne">
          <textarea value={form.commentaire} onChange={e => set('commentaire', e.target.value)} placeholder="Commentaire, contexte, note de validation..." style={TEXTAREA_STYLE} />
        </FField>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Ajouter dépense'}
        </button>
      </div>
    </form>
  );
}

function DetailCharge({ charge, onBack, onEdit, onDelete, onValider, onComptabiliser }) {
  return (
    <div className="animate-fade-in">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
        ← Retour
      </button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{chargeDisplayRef(charge) || '—'}</h1>
          <p className="page-subtitle">{charge.libelle} — {charge.date}</p>
        </div>
        <div className="finance-page-actions">
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          {charge.statut === 'En attente validation' && (
            <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onValider(charge)}>
              <CheckCircle size={13} /> Valider
            </button>
          )}
          {charge.statut === 'Validée' && (
            <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onComptabiliser(charge)}>
              <BookOpen size={13} /> Comptabiliser
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onDelete(charge.id)}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="finance-detail-grid">
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle icon={<TrendingDown size={13} />}>Informations dépense</SectionTitle>
            <div className="finance-detail-fields">
              {[
                ['Libellé', charge.libelle],
                ['Date', charge.date || '—'],
                ['Catégorie', charge.categorie || '—'],
                ['Mode paiement', charge.mode_paiement || '—'],
                ['Référence', charge.ref_paiement || '—'],
                ['Fournisseur', charge.fournisseur || '—'],
                ['Projet lié', charge.projet_lie || '—'],
                ['Département', charge.departement || '—'],
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
            <SectionTitle icon={<CheckCircle size={13} />}>Historique de validation</SectionTitle>
            <EmptyState icon={<CheckCircle size={20} />} title="Aucune action" sub="Les validations et modifications apparaîtront ici" />
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={<BookOpen size={13} />}>Synthèse</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['Référence', chargeDisplayRef(charge) || '—'],
              ['Montant', <span style={{ fontFamily: 'var(--font-head)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--red)' }}>{formatMAD(charge.montant)}</span>],
              ['Statut', <span className={"badge " + (BADGE_STATUT_CHARGE[charge.statut] || 'badge-grey')}>{charge.statut}</span>],
              ['Créé le', charge.date_creation || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lbl}</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>{val}</span>
              </div>
            ))}
            {charge.commentaire && (
              <div style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-2)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Commentaire</div>
                {charge.commentaire}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Charges({ categories }) {
  const { records: charges, loading, error, save, remove } = useFinanceCharges();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editCharge, setEditCharge] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const cats = categories || [];
  const today = new Date().toISOString().slice(0, 10);
  const moisActuel = today.slice(0, 7);

  const handleSave = useCallback(async (data) => {
    const cat = cats.find((c) => c.id === data.category_id);
    const catName = cat?.nom || data.categorie || '';
    const res = await save({ ...data, categorie: catName }, editCharge?.id, catName);
    if (res.success) {
      setShowModal(false);
      setEditCharge(null);
    }
  }, [editCharge, save, cats]);

  async function handleDelete(id) {
    if (window.confirm('Supprimer cette dépense ?')) {
      await remove(id);
      setDetailId(null);
    }
  }

  async function handleValider(charge) {
    await save({ ...charge, statut: 'Validé' }, charge.id, charge.categorie);
  }

  async function handleComptabiliser(charge) {
    await save({ ...charge, statut: 'Payé' }, charge.id, charge.categorie);
  }

  async function handleRefuser(charge) {
    await save({ ...charge, statut: 'Annulé' }, charge.id, charge.categorie);
  }

  const filtered = charges.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || chargeDisplayRef(c).toLowerCase().includes(q) || c.libelle?.toLowerCase().includes(q) || (c.fournisseur || '').toLowerCase().includes(q) || (c.projet_lie || '').toLowerCase().includes(q);
    const matchS = !filterStatut || c.statut === filterStatut;
    const matchC = !filterCat || c.categorie === filterCat;
    const matchM = !filterMode || c.mode_paiement === filterMode;
    return matchQ && matchS && matchC && matchM;
  });

  const totalDep     = charges.reduce((s, c) => s + (c.montant || 0), 0);
  const depMois      = charges.filter(c => (c.date || '').startsWith(moisActuel)).reduce((s, c) => s + (c.montant || 0), 0);
  const depProjet    = charges.filter(c => c.projet_lie).reduce((s, c) => s + (c.montant || 0), 0);
  const depHorsProj  = charges.filter(c => !c.projet_lie).reduce((s, c) => s + (c.montant || 0), 0);
  const validees     = charges.filter(c => c.statut === 'Validée' || c.statut === 'Comptabilisée').length;
  const enAttente    = charges.filter(c => c.statut === 'En attente validation' || c.statut === 'Brouillon').length;

  if (loading && !charges.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement des dépenses…
      </div>
    );
  }

  if (detailId) {
    const charge = charges.find(c => c.id === detailId);
    if (!charge) { setDetailId(null); return null; }
    return (
      <DetailCharge
        charge={charge}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditCharge(charge); setShowModal(true); setDetailId(null); }}
        onDelete={handleDelete}
        onValider={handleValider}
        onComptabiliser={handleComptabiliser}
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
          <h1 className="page-title">DÉPENSES GÉNÉRALES</h1>
          <p className="page-subtitle finance-sub-hide-mobile">Gestion des dépenses et affectations financières.</p>
        </div>
        <div className="finance-page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditCharge(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter dépense
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid finance-kpi-grid finance-kpi-strip">
        <KpiCard icon={<TrendingDown size={17} />} label="Total dépenses"       value={formatMAD(totalDep)}   color="red"    />
        <KpiCard icon={<TrendingDown size={17} />} label="Dépenses ce mois"     value={formatMAD(depMois)}    color="orange" />
        <KpiCard icon={<FileText size={17} />}     label="Sur projets"          value={formatMAD(depProjet)}  color="blue"   />
        <KpiCard icon={<FileText size={17} />}     label="Hors projet"          value={formatMAD(depHorsProj)} color="grey"  />
        <KpiCard icon={<CheckCircle size={17} />}  label="Validées"             value={validees}              color="green"  />
        <KpiCard icon={<AlertTriangle size={17} />} label="En attente"          value={enAttente}             color="orange" />
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div className="finance-toolbar-inner">
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Réf., libellé, fournisseur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Toutes catégories</option>
              {cats.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
            </select>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous les statuts</option>
              {STATUTS_CHARGE.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterMode} onChange={e => setFilterMode(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous modes</option>
              {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterCat(''); setFilterMode(''); }}>
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une dépense..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<TrendingDown size={24} />}
            title="Aucune dépense"
            sub="Enregistrez votre première charge financière"
            action="Ajouter dépense"
            onAction={() => { setEditCharge(null); setShowModal(true); }}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Catégorie</th>
                  <th>Fournisseur</th>
                  <th>Projet</th>
                  <th>Montant</th>
                  <th>Mode</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td data-label="Référence">
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{chargeDisplayRef(c) || '—'}</span>
                    </td>
                    <td data-label="Date">{c.date || '—'}</td>
                    <td data-label="Libellé">
                      <div style={{ fontWeight: 600, fontSize: '0.87rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.libelle}</div>
                    </td>
                    <td data-label="Catégorie">
                      {c.categorie ? <span className="badge badge-grey" style={{ fontSize: '0.72rem' }}>{c.categorie}</span> : '—'}
                    </td>
                    <td data-label="Fournisseur">{c.fournisseur || '—'}</td>
                    <td data-label="Projet">{c.projet_lie || '—'}</td>
                    <td data-label="Montant">
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{formatMAD(c.montant)}</span>
                    </td>
                    <td data-label="Mode">{c.mode_paiement || '—'}</td>
                    <td data-label="Statut">
                      <span className={"badge " + (BADGE_STATUT_CHARGE[c.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{c.statut}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(c.id)}><Eye size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditCharge(c); setShowModal(true); }}><Edit2 size={13} /></button>
                        {c.statut === 'En attente validation' && (
                          <button className="btn btn-ghost btn-sm" title="Valider" onClick={() => handleValider(c)} style={{ color: '#2E7D32' }}><CheckCircle size={13} /></button>
                        )}
                        {c.statut === 'En attente validation' && (
                          <button className="btn btn-ghost btn-sm" title="Refuser" onClick={() => handleRefuser(c)} style={{ color: 'var(--red)' }}><XCircle size={13} /></button>
                        )}
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(c.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
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
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditCharge(null); }} title={editCharge ? 'Modifier la dépense' : 'Nouvelle dépense'} width={720}>
        <ChargeForm initial={editCharge} categories={cats} onSave={handleSave} onCancel={() => { setShowModal(false); setEditCharge(null); }} />
      </Modal>
    </div>
  );
}
