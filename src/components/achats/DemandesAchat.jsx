/**
 * DemandesAchat.jsx — Tableau de bord & workflow demandes d'achat ERP CITYMO
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ClipboardList, Plus, Eye, Edit2, Trash2, Search, Filter,
  Download, AlertTriangle, Clock, Loader2, RefreshCw, History, FileText,
  BarChart2, Package, CreditCard, CheckCircle,
} from 'lucide-react';
import { usePurchaseRequests } from '../../hooks/usePurchaseRequests';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useAuth } from '../../hooks/useAuth';
import { projectOptionLabel } from '../../services/achats/purchaseRequests';
import { PURCHASE_ASSIGNEE } from '../../constants/purchaseWorkflow';
import { canEditPurchaseRequest, canDeletePurchaseRequest, normalizePurchaseStatus } from '../../constants/purchaseWorkflow';
import { resolveCurrentPurchaseRole, purchasePermissions, canViewPurchaseRequest } from '../../services/achats/purchaseWorkflowRoles';
import DemandeAchatDetail from './DemandeAchatDetail';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_DEMANDE, PRIORITES, BADGE_DEMANDE, BADGE_PRIORITE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField, formatMAD,
} from './shared.jsx';

const EMPTY_FORM = {
  titre: '',
  priorite: 'Normale',
  date_limite: '',
  project_id: '',
  project_ref: '',
  project_name: '',
  description: '',
  commentaires_internes: '',
};

function toFormState(item) {
  if (!item) return EMPTY_FORM;
  return {
    ...EMPTY_FORM,
    titre: item.titre || '',
    priorite: item.priorite || 'Normale',
    date_limite: item.date_limite || '',
    project_id: item.project_id || '',
    project_ref: item.project_ref || '',
    project_name: item.project_name || '',
    description: item.description || '',
    commentaires_internes: item.commentaires_internes || '',
  };
}

function DemandeForm({ initial, onSave, onCancel, saving, projects, optionsLoading }) {
  const [form, setForm] = useState(() => toFormState(initial));
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    setForm(toFormState(initial));
    setErrors({});
  }, [initial]);

  function handleProjectChange(projectId) {
    const p = projects.find((x) => x.id === projectId);
    if (p) {
      setForm((prev) => ({
        ...prev,
        project_id: p.id,
        project_ref: p.ref || '',
        project_name: p.nom || '',
      }));
    } else {
      setForm((prev) => ({ ...prev, project_id: '', project_ref: '', project_name: '' }));
    }
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = {};
    if (!form.titre.trim()) e.titre = 'Requis';
    if (!form.project_id) e.project_id = 'Requis';
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<ClipboardList size={12} />}>Informations générales</SectionTitle>
      <FRow>
        <FField label="Titre" required>
          <input
            value={form.titre}
            onChange={(e) => set('titre', e.target.value)}
            placeholder="Titre de la demande..."
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
      <FRow>
        <FField label="Projet lié" required>
          {optionsLoading ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={14} className="cin-spin" /> Chargement...
            </div>
          ) : (
            <select
              value={form.project_id || ''}
              onChange={(e) => handleProjectChange(e.target.value)}
              style={{ ...SELECT_STYLE, borderColor: errors.project_id ? 'var(--red)' : 'var(--border)' }}
            >
              <option value="">Choisir un projet...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{projectOptionLabel(p)}</option>
              ))}
            </select>
          )}
          {errors.project_id && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.project_id}</div>}
        </FField>
        <FField label="Responsable Achats">
          <input value={PURCHASE_ASSIGNEE.label} readOnly style={{ ...INPUT_STYLE, background: 'var(--surface-2)', cursor: 'not-allowed' }} />
        </FField>
      </FRow>
      <SectionTitle>Description</SectionTitle>
      <FField label="Description détaillée">
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Détail du besoin, contexte..." style={TEXTAREA_STYLE} />
      </FField>
      <SectionTitle>Commentaires internes</SectionTitle>
      <FField label="Commentaires">
        <textarea value={form.commentaires_internes} onChange={(e) => set('commentaires_internes', e.target.value)} placeholder="Notes internes..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
      </FField>
      <div style={{ marginBottom: 20 }}><UploadField label="Pièces jointes" /></div>
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
  const ouvertes = items.filter((x) => !['Clôturée', 'Refusée'].includes(norm(x.statut))).length;
  const enEtude = items.filter((x) => ['Soumise', 'En étude Achats'].includes(norm(x.statut))).length;
  const devisAttente = items.filter((x) => ['Devis reçus', 'En validation DG'].includes(norm(x.statut))).length;
  const devisValides = items.filter((x) => ['Validée', 'Ordre d\'achat créé'].includes(norm(x.statut))).length;
  const oaEnCours = items.filter((x) => ['Ordre d\'achat créé', 'Commande en cours'].includes(norm(x.statut))).length;
  const enAttenteReception = items.filter((x) => norm(x.statut) === 'Commande en cours').length;
  const receptionnees = items.filter((x) => ['Commande reçue', 'Clôturée'].includes(norm(x.statut))).length;
  const now = new Date();
  const monthItems = items.filter((x) => {
    const d = x.created_at ? new Date(x.created_at) : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  return {
    ouvertes, enEtude, devisAttente, devisValides, oaEnCours,
    enAttenteReception, receptionnees,
    depensesMois: monthItems.length,
    budgetEngage: devisValides + oaEnCours,
  };
}

export default function DemandesAchat() {
  const { user } = useAuth();
  const { records: suppliers } = useSuppliers();
  const {
    records: items, projects, loading, optionsLoading, saving, error, configured, reload, save, remove,
  } = usePurchaseRequests();

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPrio, setFilterPrio] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (user) resolveCurrentPurchaseRole(user).then(setRole);
  }, [user]);

  const perms = useMemo(() => purchasePermissions(role), [role]);

  const visibleItems = useMemo(() => {
    if (perms.canViewAll) return items;
    return items.filter((x) => canViewPurchaseRequest(x, user, role));
  }, [items, user, role, perms.canViewAll]);

  const handleSave = useCallback(async (data) => {
    const result = await save(data, editItem?.id);
    if (result.success) {
      setShowModal(false);
      setEditItem(null);
    }
  }, [editItem, save]);

  async function handleDelete(id) {
    const item = items.find((x) => x.id === id);
    if (!canDeletePurchaseRequest(item?.statut)) {
      window.alert('Seules les demandes en brouillon peuvent être supprimées.');
      return;
    }
    if (!window.confirm('Supprimer cette demande ?')) return;
    const result = await remove(id);
    if (result.success) setDetailId(null);
  }

  function handlePrintPdf(item) {
    window.open(`#achats-da-${item.id}`, '_blank');
    window.print();
  }

  const filtered = visibleItems.filter((x) => {
    const q = search.toLowerCase();
    const projectLabel = x.project_ref || x.projet_lie || '';
    return (!q || x.ref?.toLowerCase().includes(q) || x.titre?.toLowerCase().includes(q) || projectLabel.toLowerCase().includes(q) || (x.requester_name || '').toLowerCase().includes(q))
      && (!filterStatut || normalizePurchaseStatus(x.statut) === filterStatut)
      && (!filterPrio || x.priorite === filterPrio)
      && (!filterProjet || x.project_id === filterProjet);
  });

  const kpis = computeDashboardKpis(visibleItems);

  if (detailId) {
    return (
      <DemandeAchatDetail
        requestId={detailId}
        suppliers={suppliers}
        onBack={() => setDetailId(null)}
        onEdit={() => {
          const item = items.find((x) => x.id === detailId);
          if (item && canEditPurchaseRequest(item.statut)) {
            setEditItem(item);
            setShowModal(true);
          }
        }}
        onRefresh={reload}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">TABLEAU DE BORD ACHATS</h1>
          <p className="page-subtitle">Demandes d&apos;achat — workflow sécurisé de la demande à la réception.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}><Filter size={14} /> Filtres</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}><RefreshCw size={14} /> Actualiser</button>
          {perms.canCreateRequest && (
            <button type="button" className="btn btn-primary" onClick={() => { setEditItem(null); setShowModal(true); }}>
              <Plus size={15} /> Nouvelle demande
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
          {!configured && <div style={{ marginTop: 6, fontSize: '0.78rem' }}>Exécutez <code>supabase/RUN_PURCHASE_WORKFLOW.sql</code> dans Supabase.</div>}
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<ClipboardList size={17} />} label="Ouvertes" value={kpis.ouvertes} color="blue" />
        <KpiCard icon={<Clock size={17} />} label="En étude" value={kpis.enEtude} color="orange" />
        <KpiCard icon={<BarChart2 size={17} />} label="Devis en attente" value={kpis.devisAttente} color="purple" />
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
              {STATUTS_DEMANDE.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterPrio} onChange={(e) => setFilterPrio(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Priorité</option>
              {PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterProjet} onChange={(e) => setFilterProjet(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
              <option value="">Projet</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{projectOptionLabel(p)}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterPrio(''); setFilterProjet(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={20} className="cin-spin" /> Chargement...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ClipboardList size={24} />} title="Aucune demande" sub="Créez votre première demande d'achat" action={perms.canCreateRequest ? 'Nouvelle demande' : undefined} onAction={() => { setEditItem(null); setShowModal(true); }} />
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
                    <td data-label="Titre"><div style={{ fontWeight: 600, fontSize: '0.87rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.titre}</div></td>
                    <td data-label="Priorité"><span className={`badge ${BADGE_PRIORITE[x.priorite] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{x.priorite}</span></td>
                    <td data-label="Demandeur">{x.requester_name || x.demandeur || '—'}</td>
                    <td data-label="Projet">{x.project_ref || x.projet_lie || '—'}</td>
                    <td data-label="Date">{x.date_limite || '—'}</td>
                    <td data-label="Statut"><span className={`badge ${BADGE_DEMANDE[x.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{x.statut}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Visualiser" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                        {canEditPurchaseRequest(x.statut) && (
                          <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                        )}
                        {canDeletePurchaseRequest(x.statut) && (
                          <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm" title="PDF" onClick={() => handlePrintPdf(x)}><FileText size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Historique" onClick={() => setDetailId(x.id)}><History size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? 'Modifier la demande' : "Nouvelle demande d'achat"} width={680}>
        <DemandeForm
          initial={editItem}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditItem(null); }}
          saving={saving}
          projects={projects}
          optionsLoading={optionsLoading}
        />
      </Modal>
    </div>
  );
}
