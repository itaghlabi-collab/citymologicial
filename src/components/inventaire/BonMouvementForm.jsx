/**
 * BonMouvementForm.jsx — Création / édition bon de mouvement (style devis CITYMO)
 */
import { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, Plus, X, Download, Loader2, FileText, CheckCircle2,
} from 'lucide-react';
import { generateMovementRef } from '../../services/inventaire/stockMovements';
import { generateMouvementPdf } from '../../services/inventaire/mouvementPdf';
import { listEmployees, employeeFullName } from '../../services/rh/employees';
import { useArticleScanner } from '../../hooks/useArticleScanner';
import { addOrIncrementMovementLine } from '../../services/inventaire/articleScanWorkflow';
import ArticleScanBar from './ArticleScanBar.jsx';
import { EMPLACEMENTS_STOCK, TYPES_MOUVEMENT } from './shared.jsx';

const CITYMO_LOGO = 'https://i.ibb.co/N6SbC06M/logopng.png';
const CITYMO_COMPANY = {
  address: '228 Bd Mohammed V, Casablanca 20000, Maroc',
  email: 'contact@citymo.ma',
  phone: 'Tél : 05 22 31 00 43',
  ice: 'ICE : 002023116000060',
};

const EMPTY_LIGNE = () => ({
  _id: `${Date.now()}-${Math.random()}`,
  article_id: '',
  quantite: '1',
  notes: '',
});

const EMPTY_BON = () => ({
  ref: '',
  type_mouvement: 'Transfert',
  emplacement_source: '',
  emplacement_destination: '',
  date_creation: new Date().toISOString().slice(0, 10),
  cree_par: '',
  livreur: '',
  receptionnaire: '',
  motif: '',
  note: '',
  statut: 'Brouillon',
  lignes: [EMPTY_LIGNE()],
});

