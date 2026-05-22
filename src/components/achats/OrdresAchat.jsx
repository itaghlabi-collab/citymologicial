/**
 * OrdresAchat.jsx — Gestion des ordres d'achat ERP CITYMO
 * Backend-ready / database-ready
 */
import { useState, useCallback } from 'react';
import { ShoppingBag, Plus, Edit2, Trash2, CheckCircle, XCircle, Search, Filter, Download, ChevronLeft, Eye } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_ORDRE, BADGE_ORDRE, MODES_PAIEMENT,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
  genRef, genId, formatMAD
} from './shared.jsx';

const EMPTY_FORM = {
  fournisseur: '',
  contact_fourn: '',
  telephone_fourn: '',
  email_fourn: '',
  objet: '',
  montant_ht: '',
  tva: '20',
  montant_ttc: '',
  projet_lie: '',
  date_livraison: '',
  mode_paiement: '',
  statut: 'Brouillon',
  commentaire: '',
};

function OAForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function handleHTChange(val) {
    const ht = parseFloat(val) || 0;
    const tva = parseFloat(form.tva) || 0;
    const ttc = ht * (1 + tva / 100);
    setForm(p => ({ ...p, montant_ht: val, montant_ttc: ttc > 0 ? ttc.toFixed(2) : '' }));
  }
  function handleTVAChange(val) {
    const ht = parseFloat(form.montant_ht) || 0;
    const tva = parseFloat(val) || 0;
    const ttc = ht * (1 + tva / 100);
    setForm(p => ({ ...p, tva: val, montant_ttc: ttc > 0 ? ttc.toFixed(2) : '' }));
  }

  function validate() {
    const e = {};
    if (!form.fournisseur.trim()) e.fournisseur = 'Requis';
    if (!form.objet.trim()) e.objet = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Fournisseur */}
      <SectionTitle icon={<ShoppingBag size={12} />}>Fournisseur</SectionTitle>
      <FRow>
        <FField label="Fournisseur" required>
          <input
            value={form.fournisseur}
            onChange={e => set('fournisseur', e.target.value)}
            placeholder="Raison sociale du fournisseur"
            style={{ ...INPUT_STYLE, borderColor: errors.fournisseur ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.fournisseur && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.fournisseur}</div>}
        </FField>
        <FField label="Contact">
          <input
            value={form.contact_fourn}
            onChange={e => set('contact_fourn', e.target.value)}
            placeholder="Nom du contact"
            style={INPUT_STYLE}
          />
        </FField>
        <FField label="Téléphone">
          <input
            value={form.telephone_fourn}
            onChange={e => set('telephone_fourn', e.target.value)}
            placeholder="+212 6..."
            style={INPUT_STYLE}
          />
        </FField>
        <FField label="Email">
          <input
            type="email"
            value={form.email_fourn}
            onChange={e => set('email_fourn', e.target.value)}
            placeholder="contact@fournisseur.ma"
            style={INPUT_STYLE}
          />
        </FField>
      </FRow>

      {/* Détails achat */}
      <SectionTitle icon={<ShoppingBag size={12} />}>Détails de l'achat</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <FField label="Objet de la commande" required>
          <input
            value={form.objet}
            onChange={e => set('objet', e.target.value)}
            placeholder="Description de l'achat..."
            style={{ ...INPUT_STYLE, borderColor: errors.objet ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.objet && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.objet}</div>}
        </FField>
      </div>
      <FRow>
        <FField label="Montant HT (MAD)">
          <input
            type="number"
            value={form.montant_ht}
            onChange={e => handleHTChange(e.target.value)}
            placeholder="0.00"
            style={INPUT_STYLE}
          />
        </FField>
        <FField label="TVA (%)">
          <select value={form.tva} onChange={e => handleTVAChange(e.target.value)} style={SELECT_STYLE}>
            {[0, 7, 10, 14, 20].map(t => <option key={t} value={t}>{t}%</option>)}
          </select>
        </FField>
        <FField label="Montant TTC (MAD)">
          <input
            type="number"
            value={form.montant_ttc}
            onChange={e => set('montant_ttc', e.target.value)}
            placeholder="0.00"
            style={{ ...INPUT_STYLE, background: 'var(--surface-2)' }}
            readOnly
          />
        </FField>
        <FField label="Projet lié">
          <input
            value={form.projet_lie}
            onChange={e => set('projet_lie', e.target.value)}
            placeholder="Nom du projet"
            style={INPUT_STYLE}
          />
        </FField>
        <FField label="Date livraison souhaitée">
          <input
            type="date"
            value={form.date_livraison}
            onChange={e => set('date_livraison', e.target.value)}
            style={INPUT_STYLE}
          />
        </FField>
        <FField label="Mode de paiement">
          <select value={form.mode_paiement} onChange={e => set('mode_paiement', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_ORDRE.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      {/* Documents */}
      <SectionTitle>Documents joints</SectionTitle>
      <div style={{ marginBottom: 16 }}>
        <UploadField label="Bon de commande, devis, contrat..." />
      </div>

      {/* Commentaire */}
      <SectionTitle>Commentaire</SectionTitle>
      <div style={{ marginBottom: 20 }}>
        <FField label="Notes et observations">
          <textarea
            value={form.commentaire}
            onChange={e => set('commentaire', e.target.value)}
            placeholder="Instructions particulières, conditions de livraison..."
            style={TEXTAREA_STYLE}
          />
        </FField>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : "Créer l'ordre"}
        </button>
      </div>
    </form>
  );
}

