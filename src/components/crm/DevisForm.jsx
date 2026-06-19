import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, Trash2, Copy, AlertCircle,
  FileText, GripVertical, X, Download, Pencil, ClipboardCheck,
} from 'lucide-react';
import { listClients } from '../../services/crm/clients';
import { listArticles, getArticleById } from '../../services/crm/articles';
import { listCategories } from '../../services/crm/categories';
import { generateCrmDevisReference } from '../../services/crm/crmDevis';
import { generateDevisPdf } from '../../services/crm/devisPdf';
import { generateReceptionChecklistPdf } from '../../services/crm/receptionChecklistPdf';
import { formatCategoryDisplayName } from '../../utils/crm/categoryDisplay';
import { enrichLignesDescriptions, resolveLigneDescription } from '../../utils/crm/devisLineDescription';
import { TYPE_PROJET_VALUES, TYPE_PROJET_LABEL } from '../../constants/commercial';

const CITYMO_LOGO = 'https://i.ibb.co/N6SbC06M/logopng.png';
const CITYMO_COMPANY = {
  address: '228 Bd Mohammed V, Casablanca 20000',
  email: 'contact@citymo.ma',
  phone: 'Tél : +212 52 231 0043',
  ice: 'ICE : 002023116000060',
};

const UNITES = ['unite', 'm2', 'ml', 'm3', 'm', 'forfait', 'heure', 'jour', 'pack'];
const TVA_TAUX = [0, 7, 10, 14, 20];
const STATUTS = ['brouillon', 'envoye', 'valide', 'refuse', 'expire', 'en_attente'];
const STATUT_LABEL = {
  brouillon: 'Brouillon', envoye: 'Envoyé', valide: 'Validé', refuse: 'Refusé',
  expire: 'Expiré', en_attente: 'En attente',
};
const MODALITES = ['30 jours net', '60 jours net', 'Comptant', 'A la commande', '50% avance / 50% livraison', 'Sur devis'];

function fmtMAD(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '0,00 MAD';
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function fmtDateFr(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-MA');
}

function IS(err, extra = {}) {
  return {
    padding: '8px 11px',
    border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6,
    fontSize: '0.86rem',
    background: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-body)',
    color: 'var(--text)',
    transition: 'border-color 0.15s',
    ...extra,
  };
}

function Label({ children, required }) {
  return (
    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
      {children}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );
}

function ligneSousTotalHt(l) {
  if (l.type !== 'article') return 0;
  return Number(l.quantite) * Number(l.prix_ht) * (1 - Number(l.remise) / 100);
}

