import { useState, useEffect } from 'react';
import {
  ChevronLeft, Plus, Trash2, Copy, AlertCircle,
  FileText, X, Check, Package, ChevronDown, ChevronUp
} from 'lucide-react';
import { listClients } from '../../services/crm/clients';
import { listArticles } from '../../services/crm/articles';
import { listCategories } from '../../services/crm/categories';
import { listCrmDevis, getCrmDevisById } from '../../services/crm/crmDevis';
import { generateDeliveryNoteNumero } from '../../services/crm/deliveryNotes';
import { clientDisplayName } from '../../services/crm/clients';

/* ── Helpers ── */
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
function Spinner() {
  return <div style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;
}

const UNITES   = ['unite', 'm2', 'ml', 'm3', 'm', 'forfait', 'heure', 'jour', 'pack', 'kg', 'tonne'];
const STATUTS  = ['brouillon', 'preparation', 'en_attente', 'livre', 'partiellement_livre', 'facture', 'annule'];
const STATUT_LABEL = {
  brouillon:             'Brouillon',
  preparation:           'Preparation',
  en_attente:            'En attente',
  livre:                 'Livre',
  partiellement_livre:   'Part. livre',
  facture:               'Facture',
  annule:                'Annule',
};
const STATUT_LIGNE = ['a_livrer', 'livre', 'non_livre', 'en_attente'];
const STATUT_LIGNE_LABEL = { a_livrer: 'A livrer', livre: 'Livre', non_livre: 'Non livre', en_attente: 'En attente' };

const EMPTY_LIGNE_BL = () => ({
  _id: Date.now() + Math.random(),
  article_id: '',
  categorie_id: '',
  designation: '',
  description: '',
  quantite_commandee: 1,
  quantite_livree: 0,
  quantite_restante: 1,
  unite: 'unite',
  observation: '',
  statut_ligne: 'a_livrer',
});

const EMPTY_BL = {
  numero: '',
  statut: 'brouillon',
  date_livraison: today(),
  date_echeance: addDays(7),
  commercial: '',
  client_id: '',
  devis_id: '',
  facture_id: '',
  projet: '',
  adresse_livraison: '',
  contact_reception: '',
  tel_reception: '',
  lignes: [EMPTY_LIGNE_BL()],
  remarques: '',
  notes_internes: '',
  signature_client: '',
  date_validation: '',
  est_facture: false,
};