function DetailView({ ordre, onBack, onEdit, onChangeStatut }) {
  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>
          {ordre.ref} — {ordre.objet}
        </h2>
        <span className={"badge " + (BADGE_ORDRE[ordre.statut] || 'badge-grey')}>{ordre.statut}</span>
        <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onEdit}>
          <Edit2 size={13} /> Modifier
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle icon={<ShoppingBag size={12} />}>Fournisseur</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Raison sociale</span><div style={{ fontWeight: 600 }}>{ordre.fournisseur || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Contact</span><div>{ordre.contact_fourn || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Téléphone</span><div>{ordre.telephone_fourn || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Email</span><div>{ordre.email_fourn || '—'}</div></div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle>Détails de la commande</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Montant HT</span><div style={{ fontWeight: 700 }}>{ordre.montant_ht ? formatMAD(ordre.montant_ht) : '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>TVA</span><div>{ordre.tva ? ordre.tva + '%' : '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Montant TTC</span><div style={{ fontWeight: 700, color: 'var(--red)' }}>{ordre.montant_ttc ? formatMAD(ordre.montant_ttc) : '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Projet lié</span><div>{ordre.projet_lie || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Mode paiement</span><div>{ordre.mode_paiement || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Livraison souhaitée</span><div>{ordre.date_livraison || '—'}</div></div>
            </div>
          </div>

          {ordre.commentaire && (
            <div className="card">
              <SectionTitle>Commentaire</SectionTitle>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0 }}>{ordre.commentaire}</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle>Informations</SectionTitle>
            <div style={{ fontSize: '0.84rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Référence</span><div style={{ fontWeight: 600 }}>{ordre.ref}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Date création</span><div>{ordre.date_creation || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Statut</span><span className={"badge " + (BADGE_ORDRE[ordre.statut] || 'badge-grey')}>{ordre.statut}</span></div>
            </div>
          </div>

          <div className="card">
            <SectionTitle>Actions rapides</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ordre.statut === 'Brouillon' && (
                <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                  onClick={() => onChangeStatut(ordre.id, 'En attente validation')}>
                  <CheckCircle size={13} /> Soumettre
                </button>
              )}
              {ordre.statut === 'En attente validation' && (
                <>
                  <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', background: 'var(--green, #2E7D32)', borderColor: 'var(--green, #2E7D32)' }}
                    onClick={() => onChangeStatut(ordre.id, 'Validé')}>
                    <CheckCircle size={13} /> Valider
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: 'var(--red)' }}
                    onClick={() => onChangeStatut(ordre.id, 'Refusé')}>
                    <XCircle size={13} /> Refuser
                  </button>
                </>
              )}
              {ordre.statut === 'Validé' && (
                <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                  onClick={() => onChangeStatut(ordre.id, 'Commandé')}>
                  <ShoppingBag size={13} /> Marquer commandé
                </button>
              )}
              {ordre.statut === 'Commandé' && (
                <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                  onClick={() => onChangeStatut(ordre.id, 'Clôturé')}>
                  <CheckCircle size={13} /> Clôturer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrdresAchat() {
  const [ordres, setOrdres] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editOrdre, setEditOrdre] = useState(null);
  const [detailOrdre, setDetailOrdre] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  const handleSave = useCallback((data) => {
    if (editOrdre) {
      setOrdres(prev => prev.map(o => o.id === editOrdre.id ? { ...o, ...data } : o));
      if (detailOrdre && detailOrdre.id === editOrdre.id) setDetailOrdre(prev => ({ ...prev, ...data }));
    } else {
      const newOrdre = { ...data, id: genId(), ref: genRef('OA'), date_creation: today };
      setOrdres(prev => [...prev, newOrdre]);
    }
    setShowModal(false);
    setEditOrdre(null);
  }, [editOrdre, detailOrdre, today]);

  function handleDelete(id) {
    if (window.confirm("Supprimer cet ordre d'achat ?")) {
      setOrdres(prev => prev.filter(o => o.id !== id));
      if (detailOrdre && detailOrdre.id === id) setDetailOrdre(null);
    }
  }

  function handleChangeStatut(id, newStatut) {
    setOrdres(prev => prev.map(o => o.id === id ? { ...o, statut: newStatut } : o));
    if (detailOrdre && detailOrdre.id === id) setDetailOrdre(prev => ({ ...prev, statut: newStatut }));
  }

  function openEdit(ordre) {
    setEditOrdre(ordre);
    setShowModal(true);
  }

  const filtered = ordres.filter(o => {
    const q = search.toLowerCase();
    const matchQ = !q || o.ref.toLowerCase().includes(q) || o.objet.toLowerCase().includes(q) || (o.fournisseur || '').toLowerCase().includes(q);
    const matchS = !filterStatut || o.statut === filterStatut;
    return matchQ && matchS;
  });

  const brouillons   = ordres.filter(o => o.statut === 'Brouillon').length;
  const enAttente    = ordres.filter(o => o.statut === 'En attente validation').length;
  const valides      = ordres.filter(o => o.statut === 'Validé').length;
  const commandes    = ordres.filter(o => o.statut === 'Commandé').length;
  const montantTotal = ordres.reduce((acc, o) => acc + (parseFloat(o.montant_ttc) || 0), 0);

  if (detailOrdre) {
    const current = ordres.find(o => o.id === detailOrdre.id) || detailOrdre;
    return (
      <DetailView
        ordre={current}
        onBack={() => setDetailOrdre(null)}
        onEdit={() => openEdit(current)}
        onChangeStatut={handleChangeStatut}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">ORDRES D'ACHAT</h1>
          <p className="page-subtitle">Gestion et suivi des ordres d'achat fournisseurs.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditOrdre(null); setShowModal(true); }}>
            <Plus size={15} /> Nouvel ordre
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<ShoppingBag size={17} />} label="Brouillons"     value={brouillons}            color="grey"   />
        <KpiCard icon={<ShoppingBag size={17} />} label="En attente"     value={enAttente}             color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Validés"        value={valides}               color="green"  />
        <KpiCard icon={<ShoppingBag size={17} />} label="Commandés"      value={commandes}             color="blue"   />
        <KpiCard icon={<ShoppingBag size={17} />} label="Montant total"  value={formatMAD(montantTotal)} color="red"  />
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, objet, fournisseur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Tous les statuts</option>
              {STATUTS_ORDRE.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {/* Barre recherche rapide */}
      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un ordre d'achat..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag size={24} />}
            title="Aucun ordre d'achat"
            sub="Créez votre premier ordre d'achat"
            action="Nouvel ordre"
            onAction={() => { setEditOrdre(null); setShowModal(true); }}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Fournisseur</th>
                  <th>Objet</th>
                  <th>Montant TTC</th>
                  <th>Date création</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setDetailOrdre(o)}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-head)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-2)' }}>{o.ref}</span>
                    </td>
                    <td data-label="Fournisseur">
                      <span style={{ fontWeight: 600 }}>{o.fournisseur || '—'}</span>
                    </td>
                    <td data-label="Objet">
                      <span style={{ fontSize: '0.83rem' }}>
                        {o.objet.length > 50 ? o.objet.slice(0, 50) + '...' : o.objet}
                      </span>
                    </td>
                    <td data-label="Montant TTC">
                      <span style={{ fontWeight: 700 }}>{o.montant_ttc ? formatMAD(o.montant_ttc) : '—'}</span>
                    </td>
                    <td data-label="Date">{o.date_creation || '—'}</td>
                    <td data-label="Statut">
                      <span className={"badge " + (BADGE_ORDRE[o.statut] || 'badge-grey')}>{o.statut}</span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" title="Voir" onClick={() => setDetailOrdre(o)}>
                          <Eye size={13} />
                        </button>
                        <button className="btn btn-secondary btn-sm" title="Modifier" onClick={() => openEdit(o)}>
                          <Edit2 size={13} />
                        </button>
                        {o.statut === 'Brouillon' && (
                          <button className="btn btn-ghost btn-sm" title="Soumettre" onClick={() => handleChangeStatut(o.id, 'En attente validation')}>
                            <CheckCircle size={13} />
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(o.id)} style={{ color: 'var(--red)' }}>
                          <ShoppingBag size={13} style={{ opacity: 0.6 }} />
                        </button>
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
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditOrdre(null); }} title={editOrdre ? "Modifier l'ordre d'achat" : "Nouvel ordre d'achat"} width={680}>
        <OAForm initial={editOrdre} onSave={handleSave} onCancel={() => { setShowModal(false); setEditOrdre(null); }} />
      </Modal>
    </div>
  );
}
