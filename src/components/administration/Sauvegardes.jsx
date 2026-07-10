/**
 * Sauvegardes.jsx — Sauvegardes ERP CITYMO opérationnelles (Supabase + Railway).
 */
import { useState, useCallback, useEffect } from 'react';
import { HardDrive, Plus, Trash2, Download, RefreshCw, Search, Filter, CheckCircle, AlertTriangle, Server, Loader2, Cloud } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  TYPES_BACKUP, STATUTS_BACKUP, BADGE_BACKUP, BADGE_TYPE_BACKUP,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
} from './shared.jsx';
import {
  runBackup,
  downloadBackup,
  openDriveFolder,
  deleteBackup,
  restoreBackup,
} from '../../services/admin/backups';

const PLAN_OPTIONS = [
  { value: 'Manuelle', label: 'Manuelle (maintenant)' },
  { value: 'Quotidienne', label: 'Quotidienne' },
  { value: 'Hebdomadaire', label: 'Hebdomadaire' },
  { value: 'Mensuelle', label: 'Mensuelle' },
];

const EMPTY_FORM = {
  description: '',
  planification: 'Manuelle',
};

function BackupForm({ onSave, onCancel, saving }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function handleSubmit(ev) {
    ev.preventDefault();
    onSave({ ...form, type: 'Complète' });
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<HardDrive size={12} />}>Nouvelle sauvegarde complète</SectionTitle>
      <FRow>
        <FField label="Type">
          <input value="Sauvegarde complète (base + fichiers + config)" readOnly style={{ ...INPUT_STYLE, background: 'var(--surface-2)' }} />
        </FField>
        <FField label="Planification">
          <select value={form.planification} onChange={(e) => set('planification', e.target.value)} style={SELECT_STYLE}>
            {PLAN_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Notes">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Contexte de la sauvegarde..." style={TEXTAREA_STYLE} />
        </FField>
      </div>

      <div style={{ background: '#E3F2FD', border: '1px solid #90CAF9', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: '#1565C0' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Sauvegarde sécurisée</div>
        <div>
          {form.planification === 'Manuelle'
            ? 'Export complet : toutes les tables Supabase, tous les buckets Storage (hors sauvegardes), configuration ERP et copie Google Drive si activée.'
            : `Planification ${form.planification.toLowerCase()} — chaque exécution sera une sauvegarde complète.`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <HardDrive size={14} />}
          {saving ? 'Sauvegarde en cours…' : 'Lancer la sauvegarde'}
        </button>
      </div>
    </form>
  );
}

function RestoreModal({ backup, onClose, onConfirm, restoring }) {
  const [confirmText, setConfirmText] = useState('');

  return (
    <Modal open onClose={onClose} title="Restauration — confirmation requise" width={520}>
      <div style={{ fontSize: '0.86rem', color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>
        <p style={{ margin: '0 0 12px', color: '#C62828', fontWeight: 700 }}>
          ⚠️ Cette opération est irréversible et peut écraser des données existantes.
        </p>
        <p style={{ margin: '0 0 8px' }}>
          Sauvegarde : <strong>{backup.ref}</strong> ({backup.type})
        </p>
        <p style={{ margin: 0 }}>
          Une sauvegarde complète automatique sera créée avant toute restauration.
        </p>
      </div>
      <FField label='Tapez RESTAURER pour confirmer' required>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="RESTAURER"
          style={INPUT_STYLE}
          autoComplete="off"
        />
      </FField>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={restoring}>Annuler</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={confirmText !== 'RESTAURER' || restoring}
          onClick={() => onConfirm(confirmText)}
          style={{ background: '#C62828', borderColor: '#C62828' }}
        >
          {restoring ? 'Restauration…' : 'Restaurer'}
        </button>
      </div>
    </Modal>
  );
}

function InfraCard({ icon, title, value, description, color }) {
  const bgMap = { green: '#E8F5E9', orange: '#FFF3E0', red: 'var(--red-light)', blue: '#E3F2FD', grey: 'var(--surface-2)' };
  const clMap = { green: '#2E7D32', orange: '#E65100', red: 'var(--red)', blue: '#1565C0', grey: 'var(--text-3)' };
  const c = color || 'grey';
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: bgMap[c], display: 'flex', alignItems: 'center', justifyContent: 'center', color: clMap[c] }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: clMap[c] }}>{value}</div>
        </div>
      </div>
      {description && <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>{description}</div>}
    </div>
  );
}