/* ── Ligne BL Row ── */
function LigneBLRow({ ligne, categories, articles, onChange, onDelete, onDuplicate }) {
  const [showObs, setShowObs] = useState(false);
  const catArticles = articles.filter(a => !ligne.categorie_id || String(a.categorie_id) === String(ligne.categorie_id));

  function set(k, v) {
    const updated = { ...ligne, [k]: v };
    if (k === 'quantite_commandee' || k === 'quantite_livree') {
      const cmd = Number(k === 'quantite_commandee' ? v : ligne.quantite_commandee) || 0;
      const liv = Number(k === 'quantite_livree'    ? v : ligne.quantite_livree)    || 0;
      updated.quantite_restante = Math.max(0, cmd - liv);
    }
    onChange(updated);
  }

  function onArticleChange(articleId) {
    const art = articles.find(a => String(a.id) === String(articleId));
    if (art) {
      onChange({ ...ligne, article_id: articleId, designation: art.nom || '', description: art.description || '', unite: art.unite || 'unite' });
    } else {
      set('article_id', articleId);
    }
  }

  const pctLivre = ligne.quantite_commandee > 0
    ? Math.min(100, Math.round((Number(ligne.quantite_livree) / Number(ligne.quantite_commandee)) * 100))
    : 0;

  return (
    <tr>
      <td style={{ padding: '6px 8px', minWidth: 220 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <select value={ligne.categorie_id} onChange={e => set('categorie_id', e.target.value)} style={{ ...IS(false), fontSize: '0.78rem' }}>
            <option value="">Categorie...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <select value={ligne.article_id} onChange={e => onArticleChange(e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
            <option value="">Choisir article...</option>
            {catArticles.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
          <input value={ligne.designation} onChange={e => set('designation', e.target.value)} placeholder="Designation..." style={{ ...IS(false), fontSize: '0.82rem' }} />
          <button type="button" onClick={() => setShowObs(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.72rem', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            {showObs ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Observation
          </button>
          {showObs && (
            <textarea value={ligne.observation} onChange={e => set('observation', e.target.value)} placeholder="Observation..." rows={2} style={{ ...IS(false), resize: 'vertical', fontSize: '0.78rem' }} />
          )}
        </div>
      </td>
      <td style={{ padding: '6px 5px', width: 80 }}>
        <input type="number" min="0" step="0.01" value={ligne.quantite_commandee} onChange={e => set('quantite_commandee', e.target.value)} style={{ ...IS(false), textAlign: 'center', fontSize: '0.85rem' }} />
      </td>
      <td style={{ padding: '6px 5px', width: 80 }}>
        <input type="number" min="0" step="0.01" value={ligne.quantite_livree} onChange={e => set('quantite_livree', e.target.value)} style={{ ...IS(false), textAlign: 'center', fontSize: '0.85rem' }} />
      </td>
      <td style={{ padding: '6px 5px', width: 75 }}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', color: ligne.quantite_restante > 0 ? 'var(--red)' : '#388E3C' }}>
          {ligne.quantite_restante}
        </div>
        <div style={{ marginTop: 3, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pctLivre + '%', background: pctLivre >= 100 ? '#388E3C' : 'var(--red)', borderRadius: 2 }} />
        </div>
      </td>
      <td style={{ padding: '6px 5px', width: 85 }}>
        <select value={ligne.unite} onChange={e => set('unite', e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
          {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 5px', width: 110 }}>
        <select value={ligne.statut_ligne} onChange={e => set('statut_ligne', e.target.value)} style={{ ...IS(false), fontSize: '0.78rem' }}>
          {STATUT_LIGNE.map(s => <option key={s} value={s}>{STATUT_LIGNE_LABEL[s]}</option>)}
        </select>
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

/* ════════════════════════════════════════════════
   BON LIVRAISON FORM — MAIN
   ════════════════════════════════════════════════ */
export default function BonLivraisonForm({ bl, onBack, onSaved, saving: savingProp = false, configured = true }) {
  const isEdit = !!bl;

  const [form, setForm] = useState(() => bl ? {
    ...EMPTY_BL, ...bl,
    lignes: bl.lignes?.length
      ? bl.lignes.map(l => ({ ...EMPTY_LIGNE_BL(), ...l, _id: l._id || Date.now() + Math.random() }))
      : [EMPTY_LIGNE_BL()],
  } : { ...EMPTY_BL, numero: '' });

  const [clients, setClients]       = useState([]);
  const [articles, setArticles]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [devisList, setDevisList]   = useState([]);
  const [errors, setErrors]         = useState({});
  const [savingLocal, setSavingLocal] = useState(false);
  const [apiError, setApiError]     = useState('');
  const saving = savingProp || savingLocal;

  useEffect(() => {
    if (!configured) return;
    Promise.all([listClients(), listArticles(), listCategories(), listCrmDevis()])
      .then(([cl, ar, ca, dv]) => {
        setClients(cl || []);
        setArticles(ar || []);
        setCategories(ca || []);
        setDevisList(dv || []);
      })
      .catch(() => {});
  }, [configured]);

  useEffect(() => {
    if (!isEdit && configured && !form.numero) {
      generateDeliveryNoteNumero()
        .then((num) => setForm((p) => ({ ...p, numero: num })))
        .catch(() => {});
    }
  }, [isEdit, configured, form.numero]);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  /* Auto-fill from devis */
  async function loadFromDevis(devisId) {
    if (!devisId) {
      setForm(p => ({ ...p, devis_id: '', devis_reference: '' }));
      return;
    }
    try {
      const dv = await getCrmDevisById(devisId);
      const lignes = (dv.lignes || [])
        .filter(l => l.type === 'article')
        .map(l => ({
          ...EMPTY_LIGNE_BL(),
          _id: Date.now() + Math.random(),
          article_id: l.article_id || '',
          categorie_id: l.categorie_id || '',
          designation: l.designation || '',
          description: l.description || '',
          quantite_commandee: Number(l.quantite) || 1,
          quantite_livree: 0,
          quantite_restante: Number(l.quantite) || 1,
          unite: l.unite || 'unite',
        }));
      const cl = clients.find(c => String(c.id) === String(dv.client_id));
      setForm(p => ({
        ...p,
        devis_id: devisId,
        devis_reference: dv.reference || '',
        client_id: dv.client_id || p.client_id,
        client_nom: dv.client_nom || clientDisplayName(cl) || '',
        commercial: dv.commercial || p.commercial,
        prepare_par: dv.commercial || p.prepare_par,
        projet: dv.type_projet || p.projet,
        lignes: lignes.length ? lignes : [EMPTY_LIGNE_BL()],
      }));
    } catch {
      const dv = devisList.find(d => String(d.id) === String(devisId));
      if (!dv) return;
      setForm(p => ({
        ...p,
        devis_id: devisId,
        devis_reference: dv.reference || '',
        client_id: dv.client_id || p.client_id,
        commercial: dv.commercial || p.commercial,
        projet: dv.titre || p.projet,
      }));
    }
  }

  const selectedClient = clients.find(c => String(c.id) === String(form.client_id));

  /* Lignes CRUD */
  function addLigne() { setForm(p => ({ ...p, lignes: [...p.lignes, EMPTY_LIGNE_BL()] })); }
  function updateLigne(idx, data) { setForm(p => { const ls = [...p.lignes]; ls[idx] = data; return { ...p, lignes: ls }; }); }
  function deleteLigne(idx) { setForm(p => ({ ...p, lignes: p.lignes.filter((_, i) => i !== idx) })); }
  function duplicateLigne(idx) {
    setForm(p => {
      const ls = [...p.lignes];
      ls.splice(idx + 1, 0, { ...ls[idx], _id: Date.now() + Math.random() });
      return { ...p, lignes: ls };
    });
  }

  /* Summary stats */
  const totalArticles   = form.lignes.length;
  const totalCommandees = form.lignes.reduce((s, l) => s + Number(l.quantite_commandee || 0), 0);
  const totalLivrees    = form.lignes.reduce((s, l) => s + Number(l.quantite_livree    || 0), 0);
  const totalRestantes  = form.lignes.reduce((s, l) => s + Number(l.quantite_restante  || 0), 0);
  const pctGlobal       = totalCommandees > 0 ? Math.min(100, Math.round((totalLivrees / totalCommandees) * 100)) : 0;

  function validate() {
    const e = {};
    if (!form.client_id) e.client_id = 'Requis';
    if (!form.date_livraison) e.date_livraison = 'Requis';
    return e;
  }

  async function handleSave(e) {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSavingLocal(true);
    try {
      const cl = clients.find(c => String(c.id) === String(form.client_id));
      const payload = {
        ...form,
        client_nom: clientDisplayName(cl) || form.client_nom || '',
        prepare_par: form.prepare_par || form.commercial || '',
        total_articles: totalArticles,
        total_commandees: totalCommandees,
        total_livrees: totalLivrees,
        total_restantes: totalRestantes,
        pct_livre: pctGlobal,
      };
      const result = await onSaved(payload, isEdit);
      if (result && !result.success) {
        setApiError(result.error || "Erreur lors de l'enregistrement.");
      }
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSavingLocal(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <button type="button" className="crm-back-btn" onClick={onBack} aria-label="Retour aux bons de livraison">
        <ChevronLeft size={16} /> Retour aux bons de livraison
      </button>

      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{isEdit ? 'Modifier bon de livraison' : 'Nouveau bon de livraison'}</h1>
            <p className="page-subtitle">{form.numero}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onBack}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 150 }}>
              {saving ? <Spinner /> : <><Package size={14} /> {isEdit ? 'Enregistrer' : 'Creer le BL'}</>}
            </button>
          </div>
        </div>

        {apiError && (
          <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} /> {apiError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

          {/* ── LEFT ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Infos BL */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Informations bon de livraison</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  <Label required>Date de livraison</Label>
                  <input type="date" value={form.date_livraison} onChange={e => setField('date_livraison', e.target.value)} style={IS(errors.date_livraison)} />
                  {errors.date_livraison && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.date_livraison}</span>}
                </div>
                <div className="form-group">
                  <Label>Date echeance</Label>
                  <input type="date" value={form.date_echeance} onChange={e => setField('date_echeance', e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Commercial</Label>
                  <input
                    type="text"
                    value={form.commercial}
                    onChange={e => setField('commercial', e.target.value)}
                    placeholder="Nom du commercial..."
                    style={IS(false)}
                  />
                </div>
                <div className="form-group">
                  <Label>Projet</Label>
                  <input value={form.projet} onChange={e => setField('projet', e.target.value)} placeholder="Nom du projet..." style={IS(false)} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Creer depuis un devis valide</Label>
                  <select value={form.devis_id} onChange={e => { setField('devis_id', e.target.value); loadFromDevis(e.target.value); }} style={IS(false)}>
                    <option value="">Aucun devis lie...</option>
                    {devisList.filter(d => d.statut === 'valide' || d.statut === 'envoye').map(d => (
                      <option key={d.id} value={d.id}>{d.reference} — {d.titre}</option>
                    ))}
                  </select>
                  {form.devis_id && (
                    <div style={{ fontSize: '0.72rem', color: '#388E3C', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={11} /> Articles importes depuis le devis
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Client + Livraison */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Client et adresse de livraison</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
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
                  <div style={{ gridColumn: '1 / -1', background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.82rem' }}>
                    {[
                      ['Nom', [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ')],
                      ['Email', selectedClient.email],
                      ['Tel', selectedClient.telephone],
                      ['Ville', selectedClient.ville],
                    ].filter(([, v]) => v).map(([label, val]) => (
                      <div key={label}>
                        <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{label} : </span>
                        <span style={{ color: 'var(--text-2)' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Adresse de livraison</Label>
                  <textarea rows={2} value={form.adresse_livraison} onChange={e => setField('adresse_livraison', e.target.value)} placeholder="Adresse complete du chantier ou du client..." style={{ ...IS(false), resize: 'vertical' }} />
                </div>
                <div className="form-group">
                  <Label>Contact a la reception</Label>
                  <input value={form.contact_reception} onChange={e => setField('contact_reception', e.target.value)} placeholder="Nom du responsable..." style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Tel reception</Label>
                  <input value={form.tel_reception} onChange={e => setField('tel_reception', e.target.value)} placeholder="+212..." style={IS(false)} />
                </div>
              </div>
            </div>

            {/* Articles */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Articles a livrer</SectionTitle>
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                      {[
                        ['Designation', 'left', 'auto'],
                        ['Qte cmd.', 'center', 80],
                        ['Qte livree', 'center', 80],
                        ['Restant', 'center', 75],
                        ['Unite', 'left', 85],
                        ['Statut', 'left', 110],
                        ['', 'left', 52],
                      ].map(([h, align, w]) => (
                        <th key={h} style={{ textAlign: align, padding: '6px 6px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.06em', whiteSpace: 'nowrap', width: w !== 'auto' ? w : undefined }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.lignes.map((ligne, idx) => (
                      <LigneBLRow
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={addLigne} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={13} /> Ajouter un article
              </button>
            </div>

            {/* Validation / Signature */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Validation et reception</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <Label>Date de validation</Label>
                  <input type="date" value={form.date_validation} onChange={e => setField('date_validation', e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Signature / Nom receptionnaire</Label>
                  <input value={form.signature_client} onChange={e => setField('signature_client', e.target.value)} placeholder="Nom et qualite..." style={IS(false)} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Remarques a la livraison</Label>
                  <textarea rows={3} value={form.remarques} onChange={e => setField('remarques', e.target.value)} placeholder="Observations, reserves, manquants..." style={{ ...IS(false), resize: 'vertical' }} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Notes internes</Label>
                  <textarea rows={2} value={form.notes_internes} onChange={e => setField('notes_internes', e.target.value)} placeholder="Notes internes (non visibles sur le PDF)..." style={{ ...IS(false, { background: '#FFFDE7' }), resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>

            {/* Avancement */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Avancement livraison</SectionTitle>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '2rem', color: pctGlobal >= 100 ? '#388E3C' : 'var(--red)', lineHeight: 1 }}>
                  {pctGlobal}%
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 4 }}>livre</div>
                <div style={{ marginTop: 10, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: pctGlobal + '%', background: pctGlobal >= 100 ? '#388E3C' : 'var(--red)', borderRadius: 4, transition: 'width 0.3s ease' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Articles', totalArticles],
                  ['Total commande', totalCommandees + ' unites'],
                  ['Livre', totalLivrees + ' unites'],
                  ['Restant', totalRestantes + ' unites'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Resume */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Resume</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.82rem' }}>
                {[
                  ['Client', selectedClient ? ([selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom) : '—'],
                  ['Commercial', form.commercial || '—'],
                  ['Date livraison', form.date_livraison || '—'],
                  ['Devis lie', form.devis_id ? (devisList.find(d => String(d.id) === String(form.devis_id))?.reference || 'Oui') : 'Non'],
                  ['Facture', form.est_facture ? 'Oui' : 'Non'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Actions</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ justifyContent: 'center' }}>
                  {saving ? <Spinner /> : <><Package size={14} /> {isEdit ? 'Enregistrer' : 'Creer le BL'}</>}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onBack} style={{ justifyContent: 'center' }}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
