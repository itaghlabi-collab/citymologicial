import { useState, useEffect } from 'react';
import {
  ChevronLeft, Plus, Trash2, Copy, AlertCircle,
  FileText, ChevronDown, ChevronUp, GripVertical, Check,
} from 'lucide-react';
import { listClients } from '../../services/crm/clients';
import { listArticles } from '../../services/crm/articles';
import { listCategories } from '../../services/crm/categories';
import { listCrmDevis, getCrmDevisById } from '../../services/crm/crmDevis';
import {
  generateCrmProformaNumero,
  CRM_PROFORMA_STATUTS,
  CRM_PROFORMA_STATUT_LABEL,
} from '../../services/crm/crmProformas';
import Big from 'big.js';
import { moneyLineHt, moneyLineTtc, moneyComputeDocumentTotals, moneyToNumber, moneyFormatMAD } from '../../utils/decimalMoney';

function fmtMAD(v) {
  return moneyFormatMAD(v);
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

const UNITES = ['unite', 'm2', 'ml', 'm3', 'm', 'forfait', 'heure', 'jour', 'pack'];
const TVA_TAUX = [0, 7, 10, 14, 20];
const MODALITES = ['30 jours net', '60 jours net', 'Comptant', 'A la commande', '50% avance / 50% livraison', 'Sur devis'];

const EMPTY_LIGNE = () => ({
  _id: Date.now() + Math.random(),
  type: 'article',
  designation: '', description: '', article_id: '', categorie_id: '',
  quantite: 1, unite: 'unite', prix_ht: 0, remise: 0, tva: 20,
});

const EMPTY_PROFORMA = {
  numero: '',
  titre: '',
  statut: 'brouillon',
  date_emission: today(),
  date_validite: addDays(30),
  commercial: '',
  type_projet: '',
  client_id: '',
  devis_id: '',
  modalites_paiement: '30 jours net',
  conditions: '',
  notes_internes: '',
  lignes: [EMPTY_LIGNE()],
};

function Spinner() {
  return <div style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;
}

function LigneRow({ ligne, categories, articles, onChange, onDelete, onDuplicate }) {
  const [showDesc, setShowDesc] = useState(false);
  const catArticles = articles.filter(a => !ligne.categorie_id || String(a.categorie_id) === String(ligne.categorie_id));
  const stHT = moneyLineHt({ qty: ligne.quantite, unitPriceHt: ligne.prix_ht, remisePct: ligne.remise });
  const stTTC = moneyLineTtc({ qty: ligne.quantite, unitPriceHt: ligne.prix_ht, tvaPct: ligne.tva, remisePct: ligne.remise });

  if (ligne.type === 'titre' || ligne.type === 'note') {
    return (
      <tr style={{ background: ligne.type === 'titre' ? 'var(--bg)' : '#FFFDE7' }}>
        <td style={{ padding: '8px 5px', width: 20 }}><GripVertical size={12} style={{ color: 'var(--text-3)' }} /></td>
        <td colSpan={6} style={{ padding: '8px 6px' }}>
          <input
            value={ligne.designation}
            onChange={e => onChange({ ...ligne, designation: e.target.value })}
            placeholder={ligne.type === 'titre' ? 'Titre de section…' : 'Note…'}
            style={{ ...IS(false), fontWeight: ligne.type === 'titre' ? 700 : 400, background: 'transparent', border: '1px dashed var(--border)' }}
          />
        </td>
        <td style={{ padding: '8px 4px', whiteSpace: 'nowrap' }}>
          <button type="button" onClick={onDuplicate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }} title="Dupliquer"><Copy size={12} /></button>
          <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }} title="Supprimer"><Trash2 size={12} /></button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={{ padding: '8px 5px', verticalAlign: 'top' }}><GripVertical size={12} style={{ color: 'var(--text-3)', marginTop: 10 }} /></td>
      <td style={{ padding: '6px', minWidth: 180, verticalAlign: 'top' }}>
        <select
          value={ligne.categorie_id}
          onChange={e => onChange({ ...ligne, categorie_id: e.target.value, article_id: '' })}
          style={{ ...IS(false), marginBottom: 4, fontSize: '0.78rem' }}
        >
          <option value="">Catégorie…</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select
          value={ligne.article_id}
          onChange={e => {
            const art = articles.find(a => String(a.id) === e.target.value);
            onChange({
              ...ligne,
              article_id: e.target.value,
              designation: art?.designation || art?.nom || ligne.designation,
              prix_ht: art?.prix_ht ?? ligne.prix_ht,
              unite: art?.unite || ligne.unite,
              tva: art?.tva ?? ligne.tva,
            });
          }}
          style={{ ...IS(false), marginBottom: 4, fontSize: '0.78rem' }}
        >
          <option value="">Article…</option>
          {catArticles.map(a => <option key={a.id} value={a.id}>{a.designation || a.nom}</option>)}
        </select>
        <input
          value={ligne.designation}
          onChange={e => onChange({ ...ligne, designation: e.target.value })}
          placeholder="Désignation"
          style={IS(false)}
        />
        <button type="button" onClick={() => setShowDesc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 2, marginTop: 4, padding: 0 }}>
          {showDesc ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Description
        </button>
        {showDesc && (
          <textarea
            rows={2}
            value={ligne.description || ''}
            onChange={e => onChange({ ...ligne, description: e.target.value })}
            placeholder="Description…"
            style={{ ...IS(false), marginTop: 4, resize: 'vertical', fontSize: '0.78rem' }}
          />
        )}
      </td>
      <td style={{ padding: '6px', width: 70, verticalAlign: 'top' }}>
        <input type="number" min="0" step="0.01" value={ligne.quantite} onChange={e => onChange({ ...ligne, quantite: e.target.value })} style={IS(false)} />
      </td>
      <td style={{ padding: '6px', width: 80, verticalAlign: 'top' }}>
        <select value={ligne.unite} onChange={e => onChange({ ...ligne, unite: e.target.value })} style={IS(false)}>
          {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px', width: 90, verticalAlign: 'top' }}>
        <input type="number" min="0" step="0.01" value={ligne.prix_ht} onChange={e => onChange({ ...ligne, prix_ht: e.target.value })} style={IS(false)} />
      </td>
      <td style={{ padding: '6px', width: 60, verticalAlign: 'top' }}>
        <input type="number" min="0" max="100" step="0.01" value={ligne.remise} onChange={e => onChange({ ...ligne, remise: e.target.value })} style={IS(false)} />
      </td>
      <td style={{ padding: '6px', width: 70, verticalAlign: 'top' }}>
        <select value={ligne.tva} onChange={e => onChange({ ...ligne, tva: Number(e.target.value) })} style={IS(false)}>
          {TVA_TAUX.map(t => <option key={t} value={t}>{t}%</option>)}
        </select>
      </td>
      <td style={{ padding: '6px', width: 90, textAlign: 'right', verticalAlign: 'top', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {fmtMAD(stHT)}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 400 }}>{fmtMAD(stTTC)} TTC</div>
      </td>
      <td style={{ padding: '8px 4px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        <button type="button" onClick={onDuplicate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }} title="Dupliquer"><Copy size={12} /></button>
        <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }} title="Supprimer"><Trash2 size={12} /></button>
      </td>
    </tr>
  );
}