function genRef() {
  const d = new Date();
  return `DV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

function today() { return new Date().toISOString().slice(0, 10); }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

const EMPTY_LIGNE = (overrides = {}) => ({
  _id: Date.now() + Math.random(),
  type: 'article',
  ephemeral: false,
  designation: '',
  description: '',
  article_id: '',
  categorie_id: '',
  quantite: 1,
  unite: 'unite',
  prix_ht: 0,
  remise: 0,
  tva: 20,
  ...overrides,
});

const EMPTY_DRAFT = () => ({
  mode: 'article',
  categorie_id: '',
  article_id: '',
  designation: '',
  description: '',
  quantite: 1,
  unite: 'unite',
  prix_ht: 0,
  remise: 0,
  tva: 20,
});

const DEFAULT_CONDITIONS = [
  '• Les prix sont exprimés en MAD',
  '• Paiement selon les modalités convenues au contrat.',
  '• Nos prestations se limitent aux services proposés dans notre offre commerciale tous travaux supplémentaires seront soumis à un devis complémentaire.',
].join('\n');

const EMPTY_DEVIS = {
  reference: '',
  titre: '',
  statut: 'brouillon',
  date_creation: today(),
  date_validite: addDays(30),
  commercial: '',
  type_projet: '',
  client_id: '',
  modalites_paiement: '30 jours net',
  conditions: DEFAULT_CONDITIONS,
  notes_internes: '',
  lignes: [],
};

function draftToLigne(draft, articles = []) {
  if (draft.mode === 'titre') {
    return EMPTY_LIGNE({ type: 'titre', designation: draft.designation.trim() });
  }
  let description = draft.description?.trim() || '';
  if (!description && draft.mode === 'article' && draft.article_id) {
    const art = articles.find((a) => String(a.id) === String(draft.article_id));
    description = art?.description?.trim() || '';
  }
  return EMPTY_LIGNE({
    type: 'article',
    ephemeral: draft.mode === 'hors_catalogue',
    categorie_id: draft.mode === 'hors_catalogue' ? '' : draft.categorie_id,
    article_id: draft.mode === 'hors_catalogue' ? '' : draft.article_id,
    designation: draft.designation.trim(),
    description,
    quantite: Number(draft.quantite) || 1,
    unite: draft.unite || 'unite',
    prix_ht: Number(draft.prix_ht) || 0,
    remise: Number(draft.remise) || 0,
    tva: Number(draft.tva) ?? 20,
  });
}

function ligneToDraft(ligne, articles = []) {
  if (ligne.type === 'titre') {
    return { ...EMPTY_DRAFT(), mode: 'titre', designation: ligne.designation || '' };
  }
  return {
    ...EMPTY_DRAFT(),
    mode: ligne.ephemeral ? 'hors_catalogue' : 'article',
    categorie_id: ligne.categorie_id || '',
    article_id: ligne.article_id || '',
    designation: ligne.designation || '',
    description: resolveLigneDescription(ligne, articles),
    quantite: ligne.quantite ?? 1,
    unite: ligne.unite || 'unite',
    prix_ht: ligne.prix_ht ?? 0,
    remise: ligne.remise ?? 0,
    tva: ligne.tva ?? 20,
  };
}

function Spinner() {
  return (
    <div style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  );
}

function DragHandle({ onDragStart, onDragEnd }) {
  return (
    <span draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title="Glisser pour réorganiser" style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', touchAction: 'none' }}>
      <GripVertical size={13} style={{ color: 'var(--text-3)' }} />
    </span>
  );
}

function rowDragStyle(isDragging, isOver) {
  if (isDragging) return { opacity: 0.45 };
  if (isOver) return { boxShadow: 'inset 0 0 0 2px var(--red)' };
  return {};
}

function clientLabel(c) {
  return [c?.prenom, c?.nom].filter(Boolean).join(' ') || c?.nom || '';
}

function clientMatchesQuery(c, rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const tokens = [
    c.nom, c.prenom, clientLabel(c), c.email, c.ice, c.telephone, c.ville,
  ].filter(Boolean).map((s) => String(s).toLowerCase());
  return tokens.some((t) => t.startsWith(q) || t.split(/\s+/).some((w) => w.startsWith(q)));
}

function ClientSearchSelect({ clients, value, onChange, error }) {
  const wrapRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);

  const selected = clients.find((c) => String(c.id) === String(value));

  const updateDropdownRect = () => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setDropdownRect({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
    });
  };

  useEffect(() => {
    if (!open) setQuery(selected ? clientLabel(selected) : '');
  }, [selected, value, open]);

  useEffect(() => {
    if (!open) return undefined;
    updateDropdownRect();
    const onReposition = () => updateDropdownRect();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, query]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = clients
    .filter((c) => clientMatchesQuery(c, query))
    .slice(0, 25);

  function pick(client) {
    onChange(String(client.id));
    setQuery(clientLabel(client));
    setOpen(false);
  }

  function clear() {
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  const dropdown = open && dropdownRect && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownRect.top,
        left: dropdownRect.left,
        width: dropdownRect.width,
        zIndex: 10000,
        background: '#fff',
        border: '1.5px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
        maxHeight: 260,
        overflowY: 'auto',
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--text-3)' }}>Aucun client trouvé</div>
      ) : filtered.map((c) => {
        const nom = clientLabel(c);
        const active = String(c.id) === String(value);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => pick(c)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
              border: 'none', background: active ? '#FFF5F5' : '#fff', cursor: 'pointer',
              fontSize: '0.86rem', borderBottom: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          >
            <div style={{ fontWeight: 700 }}>{nom}</div>
            {(c.email || c.ice) && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>
                {[c.email, c.ice ? `ICE ${c.ice}` : ''].filter(Boolean).join(' · ')}
              </div>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim()) onChange('');
          }}
          onFocus={() => {
            setOpen(true);
            updateDropdownRect();
          }}
          placeholder="Rechercher un client…"
          autoComplete="off"
          style={IS(error)}
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            title="Effacer"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {dropdown}
    </div>
  );
}

/* ── En-tête document devis ── */
function DevisDocumentHeader({ form, selectedClient, isEdit, onFieldChange, errors }) {
  const clientName = selectedClient
    ? [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom
    : '';

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
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '1.75rem', color: 'var(--red)', letterSpacing: '0.04em', marginBottom: 16 }}>DEVIS</div>
          <div style={{ display: 'grid', gap: 10, fontSize: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>N° devis</span>
              <span style={{ fontWeight: 800, fontSize: '1.02rem' }}>{form.reference || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Date proposition</span>
              <span style={{ fontWeight: 600 }}>{fmtDateFr(form.date_creation)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Validité</span>
              <span style={{ fontWeight: 600 }}>{fmtDateFr(form.date_validite)}</span>
            </div>
            {form.commercial && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Commercial</span>
                <span>{form.commercial}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 28px', display: 'grid', gap: 16 }}>
        <div>
          <Label required>Titre du devis</Label>
          <input
            value={form.titre}
            onChange={(e) => onFieldChange('titre', e.target.value)}
            placeholder="Ex : Aménagement villa — phase 1"
            style={{ ...IS(errors.titre), fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem' }}
          />
          {errors.titre && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.titre}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label required>Client</Label>
            <ClientSearchSelect
              clients={form._clients || []}
              value={form.client_id}
              onChange={(id) => onFieldChange('client_id', id)}
              error={errors.client_id}
            />
            {errors.client_id && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.client_id}</span>}
          </div>
          <div>
            <Label>Statut</Label>
            <select value={form.statut} onChange={(e) => onFieldChange('statut', e.target.value)} style={IS(false)}>
              {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
            </select>
          </div>
        </div>

        {selectedClient && (
          <div style={{ background: 'var(--red)', color: '#fff', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85, marginBottom: 6 }}>Client</div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', marginBottom: 8 }}>{clientName}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px', fontSize: '0.82rem', opacity: 0.95 }}>
              {selectedClient.email && <div>{selectedClient.email}</div>}
              {selectedClient.telephone && <div>{selectedClient.telephone}</div>}
              {selectedClient.ice && <div>ICE : {selectedClient.ice}</div>}
              {selectedClient.adresse && <div>{selectedClient.adresse}</div>}
              {selectedClient.ville && <div>{selectedClient.ville}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Description ligne (titre gras + détail multi-lignes) ── */
function LigneDescriptionText({ description }) {
  if (!description?.trim()) return null;
  return (
    <div style={{ fontSize: '0.76rem', color: 'var(--text-2)', marginTop: 6, lineHeight: 1.55, fontWeight: 400 }}>
      {description.split('\n').map((line, i) => (
        <div key={i}>{line || '\u00A0'}</div>
      ))}
    </div>
  );
}

/* ── Ligne affichée (lecture seule) ── */
function DevisLineDisplay({ ligne, lineNum, idx, articles, onDelete, onDuplicate, onEdit, drag }) {
  const dragProps = {
    style: rowDragStyle(drag.isDragging, drag.isOver),
    onDragOver: (e) => { e.preventDefault(); drag.onDragOver(idx); },
    onDrop: (e) => { e.preventDefault(); drag.onDrop(idx); },
  };
  const handleProps = {
    onDragStart: (e) => drag.onDragStart(e, idx),
    onDragEnd: drag.onDragEnd,
  };
  const actions = (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
      <button type="button" onClick={() => onEdit(idx)} title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><Pencil size={13} /></button>
      <button type="button" onClick={() => onDuplicate(idx)} title="Dupliquer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><Copy size={13} /></button>
      <button type="button" onClick={() => onDelete(idx)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}><Trash2 size={13} /></button>
    </div>
  );

  if (ligne.type === 'titre') {
    return (
      <tr {...dragProps} className="devis-line-titre">
        <td colSpan={8} style={{ padding: '12px 14px', background: 'linear-gradient(90deg, #F5F5F5 0%, #FAFAFA 100%)', borderTop: '2px solid var(--red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DragHandle {...handleProps} />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
              {ligne.designation || 'Section'}
            </span>
            {actions}
          </div>
        </td>
      </tr>
    );
  }

  if (ligne.type === 'note') {
    return (
      <tr {...dragProps}>
        <td colSpan={8} style={{ padding: '10px 14px', background: '#FFFDE7' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <DragHandle {...handleProps} />
            <div style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-2)', fontStyle: 'italic' }}>{ligne.designation}</div>
            {actions}
          </div>
        </td>
      </tr>
    );
  }

  const ht = ligneSousTotalHt(ligne);
  const description = resolveLigneDescription(ligne, articles);

  return (
    <tr {...dragProps} style={{ ...dragProps.style, background: ligne.ephemeral ? '#FFFBF0' : '#fff' }}>
      <td style={{ padding: '10px 6px', width: 28, verticalAlign: 'top' }}><DragHandle {...handleProps} /></td>
      <td style={{ padding: '10px 8px', width: 36, fontWeight: 700, color: 'var(--text-3)', fontSize: '0.82rem', verticalAlign: 'top' }}>{lineNum}</td>
      <td style={{ padding: '10px 8px', minWidth: 200, verticalAlign: 'top' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>{ligne.designation || '—'}</div>
        {ligne.ephemeral && (
          <span style={{ fontSize: '0.68rem', color: '#E65100', fontWeight: 600, background: '#FFF3E0', padding: '2px 6px', borderRadius: 4 }}>Hors catalogue</span>
        )}
        <LigneDescriptionText description={description} />
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top', fontSize: '0.88rem' }}>{ligne.quantite}</td>
      <td style={{ padding: '10px 8px', verticalAlign: 'top', fontSize: '0.82rem', color: 'var(--text-2)' }}>{ligne.unite}</td>
      <td style={{ padding: '10px 8px', textAlign: 'right', verticalAlign: 'top', fontSize: '0.88rem' }}>{fmtMAD(ligne.prix_ht)}</td>
      <td style={{ padding: '10px 8px', textAlign: 'right', verticalAlign: 'top', fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(ht)}</td>
      <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>{actions}</td>
    </tr>
  );
}

function DevisLineCard({ ligne, lineNum, idx, articles, onDelete, onDuplicate, onEdit }) {
  if (ligne.type === 'titre') {
    return (
      <div className="devis-line-card devis-line-card--titre">
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase' }}>{ligne.designation}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>{[
          <button key="e" type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(idx)}>Modifier</button>,
          <button key="d" type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(idx)} style={{ color: 'var(--red)' }}>Supprimer</button>,
        ]}</div>
      </div>
    );
  }
  if (ligne.type !== 'article') return null;
  const ht = ligneSousTotalHt(ligne);
  const description = resolveLigneDescription(ligne, articles);
  return (
    <div className="devis-line-card" style={{ background: ligne.ephemeral ? '#FFFBF0' : '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, color: 'var(--text-3)', fontSize: '0.8rem' }}>#{lineNum}</span>
        {ligne.ephemeral && <span style={{ fontSize: '0.68rem', color: '#E65100', fontWeight: 600 }}>Hors catalogue</span>}
      </div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{ligne.designation}</div>
      <LigneDescriptionText description={description} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.82rem', marginBottom: 10 }}>
        <div><span style={{ color: 'var(--text-3)' }}>Qté </span><strong>{ligne.quantite} {ligne.unite}</strong></div>
        <div><span style={{ color: 'var(--text-3)' }}>PU </span><strong>{fmtMAD(ligne.prix_ht)}</strong></div>
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', marginBottom: 10 }}>{fmtMAD(ht)}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(idx)}>Modifier</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDuplicate(idx)}>Dupliquer</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(idx)} style={{ color: 'var(--red)' }}>Supprimer</button>
      </div>
    </div>
  );
}

/* ── Composer ajout ligne ── */
function LigneComposer({ draft, setDraft, categories, articles, onArticleSelect, onOk, onClear, onAddTitre, editingIdx, draftError }) {
  const catArticles = draft.categorie_id
    ? articles.filter((a) => String(a.categorie_id) === String(draft.categorie_id))
    : [];

  function setF(k, v) { setDraft((p) => ({ ...p, [k]: v })); }

  function onCategorieChange(catId) {
    setDraft((p) => ({ ...p, categorie_id: catId, article_id: '', designation: '', description: '' }));
  }

  function onArticleChange(articleId) {
    onArticleSelect?.(articleId);
  }

  const isTitre = draft.mode === 'titre';
  const isHorsCatalogue = draft.mode === 'hors_catalogue';

  return (
    <div className="devis-composer" style={{ marginTop: 16, padding: '18px 20px', background: '#F8F9FA', borderRadius: 10, border: '1.5px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.88rem', marginBottom: 14, color: 'var(--text)' }}>
        {editingIdx != null ? 'Modifier la ligne' : 'Ajouter une ligne'}
      </div>

      {draftError && (
        <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 10 }}>{draftError}</div>
      )}

      {isTitre ? (
        <div style={{ marginBottom: 14 }}>
          <Label required>Titre de section</Label>
          <input
            value={draft.designation}
            onChange={(e) => setF('designation', e.target.value)}
            placeholder="Ex : GROS ŒUVRE, PEINTURE…"
            style={{ ...IS(false), fontFamily: 'var(--font-head)', fontWeight: 700 }}
          />
        </div>
      ) : (
        <>
          {!isHorsCatalogue && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <Label>Catégorie</Label>
                <select value={draft.categorie_id} onChange={(e) => onCategorieChange(e.target.value)} style={IS(false)}>
                  <option value="">Choisir…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{formatCategoryDisplayName(c.nom)}</option>)}
                </select>
              </div>
              <div>
                <Label>Article</Label>
                <select
                  value={draft.article_id}
                  onChange={(e) => onArticleChange(e.target.value)}
                  disabled={!draft.categorie_id}
                  style={{ ...IS(false), opacity: draft.categorie_id ? 1 : 0.6 }}
                >
                  <option value="">{draft.categorie_id ? 'Choisir…' : 'Catégorie d\'abord'}</option>
                  {catArticles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <Label required>{isHorsCatalogue ? 'Désignation' : 'Désignation'}</Label>
            <input
              value={draft.designation}
              onChange={(e) => setF('designation', e.target.value)}
              placeholder={isHorsCatalogue ? 'Ex : Démolition cloison BA13' : 'Nom de la ligne'}
              style={IS(false)}
              readOnly={!isHorsCatalogue && !!draft.article_id}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Description</Label>
            <textarea
              rows={Math.min(8, Math.max(2, (draft.description || '').split('\n').length))}
              value={draft.description}
              onChange={(e) => setF('description', e.target.value)}
              placeholder="Description détaillée…"
              style={{ ...IS(false), resize: 'vertical', minHeight: 56 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <Label>Quantité</Label>
              <input type="number" min="0" step="0.01" value={draft.quantite} onChange={(e) => setF('quantite', e.target.value)} style={IS(false)} />
            </div>
            <div>
              <Label>Unité</Label>
              <select value={draft.unite} onChange={(e) => setF('unite', e.target.value)} style={IS(false)}>
                {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <Label>Prix unitaire HT</Label>
              <input type="number" min="0" step="0.01" value={draft.prix_ht} onChange={(e) => setF('prix_ht', e.target.value)} style={IS(false)} />
            </div>
            <div>
              <Label>Remise %</Label>
              <input type="number" min="0" max="100" value={draft.remise} onChange={(e) => setF('remise', e.target.value)} style={IS(false)} />
            </div>
            <div>
              <Label>TVA %</Label>
              <select value={draft.tva} onChange={(e) => setF('tva', e.target.value)} style={IS(false)}>
                {TVA_TAUX.map((t) => <option key={t} value={t}>{t}%</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={onOk} style={{ minWidth: 72, fontWeight: 800 }}>
          OK
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClear}>Effacer</button>
        {!isTitre && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onAddTitre}>Ajouter Titre</button>
        )}
        {!isTitre && draft.mode !== 'hors_catalogue' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...EMPTY_DRAFT(), mode: 'hors_catalogue' })} style={{ color: '#E65100' }}>
            Article hors catalogue
          </button>
        )}
        {!isTitre && draft.mode === 'hors_catalogue' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...EMPTY_DRAFT(), mode: 'article' })}>
            Article catalogue
          </button>
        )}
        {isTitre && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...EMPTY_DRAFT(), mode: 'article' })}>
            Ligne article
          </button>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   DEVIS FORM
   ════════════════════════════════════════════════ */
export default function DevisForm({ devis, onBack, onSaved, saving = false }) {
  const isEdit = !!devis;
  const [form, setForm] = useState(() => (devis ? {
    ...EMPTY_DEVIS,
    ...devis,
    lignes: devis.lignes?.length ? devis.lignes.map((l) => ({
      ...EMPTY_LIGNE(),
      ...l,
      ephemeral: l.ephemeral ?? (l.type === 'article' && !l.article_id && !!l.designation?.trim()),
      _id: l._id || `${Date.now()}-${Math.random()}`,
    })) : [],
  } : { ...EMPTY_DEVIS, reference: genRef() }));

  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [savingLocal, setSavingLocal] = useState(false);
  const [apiError, setApiError] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingIdx, setEditingIdx] = useState(null);
  const [draftError, setDraftError] = useState('');
  const isSaving = saving || savingLocal;

  useEffect(() => {
    Promise.all([listClients(), listArticles(), listCategories()]).then(([cl, ar, ca]) => {
      setClients(cl || []);
      setArticles(ar || []);
      setCategories(ca || []);
    }).catch(() => {});
    if (!isEdit) {
      generateCrmDevisReference()
        .then((ref) => setForm((p) => ({ ...p, reference: ref })))
        .catch(() => {});
    }
  }, [isEdit]);

  useEffect(() => {
    if (!articles.length) return;
    setForm((p) => {
      const enriched = enrichLignesDescriptions(p.lignes, articles);
      const changed = enriched.some((l, i) => (l.description || '') !== (p.lignes[i]?.description || ''));
      if (!changed) return p;
      return { ...p, lignes: enriched };
    });
  }, [articles]);

  function setField(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  const selectedClient = clients.find((c) => String(c.id) === String(form.client_id));
  const formWithClients = { ...form, _clients: clients };

  function deleteLigne(idx) {
    setForm((p) => ({ ...p, lignes: p.lignes.filter((_, i) => i !== idx) }));
    if (editingIdx === idx) { setEditingIdx(null); setDraft(EMPTY_DRAFT()); }
  }

  function duplicateLigne(idx) {
    setForm((p) => {
      const ls = [...p.lignes];
      ls.splice(idx + 1, 0, { ...ls[idx], _id: Date.now() + Math.random() });
      return { ...p, lignes: ls };
    });
  }

  function startEditLine(idx) {
    setDraft(ligneToDraft(form.lignes[idx], articles));
    setEditingIdx(idx);
    setDraftError('');
    const ligne = form.lignes[idx];
    if (ligne?.article_id) {
      getArticleById(ligne.article_id).then((fresh) => {
        if (!fresh) return;
        setArticles((prev) => {
          const i = prev.findIndex((a) => String(a.id) === String(fresh.id));
          if (i < 0) return [...prev, fresh];
          const next = [...prev];
          next[i] = fresh;
          return next;
        });
        setDraft((p) => {
          if (String(p.article_id) !== String(fresh.id)) return p;
          const desc = p.description?.trim() || fresh.description?.trim() || '';
          return desc === (p.description || '') ? p : { ...p, description: desc };
        });
      }).catch(() => {});
    }
  }

  async function handleArticleSelect(articleId) {
    if (!articleId) {
      setDraft((p) => ({ ...p, article_id: '' }));
      return;
    }
    const art = articles.find((a) => String(a.id) === String(articleId));
    if (art) {
      setDraft((p) => ({
        ...p,
        mode: 'article',
        article_id: articleId,
        categorie_id: art.categorie_id ? String(art.categorie_id) : p.categorie_id,
        designation: art.nom || '',
        description: art.description || '',
        unite: art.unite || 'unite',
        prix_ht: art.prix_ht ?? art.prix ?? 0,
        remise: art.remise ?? 0,
        tva: art.tva ?? 20,
      }));
    } else {
      setDraft((p) => ({ ...p, article_id: articleId }));
    }
    try {
      const fresh = await getArticleById(articleId);
      if (!fresh) return;
      setArticles((prev) => {
        const i = prev.findIndex((a) => String(a.id) === String(articleId));
        if (i < 0) return [...prev, fresh];
        const next = [...prev];
        next[i] = fresh;
        return next;
      });
      setDraft((p) => {
        if (String(p.article_id) !== String(articleId)) return p;
        return {
          ...p,
          designation: fresh.nom || p.designation,
          description: fresh.description?.trim() ? fresh.description : p.description,
          unite: fresh.unite || p.unite,
          prix_ht: fresh.prix_ht ?? p.prix_ht,
          remise: fresh.remise ?? p.remise,
          tva: fresh.tva ?? p.tva,
        };
      });
    } catch {
      /* cache local suffit */
    }
  }

  function resetDraft() {
    setDraft(EMPTY_DRAFT());
    setEditingIdx(null);
    setDraftError('');
  }

  function validateDraft() {
    if (draft.mode === 'titre') {
      if (!draft.designation?.trim()) return 'Titre requis';
      return '';
    }
    if (!draft.designation?.trim()) return 'Désignation requise';
    if (draft.mode === 'article' && !draft.article_id && !draft.designation?.trim()) {
      return 'Sélectionnez un article ou saisissez une désignation';
    }
    if (Number(draft.quantite) <= 0) return 'Quantité invalide';
    return '';
  }

  function commitDraft() {
    const err = validateDraft();
    if (err) { setDraftError(err); return; }
    const ligne = enrichLignesDescriptions([draftToLigne(draft, articles)], articles)[0];
    if (editingIdx != null) {
      setForm((p) => {
        const ls = [...p.lignes];
        ls[editingIdx] = { ...ligne, _id: ls[editingIdx]._id };
        return { ...p, lignes: ls };
      });
    } else {
      setForm((p) => ({ ...p, lignes: [...p.lignes, ligne] }));
    }
    resetDraft();
  }

  function reorderLignes(from, to) {
    if (from == null || to == null || from === to) return;
    setForm((p) => {
      const ls = [...p.lignes];
      const [item] = ls.splice(from, 1);
      ls.splice(to, 0, item);
      return { ...p, lignes: ls };
    });
  }

  const dragHandlers = {
    onDragStart: (e, idx) => {
      setDragIdx(idx);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    },
    onDragOver: (idx) => setOverIdx(idx),
    onDrop: (idx) => {
      if (dragIdx !== null) reorderLignes(dragIdx, idx);
      setDragIdx(null);
      setOverIdx(null);
    },
    onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
    isDragging: (idx) => dragIdx === idx,
    isOver: (idx) => overIdx === idx && dragIdx !== idx,
  };

  const articleLignes = form.lignes.filter((l) => l.type === 'article');
  const totalHT = articleLignes.reduce((s, l) => s + ligneSousTotalHt(l), 0);
  const totalTVA = articleLignes.reduce((s, l) => s + ligneSousTotalHt(l) * (Number(l.tva) / 100), 0);
  const totalTTC = totalHT + totalTVA;
  const totalRemise = articleLignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_ht) * (Number(l.remise) / 100), 0);
  const totalBrut = articleLignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_ht), 0);

  let articleLineNum = 0;

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
      const payload = {
        ...form,
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
        lignes: enrichLignesDescriptions(form.lignes, articles),
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
    if (!isEdit || !devis?.id) return;
    try {
      const catMap = Object.fromEntries(categories.map((c) => [String(c.id), formatCategoryDisplayName(c.nom)]));
      await generateDevisPdf({
        ...form,
        id: devis.id,
        client: selectedClient,
        client_nom: selectedClient ? [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom : '',
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
        lignes: enrichLignesDescriptions(form.lignes, articles),
      }, catMap);
    } catch (err) {
      setApiError(err.message || 'Erreur génération PDF.');
    }
  }

  async function handleReceptionChecklist() {
    if (!isEdit || !devis?.id) return;
    try {
      const catMap = Object.fromEntries(categories.map((c) => [String(c.id), formatCategoryDisplayName(c.nom)]));
      await generateReceptionChecklistPdf({
        ...form,
        id: devis.id,
        client: selectedClient,
        client_nom: selectedClient ? [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom : '',
        lignes: enrichLignesDescriptions(form.lignes, articles),
      }, catMap);
    } catch (err) {
      setApiError(err.message || 'Erreur génération liste de réception.');
    }
  }

  return (
    <div className="animate-fade-in devis-form-page">
      <style>{`
        .devis-line-card { border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-bottom: 10px; }
        .devis-line-card--titre { background: #F5F5F5; border-left: 4px solid var(--red); }
        .devis-lines-cards { display: none; }
        .devis-doc-header { box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
        @media (max-width: 900px) {
          .devis-form-grid { grid-template-columns: 1fr !important; }
          .devis-doc-header > div:first-child { grid-template-columns: 1fr !important; }
          .devis-doc-header > div:first-child > div:first-child { border-right: none !important; border-bottom: 1px solid var(--border); }
          .devis-lines-table-wrap { display: none !important; }
          .devis-lines-cards { display: block !important; }
        }
      `}</style>

      <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.875rem', fontWeight: 600, marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={16} /> Retour aux devis
      </button>

      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{isEdit ? 'Modifier devis' : 'Nouveau devis'}</h1>
            <p className="page-subtitle">Prévisualisation professionnelle — les lignes s&apos;ajoutent via le bouton OK</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onBack}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ minWidth: 130 }}>
              {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Créer devis'}</>}
            </button>
          </div>
        </div>

        {apiError && (
          <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} /> {apiError}
          </div>
        )}

        <div className="devis-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DevisDocumentHeader
              form={formWithClients}
              selectedClient={selectedClient}
              isEdit={isEdit}
              onFieldChange={setField}
              errors={errors}
            />

            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                <div>
                  <Label>Référence</Label>
                  <input value={form.reference} onChange={(e) => setField('reference', e.target.value)} style={IS(false)} />
                </div>
                <div>
                  <Label>Date création</Label>
                  <input type="date" value={form.date_creation} onChange={(e) => setField('date_creation', e.target.value)} style={IS(false)} />
                </div>
                <div>
                  <Label>Date validité</Label>
                  <input type="date" value={form.date_validite} onChange={(e) => setField('date_validite', e.target.value)} style={IS(false)} />
                </div>
                <div>
                  <Label>Commercial</Label>
                  <input value={form.commercial} onChange={(e) => setField('commercial', e.target.value)} style={IS(false)} />
                </div>
                <div>
                  <Label>Type projet</Label>
                  <select value={form.type_projet} onChange={(e) => setField('type_projet', e.target.value)} style={IS(false)}>
                    <option value="">—</option>
                    {TYPE_PROJET_VALUES.map((v) => <option key={v} value={v}>{TYPE_PROJET_LABEL[v]}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Lignes du devis</div>

              {form.lignes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)', fontSize: '0.88rem', border: '1.5px dashed var(--border)', borderRadius: 8, marginBottom: 8 }}>
                  Aucune ligne — utilisez le formulaire ci-dessous puis cliquez <strong>OK</strong>
                </div>
              ) : (
                <>
                  <div className="devis-lines-table-wrap" style={{ overflowX: 'auto', marginBottom: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)', background: '#FAFAFA' }}>
                          <th style={{ width: 28 }} />
                          <th style={{ width: 36, padding: '8px', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>#</th>
                          <th style={{ textAlign: 'left', padding: '8px', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Désignation</th>
                          <th style={{ width: 56, padding: '8px', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Qté</th>
                          <th style={{ width: 72, padding: '8px', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Unité</th>
                          <th style={{ width: 100, textAlign: 'right', padding: '8px', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>PU HT</th>
                          <th style={{ width: 110, textAlign: 'right', padding: '8px', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Total HT</th>
                          <th style={{ width: 90 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {form.lignes.map((ligne, idx) => {
                          const lineNum = ligne.type === 'article' ? ++articleLineNum : null;
                          return (
                            <DevisLineDisplay
                              key={ligne._id}
                              ligne={ligne}
                              lineNum={lineNum}
                              idx={idx}
                              articles={articles}
                              onDelete={deleteLigne}
                              onDuplicate={duplicateLigne}
                              onEdit={startEditLine}
                              drag={{
                                ...dragHandlers,
                                isDragging: dragHandlers.isDragging(idx),
                                isOver: dragHandlers.isOver(idx),
                              }}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="devis-lines-cards">
                    {(() => {
                      let n = 0;
                      return form.lignes.map((ligne, idx) => {
                        const lineNum = ligne.type === 'article' ? ++n : null;
                        return (
                          <DevisLineCard
                            key={ligne._id}
                            ligne={ligne}
                            lineNum={lineNum}
                            idx={idx}
                            articles={articles}
                            onDelete={deleteLigne}
                            onDuplicate={duplicateLigne}
                            onEdit={startEditLine}
                          />
                        );
                      });
                    })()}
                  </div>
                </>
              )}

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid var(--border)' }}>
                {[
                  ['Total HT brut', fmtMAD(totalBrut)],
                  ['Remises', `- ${fmtMAD(totalRemise)}`],
                  ['Total HT net', fmtMAD(totalHT)],
                  ['TVA', fmtMAD(totalTVA)],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.88rem', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: label === 'Remises' ? 'var(--red)' : 'var(--text)' }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '1rem' }}>TOTAL TTC</span>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '1.15rem', color: 'var(--red)' }}>{fmtMAD(totalTTC)}</span>
                </div>
              </div>

              <LigneComposer
                draft={draft}
                setDraft={setDraft}
                categories={categories}
                articles={articles}
                onArticleSelect={handleArticleSelect}
                onOk={commitDraft}
                onClear={resetDraft}
                onAddTitre={() => { setDraft({ ...EMPTY_DRAFT(), mode: 'titre' }); setDraftError(''); }}
                editingIdx={editingIdx}
                draftError={draftError}
              />
            </div>

            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Conditions commerciales</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Label>Modalités de paiement</Label>
                  <select value={form.modalites_paiement} onChange={(e) => setField('modalites_paiement', e.target.value)} style={IS(false)}>
                    {MODALITES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Label>Conditions générales</Label>
                  <textarea rows={3} value={form.conditions} onChange={(e) => setField('conditions', e.target.value)} style={{ ...IS(false), resize: 'vertical' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Label>Notes internes</Label>
                  <textarea rows={2} value={form.notes_internes} onChange={(e) => setField('notes_internes', e.target.value)} style={{ ...IS(false, { background: '#FFFDE7' }), resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>
            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 14 }}>Récapitulatif</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Lignes articles', String(articleLignes.length)],
                  ['Total HT', fmtMAD(totalHT)],
                  ['TVA', fmtMAD(totalTVA)],
                  ['Total TTC', fmtMAD(totalTTC)],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '5px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: i === 3 ? 800 : 600, color: i === 3 ? 'var(--red)' : 'var(--text)' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: '16px 18px' }}>
              <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
                {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Créer le devis'}</>}
              </button>
              {isEdit && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={handlePdf} style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Download size={14} /> Télécharger PDF
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={handleReceptionChecklist} style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ClipboardCheck size={14} /> Liste de réception
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
