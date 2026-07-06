import { useState, useEffect } from 'react';
import {
  ChevronLeft, Plus, Trash2, Copy, AlertCircle,
  FileText, ChevronDown, ChevronUp, GripVertical, X,
  CreditCard, Check, Download
} from 'lucide-react';
import { listClients } from '../../services/crm/clients';
import { listArticles } from '../../services/crm/articles';
import { listCategories } from '../../services/crm/categories';
import { listCrmDevis, getCrmDevisById } from '../../services/crm/crmDevis';
import { generateCrmFactureNumero } from '../../services/crm/crmFactures';
import { generateFacturePdf } from '../../services/crm/facturePdf';

/* ── Helpers ── */
function fmtMAD(v) {
  const n = Number(v);
  if (isNaN(n)) return '0 MAD';
  return n.toLocaleString('fr-MA') + ' MAD';
}
function IS(err, extra = {}) {
  return {
    padding: '8px 11px',
    border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6, fontSize: '0.86rem', background: '#fff',
    outline: 'none', width: '100%', boxSizing: 'border-box',
    fontFamily: 'var(--font-body)', color: 'var(--text)',
    transition: 'border-color 0.15s', ...extra,
  };
}
function Label({ children, required }) {
  return (
    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
      {children}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );
}
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  );
}
function today() { return new Date().toISOString().slice(0, 10); }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/* ── Constants ── */
const UNITES    = ['unite', 'm2', 'ml', 'm3', 'm', 'forfait', 'heure', 'jour', 'pack'];
const TVA_TAUX  = [0, 7, 10, 14, 20];
const STATUTS   = ['brouillon', 'envoyee', 'payee', 'partiellement_payee', 'impayee', 'en_retard', 'annulee'];
const STATUT_LABEL = {
  brouillon:            'Brouillon',
  envoyee:              'Envoyée',
  payee:                'Payée',
  partiellement_payee:  'Part. payée',
  impayee:              'Impayée',
  en_retard:            'En retard',
  annulee:              'Annulée',
};
const MODALITES    = ['30 jours net', '60 jours net', 'Comptant', 'A la commande', '50% avance / 50% livraison', 'Sur devis'];
const MODES_PAIEMENT = ['virement', 'cheque', 'especes', 'carte', 'autre'];

/* ── Line factory ── */
const EMPTY_LIGNE = () => ({
  _id: Date.now() + Math.random(),
  type: 'article',
  designation: '', description: '', article_id: '', categorie_id: '',
  quantite: 1, unite: 'unite', prix_ht: 0, remise: 0, tva: 20,
});

const EMPTY_FACTURE = {
  numero: '',
  titre: '',
  statut: 'brouillon',
  date_emission: today(),
  date_echeance: addDays(30),
  commercial: '',
  type_projet: '',
  client_id: '',
  devis_id: '',
  modalites_paiement: '30 jours net',
  conditions: '',
  notes_internes: '',
  lignes: [EMPTY_LIGNE()],
  paiements: [],
  acompte_montant: 0,
  acompte_type: 'fixe',
};

/* ── Spinner ── */
function Spinner() {
  return <div style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;
}