export default function ProformaForm({ proforma, initialClientId = '', onBack, onSaved, saving = false }) {
  const isEdit = !!proforma?.id;
  const locked = proforma?.statut === 'convertie' || proforma?.statut === 'annulee';
  const [form, setForm] = useState(() => {
    if (proforma) {
      return {
        ...EMPTY_PROFORMA,
        ...proforma,
        client_id: proforma.client_id || initialClientId || '',
        lignes: proforma.lignes?.length
          ? proforma.lignes.map(l => ({ ...EMPTY_LIGNE(), ...l, _id: l._id || Date.now() + Math.random() }))
          : [EMPTY_LIGNE()],
      };
    }
    return { ...EMPTY_PROFORMA, client_id: initialClientId || '', numero: '' };
  });

  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [devisList, setDevisList] = useState([]);
  const [errors, setErrors] = useState({});
  const [savingLocal, setSavingLocal] = useState(false);
  const [apiError, setApiError] = useState('');
  const isSaving = saving || savingLocal;

  useEffect(() => {
    Promise.all([listClients(), listArticles(), listCategories(), listCrmDevis()]).then(([cl, ar, ca, dv]) => {
      setClients(cl || []);
      setArticles(ar || []);
      setCategories(ca || []);
      setDevisList(dv || []);
    }).catch(() => {});
    if (!isEdit) {
      generateCrmProformaNumero()
        .then((num) => setForm(p => ({ ...p, numero: num })))
        .catch(() => {});
    }
  }, [isEdit]);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

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
        titre: dv.titre ? 'Proforma — ' + dv.titre : p.titre,
      }));
    } catch {
      const dv = devisList.find(d => String(d.id) === String(devisId));
      if (dv) {
        setForm(p => ({
          ...p,
          devis_id: devisId,
          client_id: dv.client_id || p.client_id,
          commercial: dv.commercial || p.commercial,
          titre: dv.titre ? 'Proforma — ' + dv.titre : p.titre,
        }));
      }
    }
  }

  const selectedClient = clients.find(c => String(c.id) === String(form.client_id));

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

  const artLignes = form.lignes.filter(l => l.type === 'article');
  const { subtotal_ht: totalHT, total_vat: totalTVA, total_ttc: totalTTC } = moneyComputeDocumentTotals(
    form.lignes,
    (l) => {
      if (l.type !== 'article') return null;
      return {
        qty: l.quantite,
        unitPriceHt: l.prix_ht,
        tvaPct: l.tva,
        remisePct: l.remise,
      };
    },
  );
  const totalRemise = moneyToNumber(artLignes.reduce(
    (s, l) => {
      const brut = moneyLineHt({ qty: l.quantite, unitPriceHt: l.prix_ht, remisePct: 0 });
      return s.plus(brut.times(new Big(l.remise || 0).div(100)));
    },
    new Big(0),
  ));
  const totalBrut = moneyToNumber(artLignes.reduce(
    (s, l) => s.plus(moneyLineHt({ qty: l.quantite, unitPriceHt: l.prix_ht, remisePct: 0 })),
    new Big(0),
  ));

  function validate() {
    const e = {};
    if (!form.titre?.trim()) e.titre = 'Requis';
    if (!form.client_id) e.client_id = 'Requis';
    return e;
  }

  async function handleSave(e) {
    e.preventDefault();
    if (locked) {
      setApiError('Cette proforma ne peut plus être modifiée.');
      return;
    }
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSavingLocal(true);
    try {
      const payload = {
        ...form,
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
        lignes: form.lignes,
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

  return (
    <div className="animate-fade-in">
      <button type="button" className="crm-back-btn" onClick={onBack} aria-label="Retour aux proformas">
        <ChevronLeft size={16} /> Retour aux proformas
      </button>

      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{isEdit ? 'Modifier proforma' : 'Nouvelle proforma'}</h1>
            <p className="page-subtitle">
              {isEdit ? form.numero : 'Numéro : ' + (form.numero || '…')}
              {' · '}Document commercial (hors comptabilité)
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onBack}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || locked} style={{ minWidth: 130 }}>
              {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Créer proforma'}</>}
            </button>
          </div>
        </div>

        {apiError && (
          <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} /> {apiError}
          </div>
        )}

        {locked && (
          <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', color: '#E65100', marginBottom: 16 }}>
            Proforma {CRM_PROFORMA_STATUT_LABEL[form.statut] || form.statut} — lecture seule.
            {form.facture_numero && <> Facture liée : <strong>{form.facture_numero}</strong></>}
          </div>
        )}

        <div className="crm-form-layout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Informations proforma</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label required>Titre de la proforma</Label>
                  <input value={form.titre} onChange={e => setField('titre', e.target.value)} disabled={locked} placeholder="Ex : Travaux villa Amrani — phase 2" style={IS(errors.titre)} />
                  {errors.titre && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.titre}</span>}
                </div>

                <div className="form-group">
                  <Label>Numéro (PF)</Label>
                  <input value={form.numero} onChange={e => setField('numero', e.target.value)} disabled={locked || isEdit} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Statut</Label>
                  <select value={form.statut} onChange={e => setField('statut', e.target.value)} disabled={locked} style={IS(false)}>
                    {CRM_PROFORMA_STATUTS.filter(s => s !== 'convertie').map(s => (
                      <option key={s} value={s}>{CRM_PROFORMA_STATUT_LABEL[s]}</option>
                    ))}
                    {form.statut === 'convertie' && <option value="convertie">{CRM_PROFORMA_STATUT_LABEL.convertie}</option>}
                  </select>
                </div>

                <div className="form-group">
                  <Label>Date d'émission</Label>
                  <input type="date" value={form.date_emission} onChange={e => setField('date_emission', e.target.value)} disabled={locked} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Date de validité</Label>
                  <input type="date" value={form.date_validite} onChange={e => setField('date_validite', e.target.value)} disabled={locked} style={IS(false)} />
                </div>

                <div className="form-group">
                  <Label>Commercial</Label>
                  <input type="text" value={form.commercial} onChange={e => setField('commercial', e.target.value)} disabled={locked} placeholder="Nom du commercial" style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Modalités de paiement</Label>
                  <select value={form.modalites_paiement} onChange={e => setField('modalites_paiement', e.target.value)} disabled={locked} style={IS(false)}>
                    {MODALITES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Créer depuis un devis</Label>
                  <select value={form.devis_id} onChange={e => loadFromDevis(e.target.value)} disabled={locked} style={IS(false)}>
                    <option value="">Aucun devis lié…</option>
                    {devisList.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.titre}</option>)}
                  </select>
                  {form.devis_id && (
                    <div style={{ fontSize: '0.72rem', color: '#388E3C', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={11} /> Données importées depuis le devis
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Client</SectionTitle>
              <div className="form-group">
                <Label required>Client</Label>
                <select value={form.client_id} onChange={e => setField('client_id', e.target.value)} disabled={locked} style={IS(errors.client_id)}>
                  <option value="">Choisir un client…</option>
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
                    ['Société / Nom', [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom],
                    ['Email', selectedClient.email],
                    ['Téléphone', selectedClient.telephone],
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

            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Lignes</SectionTitle>
              <div className="crm-form-lignes-wrap">
                <table>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                      <th style={{ width: 20, padding: '6px 5px' }} />
                      {['Désignation', 'Qté', 'Unité', 'Prix HT', 'Rem.', 'TVA', 'Total HT', ''].map((h, i) => (
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
                        onChange={data => !locked && updateLigne(idx, data)}
                        onDelete={() => !locked && deleteLigne(idx)}
                        onDuplicate={() => !locked && duplicateLigne(idx)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {!locked && (
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
              )}
            </div>

            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Conditions et notes</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div className="form-group">
                  <Label>Conditions générales</Label>
                  <textarea rows={3} value={form.conditions} onChange={e => setField('conditions', e.target.value)} disabled={locked} placeholder="Conditions générales…" style={{ ...IS(false), resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div className="form-group">
                  <Label>Notes internes</Label>
                  <textarea rows={2} value={form.notes_internes} onChange={e => setField('notes_internes', e.target.value)} disabled={locked} placeholder="Notes internes (non visibles sur le PDF)…" style={{ ...IS(false, { background: '#FFFDE7' }), resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="crm-form-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Récapitulatif</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Total HT brut', fmtMAD(totalBrut)],
                  ['Remises', '- ' + fmtMAD(totalRemise)],
                  ['Total HT net', fmtMAD(totalHT)],
                  ['TVA', fmtMAD(totalTVA)],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: label === 'Remises' ? 'var(--red)' : 'var(--text)' }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', textTransform: 'uppercase' }}>Total TTC</span>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--red)' }}>{fmtMAD(totalTTC)}</span>
                </div>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.4 }}>
                Aucun paiement ni écriture comptable — document commercial uniquement.
              </p>
            </div>

            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Résumé</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
                {[
                  ['Lignes article', artLignes.length],
                  ['Client', selectedClient ? ([selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom) : '—'],
                  ['Commercial', form.commercial || '—'],
                  ['Validité', form.date_validite || '—'],
                  ['Devis lié', form.devis_id ? (devisList.find(d => String(d.id) === String(form.devis_id))?.reference || form.devis_id) : 'Aucun'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Actions</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={isSaving || locked} style={{ justifyContent: 'center' }}>
                  {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Créer la proforma'}</>}
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
