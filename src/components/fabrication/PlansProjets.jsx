import { useMemo, useState } from 'react';
import {
  AlertCircle, Download, Eye, FolderOpen, Layers, Loader2, Pencil, Plus, RefreshCw, Search,
} from 'lucide-react';
import { FAB_ATELIERS, FAB_LIBRARY_STATUTS, fabAtelierFullLabel } from '../../constants/fabrication';
import { FabEmpty, fmtDate } from './shared';
import { LibraryStatutBadge } from './LibraryPlanDetail';
import { downloadUrl } from './FilePreview';
import FabFilters from './FabFilters';

export default function PlansProjets({
  library, loading, error, onReload, canCreate, canEdit, onCreate, onEdit, onView,
}) {
  const [search, setSearch] = useState('');
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const [statut, setStatut] = useState('');

  const projets = useMemo(() => {
    const s = new Set();
    library.forEach((p) => { if (p.projet_nom) s.add(p.projet_nom); });
    return [...s].sort();
  }, [library]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((p) => {
      if (projet && p.projet_nom !== projet) return false;
      if (atelier && p.atelier !== atelier) return false;
      if (statut && p.statut !== statut) return false;
      if (q) {
        const blob = `${p.reference} ${p.nom} ${p.projet_nom} ${p.client_nom} ${p.designation}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [library, search, projet, atelier, statut]);

  const activeFilters = [projet, atelier, statut].filter(Boolean).length;

  return (
    <div className="fab-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Plans / Projets</h1>
          <p className="page-subtitle">Bibliothèque des plans techniques, réutilisables pour plusieurs productions</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {canCreate ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>
              <Plus size={14} /> Ajouter un plan
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 14, marginBottom: 16, color: 'var(--red)', display: 'flex', gap: 8 }}>
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      <FabFilters
        search={(
          <div className="fab-search">
            <Search size={15} className="fab-search-icon" aria-hidden />
            <input
              className="fab-search-input"
              placeholder="Recherche nom, projet, client, référence"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        activeCount={activeFilters}
      >
        <select className="fab-filter" value={projet} onChange={(e) => setProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="fab-filter" value={atelier} onChange={(e) => setAtelier(e.target.value)}>
          <option value="">Tous les ateliers</option>
          {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <select className="fab-filter" value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(FAB_LIBRARY_STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </FabFilters>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} /></div>
        ) : rows.length === 0 ? (
          <FabEmpty
            icon={<FolderOpen size={22} />}
            title="Aucun plan"
            sub="Ajoutez un plan ou transmettez-le depuis un projet."
          />
        ) : (
          <>
            <div className="table-wrap fab-table-desktop">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Nom du plan</th>
                    <th>Projet</th>
                    <th>Atelier</th>
                    <th>Date</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.reference}</strong></td>
                      <td>
                        {p.nom}
                        {p.source === 'projets' ? <div className="fab-card-meta">Transmis depuis Projets</div> : null}
                      </td>
                      <td>
                        {p.projet_nom || '—'}
                        {p.client_nom ? <div className="fab-card-meta">{p.client_nom}</div> : null}
                      </td>
                      <td>{p.atelier ? fabAtelierFullLabel(p.atelier, p.machine_type) : '—'}</td>
                      <td>{fmtDate(p.created_at)}</td>
                      <td><LibraryStatutBadge statut={p.statut} /></td>
                      <td><Actions plan={p} canEdit={canEdit} onEdit={onEdit} onView={onView} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fab-cards-mobile" style={{ padding: 12 }}>
              {rows.map((p) => (
                <div key={p.id} className="fab-card">
                  <div className="fab-card-title">{p.nom}</div>
                  <div className="fab-card-sub">{p.reference} · {p.projet_nom || '—'}</div>
                  {p.client_nom ? <div className="fab-card-meta">Client : {p.client_nom}</div> : null}
                  <div className="fab-card-meta">{p.atelier ? fabAtelierFullLabel(p.atelier, p.machine_type) : 'Atelier non défini'} · {fmtDate(p.created_at)}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <LibraryStatutBadge statut={p.statut} />
                    <span className="badge badge-grey">{(p.files || []).length} fichier{(p.files || []).length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="fab-card-actions">
                    <Actions plan={p} canEdit={canEdit} onEdit={onEdit} onView={onView} labels />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Actions({ plan, canEdit, onEdit, onView, labels = false }) {
  const first = (plan.files || [])[0];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-ghost btn-sm" title="Consulter" onClick={() => onView(plan)}>
        <Eye size={13} />{labels ? ' Consulter' : null}
      </button>
      {canEdit ? (
        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => onEdit(plan)}>
          <Pencil size={13} />{labels ? ' Modifier' : null}
        </button>
      ) : null}
      {first?.url ? (
        <a className="btn btn-ghost btn-sm" title="Télécharger" href={downloadUrl(first)} rel="noreferrer">
          <Download size={13} />{labels ? ' Télécharger' : null}
        </a>
      ) : null}
      <button type="button" className="btn btn-ghost btn-sm" title="Voir productions associées" onClick={() => onView(plan, 'productions')}>
        <Layers size={13} />{labels ? ` Productions (${(plan.productions || []).length})` : ` ${(plan.productions || []).length}`}
      </button>
    </div>
  );
}
