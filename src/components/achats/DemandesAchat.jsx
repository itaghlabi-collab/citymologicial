/**
 * DemandesAchat.jsx — Tableau de bord & workflow demandes d'achat ERP CITYMO
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ClipboardList, Plus, Eye, Edit2, Trash2, Search, Filter,
  Download, AlertTriangle, Clock, Loader2, RefreshCw, FileText,
  BarChart2, Package, CreditCard, CheckCircle, Send, Layers,
} from 'lucide-react';
import { usePurchaseRequests } from '../../hooks/usePurchaseRequests';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useAuth } from '../../hooks/useAuth';
import {
  canEditPurchaseRequest, canDeletePurchaseRequest, normalizePurchaseStatus,
  canSubmitPurchaseRequest, canAddQuoteToRequest, canValidateQuoteOnRequest,
  getPurchaseStatusBadge, getPurchaseStatusLabel,
} from '../../constants/purchaseWorkflow';
import { submitPurchaseRequest, getPurchaseRequestBundle, reconcileLegacySoumiseRequests, reconcilePurchaseRequestSentStatus } from '../../services/achats/purchaseWorkflow';
import { projectOptionLabel, purchaseRequestProjectLabel, updatePurchaseRequestTitle, reconcileMissingPurchaseRequestRefs, isGroupedPurchaseRequest } from '../../services/achats/purchaseRequests';
import { buildGroupedFormPayload } from '../../services/achats/purchaseGrouped';
import { generatePurchaseRequestPdf } from '../../services/achats/purchaseRequestPdf';
import { resolveCurrentPurchaseRole, purchasePermissions, canViewPurchaseRequest } from '../../services/achats/purchaseWorkflowRoles';
import { isSuperAdmin } from '../../services/rh/isSuperAdmin';
import DemandeAchatDetail from './DemandeAchatDetail';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_DEMANDE, PRIORITES, BADGE_DEMANDE, BADGE_PRIORITE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField, formatMAD, genId,
} from './shared.jsx';

const EMPTY_LIGNE = { designation: '', quantite: '', unite: 'u' };

const EMPTY_GROUPED_LIGNE = {
  designation: '', quantite: '', unite: 'u', project_id: '', project_ref: '', projet_lie: '', fournisseur: '', supplier_id: '', commentaire: '',
};

const EMPTY_GROUPED_FORM = {
  is_grouped: true,
  titre: '',
  priorite: 'Normale',
  date_limite: '',
  lignes: [{ ...EMPTY_GROUPED_LIGNE, id: genId() }],
  description: '',
  commentaires_internes: '',
};

const EMPTY_FORM = {
  link_type: 'projet',
  titre: '',
  priorite: 'Normale',
  date_limite: '',
  project_id: '',
  project_ref: '',
  projet_lie: '',
  fournisseur: '',
  supplier_id: '',
  lignes: [{ ...EMPTY_LIGNE, id: genId() }],
  description: '',
  commentaires_internes: '',
};

function toFormLignes(item) {
  const raw = item?.payload?.lines || [];
  if (raw.length) {
    return raw.map((l, i) => ({
      id: l.id || genId() + i,
      designation: l.designation && l.designation !== '—' ? l.designation : '',
      quantite: l.quantite ?? l.quantite_demandee ?? '',
      unite: l.unite || l.unit || 'u',
    }));
  }
  return [{ ...EMPTY_LIGNE, id: genId() }];
}

function toGroupedFormLignes(item) {
  const raw = item?.payload?.lines || [];
  if (raw.length) {
    return raw.map((l, i) => ({
      id: l.id || genId() + i,
      designation: l.designation && l.designation !== '—' ? l.designation : '',
      quantite: l.quantite ?? l.quantite_demandee ?? '',
      unite: l.unite || l.unit || 'u',
      project_id: l.project_id || '',
      project_ref: l.project_ref || '',
      projet_lie: l.projet_lie || l.project_name || '',
      project_name: l.project_name || '',
      fournisseur: l.fournisseur || '',
      supplier_id: l.supplier_id || '',
      commentaire: l.commentaire || '',
    }));
  }
  return [{ ...EMPTY_GROUPED_LIGNE, id: genId() }];
}

function toGroupedFormState(item) {
  if (!item) return EMPTY_GROUPED_FORM;
  return {
    ...EMPTY_GROUPED_FORM,
    ref: item.ref || '',
    titre: item.titre || '',
    priorite: item.priorite || 'Normale',
    date_limite: item.date_limite || '',
    lignes: toGroupedFormLignes(item),
    description: item.description || '',
    commentaires_internes: item.commentaires_internes || '',
  };
}

function toFormState(item) {
  if (!item) return EMPTY_FORM;
  const line = item.payload?.lines?.[0] || {};
  const offProject = item.payload?.off_project === true;
  return {
    ...EMPTY_FORM,
    ref: item.ref || '',
    link_type: offProject ? 'hors_projet' : 'projet',
    titre: item.titre || '',
    priorite: item.priorite || 'Normale',
    date_limite: item.date_limite || '',
    project_id: item.project_id || '',
    project_ref: item.project_ref || '',
    projet_lie: item.projet_lie || item.project_name || '',
    fournisseur: item.payload?.fournisseur_souhaite || line.fournisseur || '',
    supplier_id: item.payload?.supplier_id || '',
    lignes: toFormLignes(item),
    description: item.description || '',
    commentaires_internes: item.commentaires_internes || '',
  };
}

function buildFormPayload(form, existingPayload = {}, attachments = []) {
  const fournisseur = (form.fournisseur || '').trim();
  const offProject = form.link_type === 'hors_projet';
  const lignes = (form.lignes || []).filter((l) => (l.designation || '').trim());
  return {
    ...existingPayload,
    off_project: offProject,
    supplier_id: form.supplier_id || null,
    fournisseur_souhaite: fournisseur || null,
    attachments: attachments.map((a) => ({
      name: a.name,
      size: a.size,
      type: a.type,
      storage_path: a.storage_path,
      added_at: a.added_at || null,
      added_by_name: a.added_by_name || null,
      added_by: a.added_by || null,
    })),
    lines: lignes.map((l) => ({
      id: l.id,
      designation: l.designation.trim(),
      quantite: l.quantite !== '' && l.quantite != null ? Number(l.quantite) : null,
      unite: (l.unite || 'u').trim(),
      fournisseur: fournisseur || null,
    })),
  };
}

function DemandeLignesTable({ lignes, onChange, error }) {
  function updateLigne(id, k, v) {
    onChange(lignes.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
  }
  function addLigne() {
    onChange([...lignes, { ...EMPTY_LIGNE, id: genId() }]);
  }
  function removeLigne(id) {
    if (lignes.length <= 1) return;
    onChange(lignes.filter((l) => l.id !== id));
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)' }}>
              {['N°', 'Désignation', 'Qté', 'Unité', ''].map((h) => (
                <th
                  key={h || 'actions'}
                  style={{
                    padding: '8px 10px',
                    textAlign: 'left',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    width: h === 'N°' ? 36 : undefined,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, idx) => (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px', color: 'var(--text-3)', fontWeight: 700, fontSize: '0.78rem' }}>
                  {idx + 1}
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input
                    value={l.designation}
                    onChange={(e) => updateLigne(l.id, 'designation', e.target.value)}
                    placeholder="Article, matériau, prestation..."
                    style={{
                      ...INPUT_STYLE,
                      minWidth: 200,
                      borderColor: error && !l.designation?.trim() ? 'var(--red)' : 'var(--border)',
                    }}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.quantite}
                    onChange={(e) => updateLigne(l.id, 'quantite', e.target.value)}
                    placeholder="0"
                    style={{ ...INPUT_STYLE, width: 80 }}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input
                    value={l.unite}
                    onChange={(e) => updateLigne(l.id, 'unite', e.target.value)}
                    placeholder="u, m, kg..."
                    style={{ ...INPUT_STYLE, width: 72 }}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeLigne(l.id)}
                    disabled={lignes.length <= 1}
                    style={{ color: lignes.length <= 1 ? 'var(--text-3)' : 'var(--red)', padding: '4px 6px' }}
                    title="Supprimer la ligne"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.72rem', marginTop: 6 }}>{error}</div>}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={addLigne}
        style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Plus size={13} /> Ajouter un besoin
      </button>
    </div>
  );
}

function GroupedDemandeLignesTable({ lignes, onChange, projects, suppliers, lineError }) {
  const fournActifs = suppliers.filter((f) => f.statut === 'Actif' || f.status === 'active');

  function updateLigne(id, k, v) {
    onChange(lignes.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
  }

  function handleProjectChange(id, projectId) {
    const p = projects.find((x) => String(x.id) === String(projectId));
    onChange(lignes.map((l) => (l.id === id ? {
      ...l,
      project_id: projectId || '',
      project_ref: p?.ref || '',
      project_name: p?.nom || '',
      projet_lie: p ? projectOptionLabel(p) : '',
    } : l)));
  }

  function addLigne() {
    onChange([...lignes, { ...EMPTY_GROUPED_LIGNE, id: genId() }]);
  }

  function removeLigne(id) {
    if (lignes.length <= 1) return;
    onChange(lignes.filter((l) => l.id !== id));
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 900 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)' }}>
              {['N°', 'Désignation', 'Qté', 'Unité', 'Projet lié', 'Fournisseur', 'Commentaire', ''].map((h) => (
                <th key={h || 'actions'} style={{ padding: '8px 8px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, idx) => (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>{idx + 1}</td>
                <td style={{ padding: '6px 4px', minWidth: 140 }}>
                  <input value={l.designation} onChange={(e) => updateLigne(l.id, 'designation', e.target.value)} placeholder="Article..." style={{ ...INPUT_STYLE, minWidth: 130, borderColor: lineError && !l.designation?.trim() ? 'var(--red)' : 'var(--border)' }} />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <input type="number" min="0" step="any" value={l.quantite} onChange={(e) => updateLigne(l.id, 'quantite', e.target.value)} style={{ ...INPUT_STYLE, width: 70 }} />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <input value={l.unite} onChange={(e) => updateLigne(l.id, 'unite', e.target.value)} style={{ ...INPUT_STYLE, width: 56 }} />
                </td>
                <td style={{ padding: '6px 4px', minWidth: 160 }}>
                  <select value={l.project_id || ''} onChange={(e) => handleProjectChange(l.id, e.target.value)} style={{ ...SELECT_STYLE, borderColor: lineError && !l.project_id ? 'var(--red)' : 'var(--border)', fontSize: '0.78rem' }}>
                    <option value="">— Projet —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{projectOptionLabel(p)}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 4px', minWidth: 120 }}>
                  <input value={l.fournisseur} onChange={(e) => updateLigne(l.id, 'fournisseur', e.target.value)} placeholder="Optionnel" style={{ ...INPUT_STYLE, minWidth: 110, fontSize: '0.78rem' }} list={`fourn-${l.id}`} />
                  <datalist id={`fourn-${l.id}`}>
                    {fournActifs.map((s) => <option key={s.id} value={s.company_name || s.raison_sociale || s.nom} />)}
                  </datalist>
                </td>
                <td style={{ padding: '6px 4px', minWidth: 100 }}>
                  <input value={l.commentaire} onChange={(e) => updateLigne(l.id, 'commentaire', e.target.value)} placeholder="Optionnel" style={{ ...INPUT_STYLE, minWidth: 90, fontSize: '0.78rem' }} />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLigne(l.id)} disabled={lignes.length <= 1} style={{ color: lignes.length <= 1 ? 'var(--text-3)' : 'var(--red)', padding: '4px 6px' }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lineError && <div style={{ color: 'var(--red)', fontSize: '0.72rem', marginTop: 6 }}>{lineError}</div>}
      <button type="button" className="btn btn-secondary btn-sm" onClick={addLigne} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Plus size={13} /> Ajouter une ligne
      </button>
    </div>
  );
}

function GroupedDemandeForm({ initial, onSave, onCancel, saving, suppliers = [], projects = [], sessionUser }) {
  const [form, setForm] = useState(() => toGroupedFormState(initial));
  const [attachments, setAttachments] = useState(() => initial?.payload?.attachments || []);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const responsableLabel = initial?.assigned_employee_name
    || initial?.requester_name
    || sessionUser?.nom
    || sessionUser?.email?.split('@')[0]
    || '—';

  useEffect(() => {
    setForm(toGroupedFormState(initial));
    setErrors({});
    let cancelled = false;
    (async () => {
      const raw = initial?.payload?.attachments || [];
      if (!raw.length) { if (!cancelled) setAttachments([]); return; }
      const { resolvePurchaseAttachments } = await import('../../services/achats/purchaseStorage');
      const resolved = await resolvePurchaseAttachments(raw);
      if (!cancelled) setAttachments(resolved);
    })();
    return () => { cancelled = true; };
  }, [initial]);

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = {};
    if (!form.titre.trim()) e.titre = 'Requis';
    const lignes = (form.lignes || []).filter((l) => (l.designation || '').trim());
    if (!lignes.length) e.lignes = 'Ajoutez au moins une ligne';
    else if (lignes.some((l) => !l.project_id)) e.lignes = 'Chaque ligne doit avoir un projet';
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    onSave({
      ...form,
      is_grouped: true,
      assigned_employee_name: responsableLabel,
      payload: buildGroupedFormPayload(form, initial?.payload, attachments, projects),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#E3F2FD', border: '1px solid #90CAF9', fontSize: '0.82rem', color: 'var(--text-2)' }}>
        <strong>Achats groupés</strong> — une seule demande, plusieurs projets. Chaque ligne est imputée à son projet après validation.
      </div>
      <SectionTitle icon={<Layers size={12} />}>Informations générales</SectionTitle>
      <FRow>
        <FField label="Titre de la demande groupée" required>
          <input value={form.titre} onChange={(e) => set('titre', e.target.value)} placeholder="ex. Achats multi-chantiers juin 2026" style={{ ...INPUT_STYLE, borderColor: errors.titre ? 'var(--red)' : 'var(--border)' }} />
          {errors.titre && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.titre}</div>}
        </FField>
        <FField label="Priorité">
          <select value={form.priorite} onChange={(e) => set('priorite', e.target.value)} style={SELECT_STYLE}>
            {PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FField>
        <FField label="Date souhaitée">
          <input type="date" value={form.date_limite} onChange={(e) => set('date_limite', e.target.value)} style={INPUT_STYLE} />
        </FField>
      </FRow>
      <FRow>
        <FField label="Responsable">
          <input value={responsableLabel} readOnly style={{ ...INPUT_STYLE, background: 'var(--surface-2)', cursor: 'not-allowed' }} />
        </FField>
      </FRow>

      <SectionTitle icon={<Package size={12} />}>Besoins / Articles demandés</SectionTitle>
      <GroupedDemandeLignesTable
        lignes={form.lignes}
        onChange={(v) => set('lignes', v)}
        projects={projects}
        suppliers={suppliers}
        lineError={errors.lignes}
      />

      <div style={{ marginTop: 20 }}>
        <FField label="Description / contexte">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} style={TEXTAREA_STYLE} placeholder="Contexte global de la demande groupée..." />
        </FField>
      </div>
      <div style={{ marginTop: 12 }}>
        <FField label="Commentaires internes">
          <textarea value={form.commentaires_internes} onChange={(e) => set('commentaires_internes', e.target.value)} rows={2} style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ marginTop: 16 }}>
        <UploadField scope="requests" requestId={initial?.id} attachments={attachments} onChange={setAttachments} disabled={!!initial?.id && initial?.statut !== 'Brouillon'} />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <Layers size={14} />}
          {initial?.id ? 'Enregistrer' : 'Créer la demande groupée'}
        </button>
      </div>
    </form>
  );
}

function DemandeForm({ initial, onSave, onCancel, saving, suppliers = [], projects = [], sessionUser, superAdminEdit = false }) {
  const [form, setForm] = useState(() => toFormState(initial));
  const [attachments, setAttachments] = useState(() => initial?.payload?.attachments || []);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const isHorsProjet = form.link_type === 'hors_projet';

  const responsableLabel = initial?.assigned_employee_name
    || initial?.requester_name
    || sessionUser?.nom
    || sessionUser?.email?.split('@')[0]
    || '—';

  const fournActifs = suppliers.filter((f) => f.statut === 'Actif' || f.status === 'active');

  useEffect(() => {
    setForm(toFormState(initial));
    setErrors({});
    let cancelled = false;
    (async () => {
      const raw = initial?.payload?.attachments || [];
      if (!raw.length) {
        if (!cancelled) setAttachments([]);
        return;
      }
      const { resolvePurchaseAttachments } = await import('../../services/achats/purchaseStorage');
      const resolved = await resolvePurchaseAttachments(raw);
      if (!cancelled) setAttachments(resolved);
    })();
    return () => { cancelled = true; };
  }, [initial]);

  function handleSupplierChange(supplierId) {
    const s = fournActifs.find((x) => x.id === supplierId);
    setForm((p) => ({
      ...p,
      supplier_id: supplierId || '',
      fournisseur: s ? (s.company_name || s.raison_sociale || s.nom || '') : p.fournisseur,
    }));
  }

  function handleProjectChange(projectId) {
    const p = projects.find((x) => x.id === projectId);
    setForm((prev) => ({
      ...prev,
      project_id: projectId || '',
      project_ref: p?.ref || '',
      projet_lie: p ? projectOptionLabel(p) : '',
      project_name: p?.nom || '',
    }));
    if (projectId) setErrors((e) => ({ ...e, projet_lie: undefined }));
  }

  function handleLinkTypeChange(linkType) {
    setForm((prev) => ({
      ...prev,
      link_type: linkType,
      ...(linkType === 'hors_projet'
        ? { project_id: '', project_ref: '', projet_lie: '', project_name: '' }
        : {}),
    }));
    setErrors((e) => ({ ...e, projet_lie: undefined }));
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = {};
    if (!form.titre.trim()) e.titre = 'Requis';
    if (!isHorsProjet && !form.projet_lie.trim() && !form.project_id) e.projet_lie = 'Requis';
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    onSave({
      ...form,
      assigned_employee_name: responsableLabel,
      payload: buildFormPayload(form, initial?.payload, attachments),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {superAdminEdit && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(198,40,40,0.08)', border: '1px solid rgba(198,40,40,0.25)', fontSize: '0.82rem', color: 'var(--text-2)' }}>
          Modification super administrateur — les changements seront appliqués automatiquement sur l&apos;ordre d&apos;achat et l&apos;ordre de paiement liés.
        </div>
      )}
      <SectionTitle icon={<ClipboardList size={12} />}>Type de demande</SectionTitle>
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
          <input
            type="radio"
            name="link_type"
            checked={form.link_type === 'projet'}
            onChange={() => handleLinkTypeChange('projet')}
          />
          Demande liée à un projet
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
          <input
            type="radio"
            name="link_type"
            checked={isHorsProjet}
            onChange={() => handleLinkTypeChange('hors_projet')}
          />
          Demande hors projet
        </label>
      </div>

      <SectionTitle icon={<ClipboardList size={12} />}>Informations générales</SectionTitle>
      <FRow>
        <FField label={isHorsProjet ? 'Objet / Titre de la demande' : 'Titre'} required>
          <input
            value={form.titre}
            onChange={(e) => set('titre', e.target.value)}
            placeholder={isHorsProjet ? 'ex. Achat bureau, Consommables, Informatique...' : 'Titre de la demande...'}
            style={{ ...INPUT_STYLE, borderColor: errors.titre ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.titre && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.titre}</div>}
        </FField>
        <FField label="Priorité">
          <select value={form.priorite} onChange={(e) => set('priorite', e.target.value)} style={SELECT_STYLE}>
            {PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FField>
        <FField label="Date souhaitée">
          <input type="date" value={form.date_limite} onChange={(e) => set('date_limite', e.target.value)} style={INPUT_STYLE} />
        </FField>
      </FRow>
      {!isHorsProjet && (
        <FRow>
          <FField label="Projet lié" required>
            {projects.length > 0 ? (
              <select
                value={form.project_id || ''}
                onChange={(e) => handleProjectChange(e.target.value)}
                style={{ ...SELECT_STYLE, borderColor: errors.projet_lie ? 'var(--red)' : 'var(--border)' }}
              >
                <option value="">— Sélectionner un projet —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{projectOptionLabel(p)}</option>
                ))}
              </select>
            ) : (
              <input
                value={form.projet_lie}
                onChange={(e) => set('projet_lie', e.target.value)}
                placeholder="ex. PRJ-2026-012 — Villa Anfa, chantier Lakhyayta..."
                style={{ ...INPUT_STYLE, borderColor: errors.projet_lie ? 'var(--red)' : 'var(--border)' }}
              />
            )}
            {errors.projet_lie && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.projet_lie}</div>}
          </FField>
          <FField label="Responsable">
            <input value={responsableLabel} readOnly style={{ ...INPUT_STYLE, background: 'var(--surface-2)', cursor: 'not-allowed' }} />
          </FField>
        </FRow>
      )}
      {isHorsProjet && (
        <FRow>
          <FField label="Responsable">
            <input value={responsableLabel} readOnly style={{ ...INPUT_STYLE, background: 'var(--surface-2)', cursor: 'not-allowed' }} />
          </FField>
        </FRow>
      )}
      <FRow>
        <FField label="Fournisseur souhaité">
          {fournActifs.length > 0 ? (
            <select
              value={form.supplier_id || ''}
              onChange={(e) => handleSupplierChange(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="">— Sélectionner ou saisir ci-dessous —</option>
              {fournActifs.map((s) => (
                <option key={s.id} value={s.id}>{s.company_name || s.raison_sociale || s.nom}</option>
              ))}
            </select>
          ) : null}
          <input
            value={form.fournisseur}
            onChange={(e) => setForm((p) => ({ ...p, fournisseur: e.target.value, supplier_id: '' }))}
            placeholder="Nom du fournisseur (libre ou complément)"
            style={{ ...INPUT_STYLE, marginTop: fournActifs.length ? 8 : 0 }}
          />
        </FField>
      </FRow>

      <SectionTitle icon={<Package size={12} />}>Besoins / Articles demandés</SectionTitle>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '0 0 10px' }}>
        Ajoutez une ou plusieurs lignes (désignation, quantité, unité) pour cette demande.
      </p>
      <div style={{ marginBottom: 20 }}>
        <DemandeLignesTable
          lignes={form.lignes}
          onChange={(v) => set('lignes', v)}
          error={errors.lignes}
        />
      </div>
      <SectionTitle>Description</SectionTitle>
      <FField label="Description détaillée">
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Détail du besoin, contexte..." style={TEXTAREA_STYLE} />
      </FField>
      <SectionTitle>Commentaires internes</SectionTitle>
      <FField label="Commentaires">
        <textarea value={form.commentaires_internes} onChange={(e) => set('commentaires_internes', e.target.value)} placeholder="Notes internes..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
      </FField>
      <div style={{ marginBottom: 20 }}>
        <UploadField
          label="Pièces jointes"
          value={attachments}
          onChange={setAttachments}
          scope="requests"
          scopeId={initial?.id || 'new'}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
          {initial ? 'Enregistrer' : 'Créer demande'}
        </button>
      </div>
    </form>
  );
}

function computeDashboardKpis(items) {
  const norm = (s) => normalizePurchaseStatus(s);
  const ouvertes = items.filter((x) => !['Clôturée', 'Refusée', 'Brouillon'].includes(norm(x.statut))).length;
  const soumises = items.filter((x) => norm(x.statut) === 'Soumise').length;
  const enCoursTraitement = items.filter((x) => norm(x.statut) === 'En étude').length;
  const rechercheDevis = items.filter((x) => norm(x.statut) === 'Devis reçus').length;
  const attenteDg = items.filter((x) => norm(x.statut) === 'En attente validation DG').length;
  const devisValides = items.filter((x) => norm(x.statut) === 'Devis validé').length;
  const oaEnCours = items.filter((x) => ['Ordre d\'achat créé', 'Ordre de paiement créé', 'Commande envoyée'].includes(norm(x.statut))).length;
  const enAttenteReception = items.filter((x) => norm(x.statut) === 'En attente réception').length;
  const receptionnees = items.filter((x) => ['Réceptionnée', 'Clôturée'].includes(norm(x.statut))).length;
  const now = new Date();
  const monthItems = items.filter((x) => {
    const d = x.created_at ? new Date(x.created_at) : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  return {
    ouvertes,
    soumises,
    enCoursTraitement,
    rechercheDevis,
    attenteDg,
    devisValides,
    oaEnCours,
    enAttenteReception,
    receptionnees,
    depensesMois: monthItems.length,
  };
}

export default function DemandesAchat() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const { records: suppliers } = useSuppliers();
  const {
    records: items, projects, loading, saving, error, configured, reload, save, remove,
  } = usePurchaseRequests();

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPrio, setFilterPrio] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [modalMode, setModalMode] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detailAddQuote, setDetailAddQuote] = useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [submittingId, setSubmittingId] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [titleEditId, setTitleEditId] = useState(null);
  const [titleEditValue, setTitleEditValue] = useState('');
  const [titleSavingId, setTitleSavingId] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (user) resolveCurrentPurchaseRole(user).then(setRole);
  }, [user]);

  useEffect(() => {
    const fromSession = sessionStorage.getItem('citymo_purchase_request_detail');
    if (fromSession) {
      sessionStorage.removeItem('citymo_purchase_request_detail');
      setDetailId(fromSession);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('requestId');
    if (requestId) setDetailId(requestId);
  }, []);

  const perms = useMemo(() => purchasePermissions(role), [role]);

  useEffect(() => {
    if (!configured) return;
    reconcileMissingPurchaseRequestRefs()
      .then((refs) => { if (refs > 0) reload(); })
      .catch(() => {});
  }, [configured, reload]);

  useEffect(() => {
    if (!configured || !perms.canManageQuotes) return;
    Promise.all([
      reconcileLegacySoumiseRequests(),
      reconcilePurchaseRequestSentStatus(),
    ])
      .then(([legacy, sent]) => { if ((legacy || 0) + (sent || 0) > 0) reload(); })
      .catch(() => {});
  }, [configured, perms.canManageQuotes, reload]);

  const visibleItems = useMemo(() => {
    if (perms.canViewAll) return items;
    return items.filter((x) => canViewPurchaseRequest(x, user, role));
  }, [items, user, role, perms.canViewAll]);

  const handleSave = useCallback(async (data) => {
    const result = await save(data, editItem?.id);
    if (result.success) {
      setModalMode(null);
      setEditItem(null);
      if (detailId) setDetailRefreshKey((k) => k + 1);
    }
  }, [editItem, save, detailId]);

  function openCreateModal(mode) {
    setEditItem(null);
    setModalMode(mode);
  }

  function openEditModal(item) {
    setEditItem(item);
    setModalMode(isGroupedPurchaseRequest(item) ? 'grouped' : 'simple');
  }

  function closeModal() {
    setModalMode(null);
    setEditItem(null);
  }

  async function handleDelete(id) {
    const item = items.find((x) => x.id === id);
    const isDraft = normalizePurchaseStatus(item?.statut) === 'Brouillon';
    const msg = isDraft
      ? 'Supprimer cette demande ?'
      : 'Cette demande est validée ou en cours. Supprimer la demande et les ordres liés (OA, OP) ?';
    if (!window.confirm(msg)) return;
    const result = await remove(id);
    if (result.success) setDetailId(null);
  }

  async function handlePrintPdf(item) {
    setPdfLoadingId(item.id);
    try {
      const bundle = await getPurchaseRequestBundle(item.id);
      await generatePurchaseRequestPdf(bundle.request);
    } catch (err) {
      window.alert(err.message || 'Erreur génération PDF');
    } finally {
      setPdfLoadingId(null);
    }
  }

  function canEditTitle(item) {
    if (perms.canManageQuotes) return true;
    return item.requester_user_id === user?.id || item.created_by === user?.id;
  }

  function startTitleEdit(item) {
    if (!canEditTitle(item) || titleSavingId) return;
    setTitleEditId(item.id);
    setTitleEditValue(item.titre || '');
  }

  async function commitTitleEdit(item) {
    const trimmed = titleEditValue.trim();
    setTitleEditId(null);
    if (!trimmed || trimmed === (item.titre || '').trim()) return;
    setTitleSavingId(item.id);
    try {
      await updatePurchaseRequestTitle(item.id, trimmed);
      await reload();
    } catch (err) {
      window.alert(err.message || 'Erreur mise à jour du titre');
    } finally {
      setTitleSavingId(null);
    }
  }

  function cancelTitleEdit() {
    setTitleEditId(null);
    setTitleEditValue('');
  }

  const filtered = visibleItems.filter((x) => {
    const q = search.toLowerCase();
    const projectLabel = (x.projet_lie || x.project_name || x.project_ref || '').toLowerCase();
    return (!q || x.ref?.toLowerCase().includes(q) || x.titre?.toLowerCase().includes(q) || projectLabel.includes(q) || (x.requester_name || '').toLowerCase().includes(q))
      && (!filterStatut || normalizePurchaseStatus(x.statut) === filterStatut)
      && (!filterPrio || x.priorite === filterPrio)
      && (!filterProjet || projectLabel.includes(filterProjet.toLowerCase()));
  });

  const kpis = computeDashboardKpis(visibleItems);

  async function handleSubmit(id) {
    setSubmittingId(id);
    try {
      await submitPurchaseRequest(id);
      await reload();
    } catch (err) {
      window.alert(err.message || 'Erreur soumission');
    } finally {
      setSubmittingId(null);
    }
  }

  if (detailId) {
    return (
      <>
        <DemandeAchatDetail
          requestId={detailId}
          suppliers={suppliers}
          refreshKey={detailRefreshKey}
          onBack={() => { setDetailId(null); setDetailAddQuote(false); }}
          initialShowQuoteForm={detailAddQuote}
          onEdit={() => {
            const item = items.find((x) => x.id === detailId);
            if (!item) {
              window.alert('Demande introuvable.');
              return;
            }
            if (!canEditPurchaseRequest(item.statut, { isSuperAdmin: superAdmin })) {
              window.alert('Cette demande ne peut être modifiée qu\'en statut Brouillon (ou par le super administrateur).');
              return;
            }
            openEditModal(item);
          }}
          onRefresh={reload}
        />
        <Modal open={modalMode !== null} onClose={closeModal} title={
          editItem
            ? (isGroupedPurchaseRequest(editItem) ? 'Modifier achats groupés' : (superAdmin && editItem.statut !== 'Brouillon' ? 'Modifier la demande (super admin)' : 'Modifier la demande'))
            : (modalMode === 'grouped' ? 'Achats groupés' : "Nouvelle demande d'achat")
        } width={modalMode === 'grouped' ? 960 : 780}>
          {modalMode === 'grouped' ? (
            <GroupedDemandeForm
              initial={editItem}
              onSave={handleSave}
              onCancel={closeModal}
              saving={saving}
              suppliers={suppliers}
              projects={projects}
              sessionUser={user}
            />
          ) : (
            <DemandeForm
              initial={editItem}
              onSave={handleSave}
              onCancel={closeModal}
              saving={saving}
              suppliers={suppliers}
              projects={projects}
              sessionUser={user}
              superAdminEdit={superAdmin && editItem && editItem.statut !== 'Brouillon'}
            />
          )}
        </Modal>
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">TABLEAU DE BORD ACHATS</h1>
          <p className="page-subtitle">
            Demandes d&apos;achat — workflow sécurisé de la demande à la réception.
            {import.meta.env.VITE_BUILD_ID && (
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                Build {String(import.meta.env.VITE_BUILD_ID).slice(0, 7)}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}><Filter size={14} /> Filtres</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}><RefreshCw size={14} /> Actualiser</button>
          {perms.canCreateRequest && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => openCreateModal('grouped')}>
                <Layers size={15} /> Achats groupés
              </button>
              <button type="button" className="btn btn-primary" onClick={() => openCreateModal('simple')}>
                <Plus size={15} /> Nouvelle demande
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
          {!configured && <div style={{ marginTop: 6, fontSize: '0.78rem' }}>Exécutez <code>supabase/RUN_PURCHASE_WORKFLOW_COMPLET.sql</code> dans Supabase SQL Editor.</div>}
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<ClipboardList size={17} />} label="Ouvertes" value={kpis.ouvertes} color="blue" />
        <KpiCard icon={<Send size={17} />} label="Soumises" value={kpis.soumises} sub="En attente prise en charge" color="blue" />
        <KpiCard icon={<Clock size={17} />} label="En cours de traitement" value={kpis.enCoursTraitement} sub="Prise en charge Achats" color="orange" />
        <KpiCard icon={<BarChart2 size={17} />} label="Recherche devis" value={kpis.rechercheDevis} sub="Devis fournisseurs reçus" color="purple" />
        <KpiCard icon={<BarChart2 size={17} />} label="Attente validation DG" value={kpis.attenteDg} color="purple" />
        <KpiCard icon={<CheckCircle size={17} />} label="Devis validés" value={kpis.devisValides} color="green" />
        <KpiCard icon={<Package size={17} />} label="OA en cours" value={kpis.oaEnCours} color="blue" />
        <KpiCard icon={<AlertTriangle size={17} />} label="En attente réception" value={kpis.enAttenteReception} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Réceptionnées" value={kpis.receptionnees} color="green" />
        <KpiCard icon={<CreditCard size={17} />} label="DA ce mois" value={kpis.depensesMois} color="grey" />
      </div>

      {(showFilters || search) && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf., titre, projet, demandeur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Tous statuts</option>
              {STATUTS_DEMANDE.map((s) => <option key={s} value={s}>{getPurchaseStatusLabel(s)}</option>)}
            </select>
            <select value={filterPrio} onChange={(e) => setFilterPrio(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Priorité</option>
              {PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              value={filterProjet}
              onChange={(e) => setFilterProjet(e.target.value)}
              placeholder="Filtrer par projet..."
              style={{ ...INPUT_STYLE, maxWidth: 200 }}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterPrio(''); setFilterProjet(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={20} className="cin-spin" /> Chargement...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ClipboardList size={24} />} title="Aucune demande" sub="Créez votre première demande d'achat" action={perms.canCreateRequest ? 'Nouvelle demande' : undefined} onAction={() => openCreateModal('simple')} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Titre</th>
                  <th>Priorité</th>
                  <th>Demandeur</th>
                  <th>Projet</th>
                  <th>Date souhaitée</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id}>
                    <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                    <td data-label="Titre">
                      {titleEditId === x.id ? (
                        <input
                          value={titleEditValue}
                          onChange={(e) => setTitleEditValue(e.target.value)}
                          onBlur={() => commitTitleEdit(x)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit(x); }
                            if (e.key === 'Escape') { e.preventDefault(); cancelTitleEdit(); }
                          }}
                          autoFocus
                          disabled={titleSavingId === x.id}
                          style={{ ...INPUT_STYLE, fontWeight: 600, fontSize: '0.87rem', padding: '5px 8px' }}
                        />
                      ) : (
                        <div
                          role={canEditTitle(x) ? 'button' : undefined}
                          tabIndex={canEditTitle(x) ? 0 : undefined}
                          title={canEditTitle(x) ? 'Cliquer pour modifier le titre' : undefined}
                          onClick={() => startTitleEdit(x)}
                          onKeyDown={(e) => {
                            if (canEditTitle(x) && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              startTitleEdit(x);
                            }
                          }}
                          style={{
                            fontWeight: 600,
                            fontSize: '0.87rem',
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: canEditTitle(x) ? 'text' : 'default',
                            opacity: titleSavingId === x.id ? 0.6 : 1,
                          }}
                        >
                          {titleSavingId === x.id ? <Loader2 size={12} className="cin-spin" style={{ display: 'inline' }} /> : null}
                          {x.titre}
                        </div>
                      )}
                    </td>
                    <td data-label="Priorité"><span className={`badge ${BADGE_PRIORITE[x.priorite] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{x.priorite}</span></td>
                    <td data-label="Demandeur">{x.requester_name || x.demandeur || '—'}</td>
                    <td data-label="Projet">{purchaseRequestProjectLabel(x)}</td>
                    <td data-label="Date">{x.date_limite || '—'}</td>
                    <td data-label="Statut">
                      <span className={`badge ${getPurchaseStatusBadge(x.statut)}`} style={{ fontSize: '0.72rem' }}>
                        {getPurchaseStatusLabel(x.statut)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                        {canEditPurchaseRequest(x.statut, { isSuperAdmin: superAdmin }) && (
                          <button type="button" className="btn btn-ghost btn-sm" title={superAdmin && x.statut !== 'Brouillon' ? 'Modifier (super admin)' : 'Modifier'} onClick={() => openEditModal(x)}><Edit2 size={13} /></button>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm" title="PDF" disabled={pdfLoadingId === x.id} onClick={() => handlePrintPdf(x)}>
                          {pdfLoadingId === x.id ? <Loader2 size={12} className="cin-spin" /> : <FileText size={13} />}
                        </button>
                        {canSubmitPurchaseRequest(x.statut) && (
                          <button type="button" className="btn btn-primary btn-sm" title="Soumettre" disabled={submittingId === x.id} onClick={() => handleSubmit(x.id)}>
                            {submittingId === x.id ? <Loader2 size={12} className="cin-spin" /> : <Send size={12} />}
                          </button>
                        )}
                        {perms.canManageQuotes && canAddQuoteToRequest(x.statut) && (
                          <button type="button" className="btn btn-ghost btn-sm" title="Ajouter devis" onClick={() => { setDetailAddQuote(true); setDetailId(x.id); }}><Plus size={12} /></button>
                        )}
                        {perms.canValidateSupplier && canValidateQuoteOnRequest(x.statut) && (
                          <button type="button" className="btn btn-primary btn-sm" title="Valider (DG)" onClick={() => setDetailId(x.id)}><CheckCircle size={12} /></button>
                        )}
                        {canDeletePurchaseRequest() && (
                          <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={12} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalMode !== null} onClose={closeModal} title={
        editItem
          ? (isGroupedPurchaseRequest(editItem) ? 'Modifier achats groupés' : (superAdmin && editItem.statut !== 'Brouillon' ? 'Modifier la demande (super admin)' : 'Modifier la demande'))
          : (modalMode === 'grouped' ? 'Achats groupés' : "Nouvelle demande d'achat")
      } width={modalMode === 'grouped' ? 960 : 780}>
        {modalMode === 'grouped' ? (
          <GroupedDemandeForm
            initial={editItem}
            onSave={handleSave}
            onCancel={closeModal}
            saving={saving}
            suppliers={suppliers}
            projects={projects}
            sessionUser={user}
          />
        ) : (
          <DemandeForm
            initial={editItem}
            onSave={handleSave}
            onCancel={closeModal}
            saving={saving}
            suppliers={suppliers}
            projects={projects}
            sessionUser={user}
            superAdminEdit={superAdmin && editItem && editItem.statut !== 'Brouillon'}
          />
        )}
      </Modal>
    </div>
  );
}