/* ── Ligne Row ── */
function LigneRow({ ligne, categories, articles, onChange, onDelete, onDuplicate }) {
  const [showDesc, setShowDesc] = useState(false);
  const catArticles = articles.filter(a => !ligne.categorie_id || String(a.categorie_id) === String(ligne.categorie_id));
  const stHT  = Number(ligne.quantite) * Number(ligne.prix_ht) * (1 - Number(ligne.remise) / 100);
  const stTTC = stHT * (1 + Number(ligne.tva) / 100);

  function set(k, v) { onChange({ ...ligne, [k]: v }); }

  function onArticleChange(articleId) {
    const art = articles.find(a => String(a.id) === String(articleId));
    if (art) {
      onChange({ ...ligne, article_id: articleId, designation: art.nom || '', description: art.description || '', unite: art.unite || 'unite', prix_ht: art.prix_ht ?? art.prix ?? 0, remise: art.remise ?? 0, tva: art.tva ?? 20 });
    } else {
      set('article_id', articleId);
    }
  }

  if (ligne.type === 'titre') {
    return (
      <tr style={{ background: '#F5F6F8' }}>
        <td colSpan={9} style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GripVertical size={13} style={{ color: 'var(--text-3)', cursor: 'grab', flexShrink: 0 }} />
            <input value={ligne.designation} onChange={e => set('designation', e.target.value)} placeholder="Titre de section..." style={{ ...IS(false), fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.92rem', flex: 1 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'var(--border)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>Titre</span>
            <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3 }}><X size={13} /></button>
          </div>
        </td>
      </tr>
    );
  }
  if (ligne.type === 'note') {
    return (
      <tr style={{ background: '#FFFDE7' }}>
        <td colSpan={9} style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <GripVertical size={13} style={{ color: 'var(--text-3)', cursor: 'grab', flexShrink: 0, marginTop: 6 }} />
            <textarea value={ligne.designation} onChange={e => set('designation', e.target.value)} placeholder="Note ou commentaire..." rows={2} style={{ ...IS(false), resize: 'vertical', flex: 1, fontSize: '0.82rem', background: 'transparent' }} />
            <span style={{ fontSize: '0.72rem', color: '#F57C00', background: '#FFF3E0', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>Note</span>
            <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, marginTop: 2 }}><X size={13} /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={{ padding: '8px 6px', width: 20 }}><GripVertical size={13} style={{ color: 'var(--text-3)', cursor: 'grab' }} /></td>
      <td style={{ padding: '6px 6px', minWidth: 200 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <select value={ligne.categorie_id} onChange={e => set('categorie_id', e.target.value)} style={{ ...IS(false), fontSize: '0.78rem' }}>
            <option value="">Categorie...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <select value={ligne.article_id} onChange={e => onArticleChange(e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
            <option value="">Choisir article...</option>
            {catArticles.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
          <input value={ligne.designation} onChange={e => set('designation', e.target.value)} placeholder="Designation libre..." style={{ ...IS(false), fontSize: '0.82rem' }} />
          <button type="button" onClick={() => setShowDesc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.72rem', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            {showDesc ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Description
          </button>
          {showDesc && <textarea value={ligne.description} onChange={e => set('description', e.target.value)} placeholder="Description technique..." rows={2} style={{ ...IS(false), resize: 'vertical', fontSize: '0.78rem' }} />}
        </div>
      </td>
      <td style={{ padding: '6px 5px', width: 70 }}>
        <input type="number" min="0" step="0.01" value={ligne.quantite} onChange={e => set('quantite', e.target.value)} style={{ ...IS(false), textAlign: 'center', fontSize: '0.85rem' }} />
      </td>
      <td style={{ padding: '6px 5px', width: 80 }}>
        <select value={ligne.unite} onChange={e => set('unite', e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
          {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 5px', width: 105 }}>
        <input type="number" min="0" step="0.01" value={ligne.prix_ht} onChange={e => set('prix_ht', e.target.value)} style={{ ...IS(false), textAlign: 'right', fontSize: '0.85rem' }} />
      </td>
      <td style={{ padding: '6px 5px', width: 65 }}>
        <input type="number" min="0" max="100" step="1" value={ligne.remise} onChange={e => set('remise', e.target.value)} style={{ ...IS(false), textAlign: 'center', fontSize: '0.85rem' }} />
      </td>
      <td style={{ padding: '6px 5px', width: 72 }}>
        <select value={ligne.tva} onChange={e => set('tva', e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
          {TVA_TAUX.map(t => <option key={t} value={t}>{t}%</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 8px', width: 110, textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.88rem' }}>{fmtMAD(stHT.toFixed(2))}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>TTC: {fmtMAD(stTTC.toFixed(2))}</div>
      </td>
      <td style={{ padding: '6px 5px', width: 52 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button type="button" onClick={onDuplicate} title="Dupliquer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3 }}><Copy size={12} /></button>
          <button type="button" onClick={onDelete} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 3 }}><Trash2 size={12} /></button>
        </div>
      </td>
    </tr>
  );
}

/* ── Paiement Row ── */
function PaiementRow({ p, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#F0FFF4', borderRadius: 6, border: '1px solid #C8E6C9', fontSize: '0.82rem' }}>
      <Check size={13} style={{ color: '#388E3C', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fmtMAD(p.montant)}</span>
        <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>{p.date} — {p.mode}</span>
        {p.reference && <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>Ref: {p.reference}</span>}
      </div>
      <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}><X size={13} /></button>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FACTURE FORM — MAIN COMPONENT
   ════════════════════════════════════════════════ */
export default function FactureForm({ facture, onBack, onSaved, saving = false }) {
  const isEdit = !!facture;
  const [form, setForm] = useState(() => facture ? {
    ...EMPTY_FACTURE, ...facture,
    lignes: facture.lignes?.length ? facture.lignes.map(l => ({ ...EMPTY_LIGNE(), ...l, _id: l._id || Date.now() + Math.random() })) : [EMPTY_LIGNE()],
    paiements: facture.paiements || [],
  } : { ...EMPTY_FACTURE, numero: '' });

  const [clients, setClients]       = useState([]);
  const [articles, setArticles]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [devisList, setDevisList]   = useState([]);
  const [errors, setErrors]         = useState({});
  const [savingLocal, setSavingLocal] = useState(false);
  const [apiError, setApiError]     = useState('');
  const isSaving = saving || savingLocal;

  /* Paiement form */
  const [showPaiementForm, setShowPaiementForm] = useState(false);
  const [newPaiement, setNewPaiement] = useState({ montant: '', date: today(), mode: 'virement', reference: '' });

  useEffect(() => {
    Promise.all([listClients(), listArticles(), listCategories(), listCrmDevis()]).then(([cl, ar, ca, dv]) => {
      setClients(cl || []);
      setArticles(ar || []);
      setCategories(ca || []);
      setDevisList(dv || []);
    }).catch(() => {});
    if (!isEdit) {
      generateCrmFactureNumero()
        .then((num) => setForm(p => ({ ...p, numero: num })))
        .catch(() => {});
    }
  }, [isEdit]);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  /* Auto-fill from devis */
  async function loadFromDevis(devisId) {
    if (!devisId) {
      setField('devis_id', '');
      return;
    }
    try {
      const dv = await getCrmDevisById(devisId);
      setForm(p => ({
        ...p,
        devis_id: devisId,
        client_id: dv.client_id || p.client_id,
        commercial: dv.commercial || p.commercial,
        type_projet: dv.type_projet || p.type_projet,
        modalites_paiement: dv.modalites_paiement || p.modalites_paiement,
        conditions: dv.conditions || p.conditions,
        lignes: dv.lignes?.length ? dv.lignes.map(l => ({ ...EMPTY_LIGNE(), ...l, _id: Date.now() + Math.random() })) : p.lignes,
        titre: dv.titre ? 'Facture — ' + dv.titre : p.titre,
      }));
    } catch {
      const dv = devisList.find(d => String(d.id) === String(devisId));
      if (dv) {
        setForm(p => ({
          ...p,
          devis_id: devisId,
          client_id: dv.client_id || p.client_id,
          commercial: dv.commercial || p.commercial,
          titre: dv.titre ? 'Facture — ' + dv.titre : p.titre,
        }));
      }
    }
  }

  const selectedClient = clients.find(c => String(c.id) === String(form.client_id));

  /* Lignes CRUD */
  function addLigne(type = 'article') {
    setForm(p => ({ ...p, lignes: [...p.lignes, { ...EMPTY_LIGNE(), type }] }));
  }
  function updateLigne(idx, data) {
    setForm(p => { const ls = [...p.lignes]; ls[idx] = data; return { ...p, lignes: ls }; });
  }
  function deleteLigne(idx) {
    setForm(p => ({ ...p, lignes: p.lignes.filter((_, i) => i !== idx) }));
  }
  function duplicateLigne(idx) {
    setForm(p => {
      const ls = [...p.lignes];
      ls.splice(idx + 1, 0, { ...ls[idx], _id: Date.now() + Math.random() });
      return { ...p, lignes: ls };
    });
  }

  /* Paiements */
  function addPaiement() {
    if (!newPaiement.montant || Number(newPaiement.montant) <= 0) return;
    const p = { ...newPaiement, id: Date.now(), montant: Number(newPaiement.montant) };
    setForm(prev => ({ ...prev, paiements: [...prev.paiements, p] }));
    setNewPaiement({ montant: '', date: today(), mode: 'virement', reference: '' });
    setShowPaiementForm(false);
  }
  function deletePaiement(id) {
    setForm(p => ({ ...p, paiements: p.paiements.filter(px => px.id !== id) }));
  }

  /* Totals */
  const artLignes   = form.lignes.filter(l => l.type === 'article');
  const totalHT     = artLignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_ht) * (1 - Number(l.remise) / 100), 0);
  const totalTVA    = artLignes.reduce((s, l) => {
    const ht = Number(l.quantite) * Number(l.prix_ht) * (1 - Number(l.remise) / 100);
    return s + ht * Number(l.tva) / 100;
  }, 0);
  const totalTTC    = totalHT + totalTVA;
  const totalRemise = artLignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_ht) * (Number(l.remise) / 100), 0);
  const acompteMontant = form.acompte_type === 'pct'
    ? totalTTC * (Number(form.acompte_montant) / 100)
    : Number(form.acompte_montant) || 0;
  const totalPaye   = form.paiements.reduce((s, p) => s + Number(p.montant), 0);
  const resteAPayer = Math.max(0, totalTTC - totalPaye - acompteMontant);

  /* Auto statut */
  function computeStatut() {
    if (form.statut === 'annulee' || form.statut === 'brouillon') return form.statut;
    if (resteAPayer <= 0) return 'payee';
    if (totalPaye > 0) return 'partiellement_payee';
    if (form.date_echeance && new Date(form.date_echeance) < new Date()) return 'en_retard';
    return form.statut;
  }

  function validate() {
    const e = {};
    if (!form.titre?.trim()) e.titre = 'Requis';
    if (!form.client_id) e.client_id = 'Requis';
    return e;
  }

  async function handleSave(e) {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSavingLocal(true);
    try {
      const autoStatut = computeStatut();
      const payload = {
        ...form,
        statut: autoStatut,
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
        total_paye: totalPaye + acompteMontant,
        reste_a_payer: resteAPayer,
        lignes: form.lignes,
        paiements: form.paiements,
      };
      const result = await onSaved(payload, isEdit);
      if (result && result.success === false) {
        setApiError(result.error || "Erreur lors de l'enregistrement.");
      }
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSavingLocal(false);
    }
  }

  async function handlePdf() {
    if (!isEdit || !facture?.id) return;
    try {
      const catMap = Object.fromEntries(categories.map(c => [String(c.id), c.nom]));
      await generateFacturePdf({
        ...form,
        id: facture.id,
        client: selectedClient,
        client_nom: selectedClient ? [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom : '',
        devis_reference: devisList.find(d => String(d.id) === String(form.devis_id))?.reference || '',
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
        total_paye: totalPaye + acompteMontant,
        reste_a_payer: resteAPayer,
      }, catMap);
    } catch (err) {
      setApiError(err.message || 'Erreur generation PDF.');
    }
  }

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.875rem', fontWeight: 600, marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={16} /> Retour aux factures
      </button>

      <form onSubmit={handleSave}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{isEdit ? 'Modifier facture' : 'Nouvelle facture'}</h1>
            <p className="page-subtitle">{isEdit ? form.numero : 'Numero : ' + form.numero}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onBack}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ minWidth: 130 }}>
              {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Créer facture'}</>}
            </button>
          </div>
        </div>

        {apiError && (
          <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} /> {apiError}
          </div>
        )}

        {/* 2-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

          {/* ── LEFT ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Infos facture */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Informations facture</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label required>Titre de la facture</Label>
                  <input value={form.titre} onChange={e => setField('titre', e.target.value)} placeholder="Ex : Travaux villa Amrani — phase 2" style={IS(errors.titre)} />
                  {errors.titre && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.titre}</span>}
                </div>

                <div className="form-group">
                  <Label>Numero</Label>
                  <input value={form.numero} onChange={e => setField('numero', e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Statut</Label>
                  <select value={form.statut} onChange={e => setField('statut', e.target.value)} style={IS(false)}>
                    {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <Label>Date d'emission</Label>
                  <input type="date" value={form.date_emission} onChange={e => setField('date_emission', e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Date d'echeance</Label>
                  <input type="date" value={form.date_echeance} onChange={e => setField('date_echeance', e.target.value)} style={IS(false)} />
                </div>

                <div className="form-group">
                  <Label>Commercial</Label>
                  <input type="text" value={form.commercial} onChange={e => setField('commercial', e.target.value)} placeholder="Nom du commercial" style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Modalites de paiement</Label>
                  <select value={form.modalites_paiement} onChange={e => setField('modalites_paiement', e.target.value)} style={IS(false)}>
                    {MODALITES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Créer depuis un devis</Label>
                  <select value={form.devis_id} onChange={e => loadFromDevis(e.target.value)} style={IS(false)}>
                    <option value="">Aucun devis lie...</option>
                    {devisList.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.titre}</option>)}
                  </select>
                  {form.devis_id && (
                    <div style={{ fontSize: '0.72rem', color: '#388E3C', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={11} /> Donnees importees depuis le devis
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Client */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Client</SectionTitle>
              <div className="form-group">
                <Label required>Client</Label>
                <select value={form.client_id} onChange={e => setField('client_id', e.target.value)} style={IS(errors.client_id)}>
                  <option value="">Choisir un client...</option>
                  {clients.map(c => {
                    const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom || '';
                    return <option key={c.id} value={c.id}>{nom}</option>;
                  })}
                </select>
                {errors.client_id && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.client_id}</span>}
              </div>
              {selectedClient && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.82rem', marginTop: 10 }}>
                  {[
                    ['Societe / Nom', [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom],
                    ['Email', selectedClient.email],
                    ['Telephone', selectedClient.telephone],
                    ['ICE', selectedClient.ice],
                    ['Ville', selectedClient.ville],
                    ['Adresse', selectedClient.adresse],
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label}>
                      <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{label} : </span>
                      <span style={{ color: 'var(--text-2)' }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lignes */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Lignes de facturation</SectionTitle>
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                      <th style={{ width: 20, padding: '6px 5px' }} />
                      {['Designation', 'Qte', 'Unite', 'Prix HT', 'Rem.', 'TVA', 'Total HT', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 4 ? (i === 5 ? 'right' : 'center') : 'left', padding: '6px 6px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.lignes.map((ligne, idx) => (
                      <LigneRow
                        key={ligne._id}
                        ligne={ligne}
                        categories={categories}
                        articles={articles}
                        onChange={data => updateLigne(idx, data)}
                        onDelete={() => deleteLigne(idx)}
                        onDuplicate={() => duplicateLigne(idx)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLigne('article')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={13} /> Article
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLigne('titre')} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-2)' }}>
                  <Plus size={13} /> Titre section
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLigne('note')} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#F57C00' }}>
                  <Plus size={13} /> Note
                </button>
              </div>
            </div>

            {/* Acompte */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Acompte</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <Label>Type acompte</Label>
                  <select value={form.acompte_type} onChange={e => setField('acompte_type', e.target.value)} style={IS(false)}>
                    <option value="fixe">Montant fixe (MAD)</option>
                    <option value="pct">Pourcentage (%)</option>
                  </select>
                </div>
                <div className="form-group">
                  <Label>Montant acompte</Label>
                  <input type="number" min="0" step="0.01" value={form.acompte_montant} onChange={e => setField('acompte_montant', e.target.value)}
                    placeholder={form.acompte_type === 'pct' ? 'Ex: 30 (%)' : 'Ex: 5000'}
                    style={IS(false)} />
                </div>
                {acompteMontant > 0 && (
                  <div style={{ gridColumn: '1 / -1', background: '#F3E5F5', borderRadius: 6, padding: '8px 12px', fontSize: '0.82rem', color: '#6A1B9A' }}>
                    Acompte calcule : <strong>{fmtMAD(acompteMontant.toFixed(2))}</strong>
                    {form.acompte_type === 'pct' && <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>({form.acompte_montant}% du TTC)</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Paiements */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <SectionTitle>Reglement(s) encaisse(s)</SectionTitle>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPaiementForm(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                  <CreditCard size={13} /> Enregistrer un paiement
                </button>
              </div>

              {showPaiementForm && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <Label>Montant (MAD)</Label>
                      <input type="number" min="0" step="0.01" value={newPaiement.montant} onChange={e => setNewPaiement(p => ({ ...p, montant: e.target.value }))} placeholder="0.00" style={IS(false)} />
                    </div>
                    <div className="form-group">
                      <Label>Date</Label>
                      <input type="date" value={newPaiement.date} onChange={e => setNewPaiement(p => ({ ...p, date: e.target.value }))} style={IS(false)} />
                    </div>
                    <div className="form-group">
                      <Label>Mode</Label>
                      <select value={newPaiement.mode} onChange={e => setNewPaiement(p => ({ ...p, mode: e.target.value }))} style={IS(false)}>
                        {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <Label>Reference</Label>
                      <input value={newPaiement.reference} onChange={e => setNewPaiement(p => ({ ...p, reference: e.target.value }))} placeholder="N° cheque, virement..." style={IS(false)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn btn-primary" onClick={addPaiement} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Check size={13} /> Valider
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowPaiementForm(false)}>Annuler</button>
                  </div>
                </div>
              )}

              {form.paiements.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>Aucun reglement enregistre.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.paiements.map(p => <PaiementRow key={p.id} p={p} onDelete={() => deletePaiement(p.id)} />)}
                </div>
              )}
            </div>

            {/* Conditions */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Conditions et notes</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div className="form-group">
                  <Label>Conditions generales</Label>
                  <textarea rows={3} value={form.conditions} onChange={e => setField('conditions', e.target.value)} placeholder="Conditions generales, garanties, modalites de livraison..." style={{ ...IS(false), resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div className="form-group">
                  <Label>Notes internes</Label>
                  <textarea rows={2} value={form.notes_internes} onChange={e => setField('notes_internes', e.target.value)} placeholder="Notes internes (non visibles sur le PDF)..." style={{ ...IS(false, { background: '#FFFDE7' }), resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>

            {/* Totaux */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Recapitulatif</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Total HT brut', fmtMAD(artLignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_ht), 0).toFixed(2))],
                  ['Remises', '- ' + fmtMAD(totalRemise.toFixed(2))],
                  ['Total HT net', fmtMAD(totalHT.toFixed(2))],
                  ['TVA', fmtMAD(totalTVA.toFixed(2))],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: label === 'Remises' ? 'var(--red)' : 'var(--text)' }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.95rem', textTransform: 'uppercase' }}>Total TTC</span>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: 'var(--red)' }}>{fmtMAD(totalTTC.toFixed(2))}</span>
                </div>
                {acompteMontant > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0', color: '#7B1FA2' }}>
                    <span>Acompte</span>
                    <span style={{ fontWeight: 700 }}>- {fmtMAD(acompteMontant.toFixed(2))}</span>
                  </div>
                )}
                {totalPaye > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0', color: '#388E3C' }}>
                    <span>Deja paye</span>
                    <span style={{ fontWeight: 700 }}>- {fmtMAD(totalPaye.toFixed(2))}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', textTransform: 'uppercase' }}>Reste a payer</span>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.15rem', color: resteAPayer <= 0 ? '#388E3C' : 'var(--red)' }}>
                    {resteAPayer <= 0 ? 'Solde' : fmtMAD(resteAPayer.toFixed(2))}
                  </span>
                </div>
              </div>
            </div>

            {/* Resume */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Resume</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
                {[
                  ['Lignes article', artLignes.length],
                  ['Client', selectedClient ? ([selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom) : '—'],
                  ['Commercial', form.commercial || '—'],
                  ['Echeance', form.date_echeance || '—'],
                  ['Devis lie', form.devis_id ? (devisList.find(d => String(d.id) === String(form.devis_id))?.reference || form.devis_id) : 'Aucun'],
                  ['Reglements', form.paiements.length + ' enregistre(s)'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Actions</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ justifyContent: 'center' }}>
                  {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Créer la facture'}</>}
                </button>
                {isEdit && (
                  <button type="button" className="btn btn-ghost" onClick={handlePdf} style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Download size={14} /> Telecharger PDF
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={onBack} style={{ justifyContent: 'center' }}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