function IS(err, extra = {}) {
  return {
    padding: '8px 11px',
    border: `1.5px solid ${err ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: 6,
    fontSize: '0.86rem',
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box',
    ...extra,
  };
}

function Label({ children, required }) {
  return (
    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
      {children}{required ? ' *' : ''}
    </div>
  );
}

function emplacementOptions(current) {
  const v = (current || '').trim();
  if (v && !EMPLACEMENTS_STOCK.includes(v)) return [v, ...EMPLACEMENTS_STOCK];
  return EMPLACEMENTS_STOCK;
}

function BonDocumentHeader({ form, onFieldChange }) {
  return (
    <div className="devis-doc-header card" style={{ padding: 0, overflow: 'visible', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '24px 28px', borderRight: '1px solid var(--border)', background: '#FAFAFA' }}>
          <img src={CITYMO_LOGO} alt="CITYMO" style={{ height: 48, objectFit: 'contain', marginBottom: 14 }} />
          <div style={{ fontSize: '0.92rem', color: 'var(--text-2)', lineHeight: 1.75 }}>
            <div>{CITYMO_COMPANY.address}</div>
            <div>{CITYMO_COMPANY.email}</div>
            <div>{CITYMO_COMPANY.phone}</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{CITYMO_COMPANY.ice}</div>
          </div>
        </div>
        <div style={{ padding: '24px 28px', background: '#fff' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '1.75rem', color: 'var(--red)', letterSpacing: '0.04em', marginBottom: 16 }}>
            BON DE MOUVEMENT
          </div>
          <div style={{ display: 'grid', gap: 10, fontSize: '0.95rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: '0.8rem' }}>Référence</span>
              <input
                value={form.ref || 'Auto'}
                readOnly
                style={{ ...IS(false), fontFamily: 'var(--font-head)', fontWeight: 700, background: '#F5F5F5' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: '0.8rem' }}>Date</span>
              <input
                type="date"
                value={form.date_creation}
                onChange={(e) => onFieldChange('date_creation', e.target.value)}
                style={IS(false)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BonMouvementForm({
  bon,
  articles,
  onBack,
  onSave,
  saving = false,
}) {
  const isEdit = !!bon?.ref;
  const [form, setForm] = useState(() => {
    if (!bon) return EMPTY_BON();
    return {
      ...EMPTY_BON(),
      ...bon,
      lignes: bon.lignes?.length
        ? bon.lignes.map((l) => ({ ...EMPTY_LIGNE(), ...l, _id: l._id || l.id || `${Date.now()}-${Math.random()}` }))
        : [EMPTY_LIGNE()],
    };
  });
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const {
    handleScan,
    scanning,
    scanError,
    scanSuccess,
  } = useArticleScanner({
    articles: articles || [],
    onFound: (article) => {
      setForm((p) => {
        if (p.applied) return p;
        return {
          ...p,
          lignes: addOrIncrementMovementLine(p.lignes, article.id, 1, EMPTY_LIGNE),
        };
      });
    },
  });

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const needsSource = ['Sortie', 'Transfert', 'Retour', 'Rebut'].includes(form.type_mouvement);
  const needsDest = ['Entrée', 'Transfert', 'Retour'].includes(form.type_mouvement);

  useEffect(() => {
    listEmployees().then((rows) => setEmployees(rows || [])).catch(() => {});
    if (!isEdit) {
      generateMovementRef()
        .then((ref) => setForm((p) => (p.ref ? p : { ...p, ref })))
        .catch(() => {});
    }
  }, [isEdit]);

  const totalLignes = form.lignes.length;
  const totalQte = useMemo(
    () => form.lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0),
    [form.lignes],
  );

  const employeeOptions = employees
    .filter((e) => e.statut !== 'Inactif')
    .map((e) => ({ id: e.id, name: employeeFullName(e) }))
    .filter((e) => e.name);

  function updateLigne(idx, patch) {
    setForm((p) => ({
      ...p,
      lignes: p.lignes.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  }

  function addLigne() {
    setForm((p) => ({ ...p, lignes: [...p.lignes, EMPTY_LIGNE()] }));
  }

  function removeLigne(idx) {
    setForm((p) => ({
      ...p,
      lignes: p.lignes.length <= 1 ? p.lignes : p.lignes.filter((_, i) => i !== idx),
    }));
  }

  function getArticle(id) {
    return (articles || []).find((a) => String(a.id) === String(id));
  }

  async function handlePdf() {
    setPdfLoading(true);
    try {
      const enriched = {
        ...form,
        lignes: form.lignes.map((l) => {
          const art = getArticle(l.article_id);
          return {
            ...l,
            article_code: art?.code || art?.reference,
            article_designation: art?.designation || art?.nom,
          };
        }),
      };
      await generateMouvementPdf(enriched, articles);
    } catch (err) {
      setError(err.message || 'Erreur génération PDF.');
    } finally {
      setPdfLoading(false);
    }
  }

  async function submit(statut) {
    setError('');
    const payload = {
      ...form,
      statut,
      lignes: form.lignes.map((l) => ({
        ...l,
        quantite: Number(l.quantite) || 0,
      })),
    };
    if (form.applied) {
      setError('Ce bon est déjà validé.');
      return;
    }
    const res = await onSave(payload);
    if (!res?.success && res?.error) setError(res.error);
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ChevronLeft size={15} /> Retour à la liste
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>
          {isEdit ? `Modifier ${form.ref}` : 'Nouveau bon de mouvement'}
        </h2>
        {form.applied && <span className="badge badge-green">Stock appliqué</span>}
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}

      <BonDocumentHeader form={form} onFieldChange={setField} />

      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          <div>
            <Label required>Type de mouvement</Label>
            <select value={form.type_mouvement} onChange={(e) => setField('type_mouvement', e.target.value)} style={IS(false)}>
              {TYPES_MOUVEMENT.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
          </div>
          {needsSource && (
            <div>
              <Label required>Emplacement source</Label>
              <select value={form.emplacement_source} onChange={(e) => setField('emplacement_source', e.target.value)} style={IS(false)}>
                <option value="">Sélectionner l&apos;emplacement source</option>
                {emplacementOptions(form.emplacement_source).map((e) => <option key={`s-${e}`} value={e}>{e}</option>)}
              </select>
            </div>
          )}
          {needsDest && (
            <div>
              <Label required>Emplacement destination</Label>
              <select value={form.emplacement_destination} onChange={(e) => setField('emplacement_destination', e.target.value)} style={IS(false)}>
                <option value="">Sélectionner l&apos;emplacement destination</option>
                {emplacementOptions(form.emplacement_destination).map((e) => <option key={`d-${e}`} value={e}>{e}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label required>Créé par</Label>
            <select value={form.cree_par} onChange={(e) => setField('cree_par', e.target.value)} style={IS(false, form.cree_par ? {} : { borderColor: 'var(--red)' })}>
              <option value="">Sélectionner</option>
              {employeeOptions.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Utilisateur livreur (optionnel)</Label>
            <select value={form.livreur} onChange={(e) => setField('livreur', e.target.value)} style={IS(false)}>
              <option value="">Sélectionner l&apos;utilisateur livreur</option>
              {employeeOptions.map((e) => <option key={`l-${e.id}`} value={e.name}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Utilisateur réception (optionnel)</Label>
            <select value={form.receptionnaire} onChange={(e) => setField('receptionnaire', e.target.value)} style={IS(false)}>
              <option value="">Sélectionner l&apos;utilisateur réception</option>
              {employeeOptions.map((e) => <option key={`r-${e.id}`} value={e.name}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Label>Motif du mouvement</Label>
            <input value={form.motif} onChange={(e) => setField('motif', e.target.value)} placeholder="Ex. réappro chantier, retour atelier… (optionnel)" style={IS(false)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Label>Notes</Label>
            <textarea rows={3} value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="Notes additionnelles..." style={{ ...IS(false), resize: 'vertical', minHeight: 72 }} />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
          Lignes de mouvement
        </div>

        {!form.applied && (
          <ArticleScanBar
            onScan={handleScan}
            loading={scanning}
            error={scanError}
            success={scanSuccess}
            label="Scanner un article"
            placeholder="Scannez un article pour l'ajouter à l'entrée / sortie…"
            compact
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {form.lignes.map((ligne, idx) => {
            const art = getArticle(ligne.article_id);
            return (
              <div
                key={ligne._id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px,2fr) 100px minmax(140px,1.5fr) 36px',
                  gap: 10,
                  alignItems: 'start',
                  padding: '12px 14px',
                  background: '#FAFAFA',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <Label required>Article (catalogue)</Label>
                  <select value={ligne.article_id} onChange={(e) => updateLigne(idx, { article_id: e.target.value })} style={IS(false)}>
                    <option value="">— Sélectionner —</option>
                    {(articles || []).filter((a) => a.statut !== 'Archivé').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                    Unité : {art?.unite || '—'}
                  </div>
                </div>
                <div>
                  <Label required>Quantité</Label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={ligne.quantite}
                    onChange={(e) => updateLigne(idx, { quantite: e.target.value })}
                    style={IS(false)}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <input value={ligne.notes} onChange={(e) => updateLigne(idx, { notes: e.target.value })} placeholder="Notes ligne..." style={IS(false)} />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="Supprimer la ligne"
                  onClick={() => removeLigne(idx)}
                  disabled={form.lignes.length <= 1 || form.applied}
                  style={{ marginTop: 22, color: 'var(--red)' }}
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn btn-primary" onClick={addLigne} disabled={form.applied} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Ajouter une ligne
          </button>
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '2px solid var(--border)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-2)' }}>
          Lignes : {totalLignes} — Quantité totale : {totalQte}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || form.applied}
          onClick={() => submit('Brouillon')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 180, justifyContent: 'center' }}
        >
          {saving ? <Loader2 size={14} className="cin-spin" /> : <FileText size={14} />}
          Enregistrer (Brouillon)
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={saving || form.applied}
          onClick={() => submit('Validé')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 200, justifyContent: 'center', background: '#E8F5E9', color: '#2E7D32', borderColor: '#A5D6A7' }}
        >
          {saving ? <Loader2 size={14} className="cin-spin" /> : <CheckCircle2 size={14} />}
          Valider (Appliquer stock)
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pdfLoading || !form.ref}
          onClick={handlePdf}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 120, justifyContent: 'center', background: '#E3F2FD', color: '#1565C0', borderColor: '#90CAF9' }}
        >
          {pdfLoading ? <Loader2 size={14} className="cin-spin" /> : <Download size={14} />}
          PDF
        </button>
      </div>
    </div>
  );
}
