/**
 * DemandesAchat.jsx — Demandes d'achat ERP CITYMO (Supabase purchase_requests)
 */
import { useState, useCallback, useEffect } from 'react';
import {
  ClipboardList, Plus, Eye, Edit2, Trash2, CheckCircle, XCircle, Search, Filter,
  Download, AlertTriangle, Clock, Loader2, RefreshCw,
} from 'lucide-react';
import { usePurchaseRequests } from '../../hooks/usePurchaseRequests';
import {
  projectOptionLabel,
  employeeOptionLabel,
} from '../../services/achats/purchaseRequests';
import { employeeFullName } from '../../services/rh/employees';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_DEMANDE, PRIORITES, BADGE_DEMANDE, BADGE_PRIORITE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
} from './shared.jsx';

const ACHATS_DEPARTMENT_LABEL = 'ACHATS';

const EMPTY_FORM = {
  titre: '',
  priorite: 'Normale',
  statut: 'Brouillon',
  date_debut: '',
  date_limite: '',
  department: ACHATS_DEPARTMENT_LABEL,
  departement: ACHATS_DEPARTMENT_LABEL,
  project_id: '',
  project_ref: '',
  project_name: '',
  assigned_employee_id: '',
  assigned_employee_name: '',
  description: '',
};

function toFormState(item) {
  if (!item) return EMPTY_FORM;
  return {
    ...EMPTY_FORM,
    titre: item.titre || '',
    priorite: item.priorite || 'Normale',
    statut: item.statut || 'Brouillon',
    date_debut: item.date_debut || '',
    date_limite: item.date_limite || '',
    project_id: item.project_id || '',
    project_ref: item.project_ref || '',
    project_name: item.project_name || '',
    assigned_employee_id: item.assigned_employee_id || '',
    assigned_employee_name: item.assigned_employee_name || '',
    description: item.description || '',
    ref: item.ref || '',
  };
}

function DemandeForm({ initial, onSave, onCancel, saving, projects, employees, optionsLoading }) {
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
      setForm((prev) => ({
        ...prev,
        project_id: '',
        project_ref: '',
        project_name: '',
      }));
    }
  }

  function handleEmployeeChange(employeeId) {
    const e = employees.find((x) => x.id === employeeId);
    if (e) {
      setForm((prev) => ({
        ...prev,
        assigned_employee_id: e.id,
        assigned_employee_name: employeeFullName(e),
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        assigned_employee_id: '',
        assigned_employee_name: '',
      }));
    }
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.titre.trim()) {
      setErrors({ titre: 'Requis' });
      return;
    }
    setErrors({});
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<ClipboardList size={12} />}>Informations</SectionTitle>
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
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_DEMANDE.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
        <FField label="Date début"><input type="date" value={form.date_debut} onChange={(e) => set('date_debut', e.target.value)} style={INPUT_STYLE} /></FField>
        <FField label="Date limite"><input type="date" value={form.date_limite} onChange={(e) => set('date_limite', e.target.value)} style={INPUT_STYLE} /></FField>
      </FRow>
      <SectionTitle icon={<ClipboardList size={12} />}>Assignation</SectionTitle>
      <FRow>
        <FField label="Utilisateur assigné">
          {optionsLoading ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={14} className="spin" /> Chargement des employés...
            </div>
          ) : employees.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--orange)', padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
              Aucun employé du département Achats trouvé
            </div>
          ) : (
            <select
              value={form.assigned_employee_id || ''}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="">Choisir un employé...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{employeeOptionLabel(e)}</option>
              ))}
            </select>
          )}
        </FField>
        <FField label="Département">
          <input
            value={ACHATS_DEPARTMENT_LABEL}
            readOnly
            style={{ ...INPUT_STYLE, background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'not-allowed' }}
          />
        </FField>
        <FField label="Projet lié">
          {optionsLoading ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={14} className="spin" /> Chargement des projets...
            </div>
          ) : (
            <select
              value={form.project_id || ''}
              onChange={(e) => handleProjectChange(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="">Choisir un projet...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{projectOptionLabel(p)}</option>
              ))}
            </select>
          )}
        </FField>
      </FRow>
      <SectionTitle icon={<ClipboardList size={12} />}>Description</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <FField label="Description détaillée">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Détail du besoin, contexte..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ marginBottom: 20 }}><UploadField label="Pièces jointes" /></div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
          {initial ? 'Enregistrer' : 'Créer demande'}
        </button>
      </div>
    </form>
  );
}