export default function Sauvegardes({ backups = [], setBackups, reload, canManage }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const hasInProgress = backups.some((b) => b.statut === 'En cours');

  useEffect(() => {
    if (!hasInProgress || !reload) return undefined;
    const timer = setInterval(() => reload(), 15000);
    return () => clearInterval(timer);
  }, [hasInProgress, reload]);

  const handleSave = useCallback(async (data) => {
    if (!canManage) return;
    setSaving(true);
    try {
      const result = await runBackup(data);
      if (result.scheduled) {
        alert(result.message);
      } else if (result.async) {
        setBackups((prev) => [result, ...prev]);
        alert(result.message || 'Sauvegarde lancée en arrière-plan. Le statut passera à « Succès » une fois terminée.');
      } else {
        setBackups((prev) => [result, ...prev]);
      }
      setShowModal(false);
      reload?.();
    } catch (err) {
      alert(err.message || 'Échec de la sauvegarde. Vérifiez que le backend Railway est configuré.');
    } finally {
      setSaving(false);
    }
  }, [canManage, setBackups, reload]);

  async function handleDelete(id, ref) {
    if (!canManage || !window.confirm(`Supprimer définitivement la sauvegarde ${ref} ?\n\nLe fichier stocké sera également supprimé.`)) return;
    try {
      await deleteBackup(id);
      setBackups((prev) => prev.filter((x) => x.id !== id));
      reload?.();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDownload(backup) {
    if (backup.statut !== 'Succès') return;
    setDownloadingId(backup.id);
    try {
      await downloadBackup(backup.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleRestoreConfirm(confirmation) {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const result = await restoreBackup(restoreTarget.id, confirmation);
      alert(`Restauration terminée.\nSauvegarde préalable : ${result.preBackupRef || '—'}`);
      setRestoreTarget(null);
      reload?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setRestoring(false);
    }
  }

  const filtered = backups.filter((x) => {
    const q = search.toLowerCase();
    return (!q || x.ref.toLowerCase().includes(q) || (x.nom || '').toLowerCase().includes(q))
      && (!filterType || x.type === filterType)
      && (!filterStatut || x.statut === filterStatut);
  });

  const derniere = backups.find((b) => b.statut === 'Succès');
  const nbAuto = backups.filter((b) => b.planification && b.planification !== 'Manuelle').length;
  const totalSucces = backups.filter((b) => b.statut === 'Succès').length;
  const enCours = backups.filter((b) => b.statut === 'En cours').length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">SAUVEGARDES</h1>
          <p className="page-subtitle">Copie 1 : Supabase Storage · Copie 2 : Google Drive (citymo-erp-sauvegardes)</p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => reload?.()}><RefreshCw size={14} /> Actualiser</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}><Filter size={14} /> Filtres</button>
            <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={15} /> Nouvelle sauvegarde
            </button>
          </div>
        )}
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<HardDrive size={17} />} label="Dernière sauvegarde" value={derniere ? derniere.date.slice(0, 10) : '—'} color="grey" />
        <KpiCard icon={<CheckCircle size={17} />} label="Sauvegardes réussies" value={totalSucces} color="green" />
        <KpiCard icon={<RefreshCw size={17} />} label="Planifiées" value={nbAuto} color="blue" />
        <KpiCard icon={<Loader2 size={17} />} label="En cours" value={enCours} color="orange" />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Infrastructure
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <InfraCard icon={<Server size={16} />} title="Supabase Storage" value="citymo-backups" color="green" description="Copie principale — fichiers gzip horodatés" />
          <InfraCard icon={<Cloud size={16} />} title="Google Drive" value="citymo-erp-sauvegardes" color="blue" description="2e copie — dossier CITYMO APP Sauvegardes" />
          <InfraCard icon={<HardDrive size={16} />} title="Historique" value={`${backups.length} entrées`} color="grey" description="Journal + audit des opérations" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Référence, nom..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
          {showFilters && (
            <>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
                <option value="">Tous types</option>
                {TYPES_BACKUP.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
                <option value="">Tous statuts</option>
                {STATUTS_BACKUP.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<HardDrive size={24} />} title="Aucune sauvegarde" sub="Lancez une première sauvegarde" action={canManage ? 'Nouvelle sauvegarde' : undefined} onAction={canManage ? () => setShowModal(true) : undefined} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Planification</th>
                  <th>Taille</th>
                  <th>Statut</th>
                  <th>Drive</th>
                  <th>Créé par</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span>
                      {x.error_message && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 2 }}>{x.error_message}</div>
                      )}
                    </td>
                    <td data-label="Date" style={{ fontSize: '0.82rem' }}>{x.date}</td>
                    <td data-label="Type">
                      <span className={`badge ${BADGE_TYPE_BACKUP[x.type] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>{x.type}</span>
                    </td>
                    <td data-label="Planification" style={{ fontSize: '0.8rem' }}>{x.planification || 'Manuelle'}</td>
                    <td data-label="Taille" style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{x.taille || '—'}</td>
                    <td data-label="Statut">
                      <span className={`badge ${BADGE_BACKUP[x.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {x.statut === 'En cours' && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />}
                        {x.statut === 'Succès' && <CheckCircle size={10} />}
                        {x.statut === 'Erreur' && <AlertTriangle size={10} />}
                        {x.statut}
                      </span>
                      {x.statut === 'En cours' && x.description && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4, maxWidth: 240, lineHeight: 1.35 }}>
                          {x.description}
                        </div>
                      )}
                    </td>
                    <td data-label="Drive" style={{ fontSize: '0.78rem' }}>
                      {x.drive_synced ? (
                        <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>Sync OK</span>
                      ) : x.drive_sync_error ? (
                        <span className="badge badge-orange" style={{ fontSize: '0.68rem' }} title={x.drive_sync_error}>Drive ⚠</span>
                      ) : (
                        <span style={{ color: 'var(--text-3)' }}>—</span>
                      )}
                    </td>
                    <td data-label="Créé par" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.cree_par || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Télécharger"
                          disabled={x.statut !== 'Succès' || downloadingId === x.id}
                          onClick={() => handleDownload(x)}
                        >
                          {downloadingId === x.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Ouvrir sur Google Drive"
                          disabled={x.statut !== 'Succès'}
                          onClick={async () => {
                            try { await openDriveFolder(x.id); } catch (e) { alert(e.message); }
                          }}
                        >
                          <Cloud size={13} />
                        </button>
                        {canManage && (
                          <>
                            <button type="button" className="btn btn-secondary btn-sm" title="Restaurer" onClick={() => setRestoreTarget(x)} disabled={x.statut !== 'Succès'}>
                              <RefreshCw size={13} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id, x.ref)} style={{ color: 'var(--red)' }}>
                              <Trash2 size={13} />
                            </button>
                          </>
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

      <Modal open={showModal} onClose={() => !saving && setShowModal(false)} title="Nouvelle sauvegarde" width={560}>
        <BackupForm onSave={handleSave} onCancel={() => setShowModal(false)} saving={saving} />
      </Modal>

      {restoreTarget && (
        <RestoreModal
          backup={restoreTarget}
          onClose={() => !restoring && setRestoreTarget(null)}
          onConfirm={handleRestoreConfirm}
          restoring={restoring}
        />
      )}
    </div>
  );
}