function DetailDemande({ item, onBack, onEdit, onDelete, onValider, onRefuser }) {
  const projectDisplay = item.project_ref && item.project_name
    ? projectOptionLabel({ ref: item.project_ref, nom: item.project_name, client: '' })
    : item.projet_lie || '—';

  return (
    <div className="animate-fade-in">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>← Retour</button>
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{item.ref}</h1>
          <p className="page-subtitle">{item.titre}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          {item.statut === 'En attente' && <>
            <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onValider(item.id)}><CheckCircle size={13} /> Valider</button>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onRefuser(item.id)}><XCircle size={13} /> Refuser</button>
          </>}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onDelete(item.id)}><Trash2 size={13} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <SectionTitle icon={<ClipboardList size={13} />}>Détails</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['Titre', item.titre], ['Priorité', <span className={'badge ' + (BADGE_PRIORITE[item.priorite] || 'badge-grey')}>{item.priorite}</span>], ['Assigné', item.assigned_employee_name || item.assignes || '—'], ['Département', item.department || item.departement || ACHATS_DEPARTMENT_LABEL], ['Projet lié', projectDisplay], ['Date début', item.date_debut || '—'], ['Date limite', item.date_limite || '—']].map(([l, v]) => (
              <div key={l} style={{ paddingBottom: 10, borderBottom: '1px solid var(--surface-2)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
          {item.description && <div style={{ marginTop: 16, padding: '12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--text-2)' }}>{item.description}</div>}
        </div>
        <div className="card">
          <SectionTitle icon={<ClipboardList size={13} />}>Synthèse</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['Référence', item.ref], ['Statut', <span className={'badge ' + (BADGE_DEMANDE[item.statut] || 'badge-grey')}>{item.statut}</span>], ['Créé le', item.date_creation || '—']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)', fontSize: '0.83rem' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{l}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DemandesAchat() {
  const {
    records: items,
    projects,
    employees,
    loading,
    optionsLoading,
    saving,
    error,
    configured,
    reload,
    save,
    remove,
    updateStatus,
  } = usePurchaseRequests();

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPrio, setFilterPrio] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const handleSave = useCallback(async (data) => {
    const result = await save(data, editItem?.id);
    if (result.success) {
      setShowModal(false);
      setEditItem(null);
    }
  }, [editItem, save]);

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette demande ?')) return;
    const result = await remove(id);
    if (result.success) setDetailId(null);
  }

  const handleValider = (id) => updateStatus(id, 'Validée');
  const handleRefuser = (id) => updateStatus(id, 'Refusée');

  const filtered = items.filter((x) => {
    const q = search.toLowerCase();
    const assignLabel = x.assigned_employee_name || x.assignes || '';
    const projectLabel = x.project_ref || x.projet_lie || '';
    return (!q || x.ref?.toLowerCase().includes(q) || x.titre?.toLowerCase().includes(q) || assignLabel.toLowerCase().includes(q) || projectLabel.toLowerCase().includes(q))
      && (!filterStatut || x.statut === filterStatut)
      && (!filterPrio || x.priorite === filterPrio);
  });

  const ouvertes = items.filter((x) => ['En attente', 'En cours', 'Brouillon'].includes(x.statut)).length;
  const validees = items.filter((x) => x.statut === 'Validée').length;
  const urgentes = items.filter((x) => x.priorite === 'Urgente').length;
  const enAttente = items.filter((x) => x.statut === 'En attente').length;
  const cloturees = items.filter((x) => x.statut === 'Terminée').length;

  if (detailId) {
    const item = items.find((x) => x.id === detailId);
    if (!item) { setDetailId(null); return null; }
    return (
      <DetailDemande
        item={item}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditItem(item); setShowModal(true); setDetailId(null); }}
        onDelete={handleDelete}
        onValider={handleValider}
        onRefuser={handleRefuser}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">DEMANDES D'ACHAT</h1>
          <p className="page-subtitle">Gestion des demandes d'achat et validations internes.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters((f) => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={reload} disabled={loading}><RefreshCw size={14} /> Actualiser</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}><Plus size={15} /> Nouvelle demande</button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
          {!configured && (
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-3)' }}>
              Exécutez aussi <code>supabase/RUN_PURCHASE_REQUESTS.sql</code> dans le SQL Editor Supabase.
            </div>
          )}
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<ClipboardList size={17} />} label="Ouvertes" value={ouvertes} color="blue" />
        <KpiCard icon={<CheckCircle size={17} />} label="Validées" value={validees} color="green" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Urgentes" value={urgentes} color="red" />
        <KpiCard icon={<Clock size={17} />} label="En attente" value={enAttente} color="orange" />
        <KpiCard icon={<ClipboardList size={17} />} label="Clôturées" value={cloturees} color="grey" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf., titre, assigné, projet..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous statuts</option>
              {STATUTS_DEMANDE.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterPrio} onChange={(e) => setFilterPrio(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Toutes priorités</option>
              {PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterPrio(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une demande..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={20} className="spin" /> Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ClipboardList size={24} />} title="Aucune demande" sub="Créez votre première demande d'achat" action="Nouvelle demande" onAction={() => { setEditItem(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Référence</th><th>Titre</th><th>Priorité</th><th>Assigné</th><th>Projet</th><th>Date début</th><th>Date limite</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id}>
                    <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                    <td data-label="Titre"><div style={{ fontWeight: 600, fontSize: '0.87rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.titre}</div></td>
                    <td data-label="Priorité"><span className={'badge ' + (BADGE_PRIORITE[x.priorite] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{x.priorite}</span></td>
                    <td data-label="Assigné">{x.assigned_employee_name || x.assignes || '—'}</td>
                    <td data-label="Projet">{x.project_ref || x.projet_lie || '—'}</td>
                    <td data-label="Date début">{x.date_debut || '—'}</td>
                    <td data-label="Date limite">{x.date_limite || '—'}</td>
                    <td data-label="Statut"><span className={'badge ' + (BADGE_DEMANDE[x.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{x.statut}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                        {x.statut === 'En attente' && <button className="btn btn-ghost btn-sm" title="Valider" onClick={() => handleValider(x.id)} style={{ color: '#2E7D32' }}><CheckCircle size={13} /></button>}
                        {x.statut === 'En attente' && <button className="btn btn-ghost btn-sm" title="Refuser" onClick={() => handleRefuser(x.id)} style={{ color: 'var(--red)' }}><XCircle size={13} /></button>}
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
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
          employees={employees}
          optionsLoading={optionsLoading}
        />
      </Modal>
    </div>
  );
}
