import { CalendarOff, Plus, CheckCircle, XCircle, Clock, X, Upload, User, Edit2, Trash2, FileDown } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useLeaves } from '../hooks/useLeaves';
import { employeeFullName } from '../services/rh/leaves';
import { generateLeaveRequestPdf } from '../services/rh/leaveRequestPdf';
import {
  countWorkingDays as countWorkingDaysAsync,
  nextWorkingDay as nextWorkingDayAsync,
} from '../services/rh/workingDays';
import {
  computeLeaveRightsPreview,
  leaveTypeConsumesBalance,
} from '../services/rh/leaveBalance';

const CONGE_TYPES = [
  'Conge annuel',
  'Conge de recuperation',
  'Conge exceptionnel',
  'Conge maladie',
  'Conge sans solde',
  'Conge maternite / paternite',
  'RTT',
  'Autre',
];

const STATUS_BADGE = {
  'En attente': 'badge-orange',
  'Approuve': 'badge-green',
  'Refuse': 'badge-red',
  'Annule': 'badge-grey',
};

const STATUS_LABEL = {
  'En attente': 'En attente',
  'Approuve': 'Approuve',
  'Refuse': 'Refuse',
  'Annule': 'Annule',
};

const INPUT_S = (err) => ({
  padding: '9px 12px',
  width: '100%',
  outline: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: '0.9rem',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
  borderRadius: 'var(--radius)',
  background: '#fff',
  boxSizing: 'border-box',
});

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340, animation: 'fadeUp 0.3s ease' }}>
      {toast.msg}
    </div>
  );
}

const EMPTY_FORM = {
  employee_id: '',
  type: 'Conge annuel',
  dateDebut: '',
  dateFin: '',
  raison: '',
  fichier: null,
};

export default function Conges() {
  const {
    employees,
    myEmployee,
    filtered,
    counts,
    loading,
    saving,
    error,
    configured,
    filter,
    setFilter,
    load,
    create,
    update,
    remove,
    approve,
    refuse,
    cancelApproved,
    leaves,
    permissions,
  } = useLeaves();

  const { canManageLeaves, canApproveRefuse, canOverrideBalance, canEdit, canDelete } = permissions;

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [existingFichierUrl, setExistingFichierUrl] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [jours, setJours] = useState(0);
  const [dateRetour, setDateRetour] = useState('');
  const [rights, setRights] = useState(null);
  const toastRef = useRef(null);
  const fileRef = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  const selectedEmployee = useMemo(() => {
    const id = form.employee_id || (!canManageLeaves ? myEmployee?.id : '');
    return employees.find((e) => e.id === id) || myEmployee || null;
  }, [form.employee_id, employees, myEmployee, canManageLeaves]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!form.dateDebut || !form.dateFin || form.dateFin < form.dateDebut) {
        if (!cancelled) {
          setJours(0);
          setDateRetour('');
          setRights(null);
        }
        return;
      }
      const wd = await countWorkingDaysAsync(form.dateDebut, form.dateFin);
      const retour = await nextWorkingDayAsync(form.dateFin);
      if (cancelled) return;
      setJours(wd.days);
      setDateRetour(retour);
      if (selectedEmployee) {
        const preview = await computeLeaveRightsPreview({
          employee: selectedEmployee,
          type: form.type,
          dateDebut: form.dateDebut,
          dateFin: form.dateFin,
          joursOverride: wd.days,
          excludeLeaveId: editingId,
        });
        if (!cancelled) setRights(preview);
      } else if (!cancelled) {
        setRights(null);
      }
    })();
    return () => { cancelled = true; };
  }, [form.dateDebut, form.dateFin, form.type, selectedEmployee, editingId]);

  function openModal() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      employee_id: canManageLeaves ? '' : (myEmployee?.id || ''),
    });
    setExistingFichierUrl(null);
    setErrors({});
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(r) {
    if (!canEdit(r)) return;
    setEditingId(r.id);
    setForm({
      employee_id: r.employee_id || '',
      type: r.type || 'Conge annuel',
      dateDebut: r.date_debut || r.dateDebut || '',
      dateFin: r.date_fin || r.dateFin || '',
      raison: r.raison || '',
      fichier: null,
    });
    setExistingFichierUrl(r.fichier_url || null);
    setErrors({});
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setExistingFichierUrl(null);
    setFormError(null);
  }

  function resolveSubmitForm() {
    if (canManageLeaves) return form;
    return { ...form, employee_id: myEmployee?.id || form.employee_id };
  }

  function validate() {
    const submitForm = resolveSubmitForm();
    const e = {};
    if (canManageLeaves && !submitForm.employee_id) e.employee_id = 'Requis';
    if (!canManageLeaves && !myEmployee) {
      e.employee_id = 'Profil employe introuvable — contactez les RH';
    }
    if (!submitForm.dateDebut) e.dateDebut = 'Requis';
    if (!submitForm.dateFin) e.dateFin = 'Requis';
    if (submitForm.dateFin && submitForm.dateDebut && submitForm.dateFin < submitForm.dateDebut) {
      e.dateFin = 'Date fin avant debut';
    }
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      showToast('error', 'Veuillez corriger les champs obligatoires.');
      return;
    }

    const submitForm = resolveSubmitForm();
    const wd = await countWorkingDaysAsync(submitForm.dateDebut, submitForm.dateFin);
    const joursCalc = wd.days;
    const dateRetourCalc = await nextWorkingDayAsync(submitForm.dateFin);
    const fichierUrl = submitForm.fichier
      ? submitForm.fichier.name
      : (editingId ? existingFichierUrl : null);

    const payload = { jours: joursCalc, dateRetour: dateRetourCalc, fichierUrl };

    let result;
    try {
      if (editingId) {
        const row = leaves.find((l) => l.id === editingId);
        result = await update(editingId, submitForm, {
          ...payload,
          statut: row?.statut || 'En attente',
        });
      } else {
        result = await create(submitForm, payload);
      }
    } catch (err) {
      console.error('[CITYMO] Conges handleSubmit', err);
      const msg = err?.message || 'Erreur inattendue.';
      setFormError(msg);
      showToast('error', msg);
      return;
    }

    if (result?.success) {
      showToast('success', editingId ? 'Demande modifiee avec succes.' : 'Demande de conge soumise avec succes !');
      closeModal();
    } else {
      const msg = result?.error || 'Erreur enregistrement.';
      setFormError(msg);
      showToast('error', msg);
      console.error('[CITYMO] Conges save failed', msg);
    }
  }

  async function handleApprove(id) {
    let result = await approve(id);
    if (!result.success && result.code === 'BALANCE_EXCEEDED') {
      if (!canOverrideBalance) {
        showToast('error', result.error);
        return;
      }
      const ok = window.confirm(
        `${result.error}\n\nDéroger et approuver quand même ? (permission RH / super admin)`,
      );
      if (!ok) return;
      result = await approve(id, { override: true, overrideReason: 'Dérogation solde insuffisant' });
    }
    showToast(result.success ? 'success' : 'error', result.success ? 'Demande approuvee.' : (result.error || 'Erreur.'));
  }

  async function handleRefuse(id) {
    const result = await refuse(id);
    showToast(result.success ? 'success' : 'error', result.success ? 'Demande refusee.' : (result.error || 'Erreur.'));
  }

  async function handleCancelApproved(id) {
    if (!window.confirm('Annuler cette demande approuvée et restituer les jours au solde ?')) return;
    const result = await cancelApproved(id);
    showToast(result.success ? 'success' : 'error', result.success ? 'Demande annulee — jours restitues.' : (result.error || 'Erreur.'));
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette demande de conge ?')) return;
    const result = await remove(id);
    showToast(result.success ? 'success' : 'error', result.success ? 'Demande supprimee.' : (result.error || 'Erreur.'));
  }

  async function handleDownloadPdf(row) {
    setPdfLoadingId(row.id);
    try {
      const emp = employees.find((e) => e.id === row.employee_id) || row.employees;
      await generateLeaveRequestPdf(row, emp);
      showToast('success', 'PDF telecharge.');
    } catch (err) {
      console.error('[CITYMO] Conges PDF', err);
      showToast('error', err?.message || 'Erreur generation PDF.');
    } finally {
      setPdfLoadingId(null);
    }
  }

  const canOpenModal = configured && (canManageLeaves || myEmployee);

  return (
    <div className="animate-fade-in rh-page">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Demandes de conge</h1>
          <p className="page-subtitle">Gestion des absences et conges du personnel</p>
        </div>
        <button className="btn btn-primary" onClick={openModal} disabled={!canOpenModal || saving}>
          <Plus size={15} /> Nouvelle demande
        </button>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {configured && !canManageLeaves && !myEmployee && !loading && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Aucun employe RH lie a votre email. Contactez les RH pour creer une demande.
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: '#FFEBEE',
            border: '1px solid #EF9A9A',
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            marginBottom: 16,
            fontSize: '0.85rem',
            color: '#C62828',
          }}
        >
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
            Réessayer
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid rh-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 16 }}>
        {[
          { key: 'all', label: 'Toutes', icon: CalendarOff, color: 'blue' },
          { key: 'pending', label: 'En attente', icon: Clock, color: 'orange' },
          { key: 'approved', label: 'Approuvees', icon: CheckCircle, color: 'green' },
          { key: 'rejected', label: 'Refusees', icon: XCircle, color: 'red' },
        ].map(({ key, label, icon: Icon, color }) => (
          <div
            key={key}
            className="stat-card"
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer', border: filter === key ? '2px solid var(--red)' : '1px solid var(--border)', transition: 'border 0.15s' }}
            onClick={() => setFilter(key)}
            onKeyDown={(e) => e.key === 'Enter' && setFilter(key)}
          >
            <div className={"stat-icon " + color}><Icon size={18} /></div>
            <div className="stat-body">
              <div className="stat-value" style={{ color: filter === key ? 'var(--red)' : 'var(--text)' }}>{loading ? '—' : counts[key]}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>
          <CalendarOff size={16} /> {filter === 'all' ? 'Toutes les demandes' : filter === 'pending' ? 'En attente' : filter === 'approved' ? 'Approuvees' : 'Refusees'}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            {leaves.length === 0 ? 'Aucune demande de conge. Soumettez la premiere.' : 'Aucune demande dans cette categorie.'}
          </div>
        ) : (
          <>
            <div className="rh-m-only rh-m-cards">
              {filtered.map((r, i) => {
                const statLabel = STATUS_LABEL[r._statut] || r._statut;
                const statBadge = STATUS_BADGE[r._statut] || 'badge-grey';
                const isPending = r._statut === 'En attente';
                const showEdit = canEdit(r);
                const showDelete = canDelete(r);
                return (
                  <article key={r.id || i} className="rh-m-card">
                    <div className="rh-m-card-head">
                      <div className="rh-m-card-name">{r.employe || '—'}</div>
                      <span className={`badge ${statBadge}`}>{statLabel}</span>
                    </div>
                    {r.type ? <div className="rh-m-card-poste">{r.type}</div> : null}
                    <div className="rh-m-card-grid">
                      {r.dateDebut ? (
                        <div className="rh-m-card-kv">
                          <div className="rh-m-card-kv-label">Du</div>
                          <div className="rh-m-card-kv-value">{r.dateDebut}</div>
                        </div>
                      ) : null}
                      {r.dateFin ? (
                        <div className="rh-m-card-kv">
                          <div className="rh-m-card-kv-label">Au</div>
                          <div className="rh-m-card-kv-value">{r.dateFin}</div>
                        </div>
                      ) : null}
                      {r.dateRetour ? (
                        <div className="rh-m-card-kv">
                          <div className="rh-m-card-kv-label">Retour</div>
                          <div className="rh-m-card-kv-value">{r.dateRetour}</div>
                        </div>
                      ) : null}
                      {r.jours != null ? (
                        <div className="rh-m-card-kv">
                          <div className="rh-m-card-kv-label">Durée</div>
                          <div className="rh-m-card-kv-value" style={{ color: 'var(--red)' }}>{r.jours} j</div>
                        </div>
                      ) : null}
                    </div>
                    {r.raison ? <div className="rh-m-card-meta">{r.raison}</div> : null}
                    <div className="rh-m-card-actions">
                      {isPending && canApproveRefuse && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm rh-m-btn-text"
                            style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none' }}
                            onClick={() => handleApprove(r.id)}
                            disabled={saving}
                            aria-label="Approuver"
                          >
                            Approuver
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm rh-m-btn-text"
                            style={{ background: '#FFEBEE', color: 'var(--red)', border: 'none' }}
                            onClick={() => handleRefuse(r.id)}
                            disabled={saving}
                            aria-label="Refuser"
                          >
                            Refuser
                          </button>
                        </>
                      )}
                      {r._statut === 'Approuve' && canApproveRefuse && (
                        <button
                          type="button"
                          className="btn btn-sm rh-m-btn-text"
                          style={{ background: '#FFF3E0', color: '#E65100', border: 'none' }}
                          onClick={() => handleCancelApproved(r.id)}
                          disabled={saving}
                          aria-label="Annuler et restituer"
                        >
                          Annuler
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Telecharger PDF"
                        aria-label="Voir justificatif"
                        onClick={() => handleDownloadPdf(r)}
                        disabled={saving || pdfLoadingId === r.id}
                      >
                        <FileDown size={16} />
                      </button>
                      {showEdit && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Modifier"
                          aria-label="Modifier"
                          onClick={() => openEdit(r)}
                          disabled={saving}
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {showDelete && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Supprimer"
                          aria-label="Supprimer"
                          onClick={() => handleDelete(r.id)}
                          disabled={saving}
                        >
                          <Trash2 size={16} style={{ color: 'var(--red)' }} />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="table-wrap rh-desk-only">
              <table>
                <thead>
                  <tr>
                    <th>Employe</th>
                    <th>Type</th>
                    <th>Du</th>
                    <th>Au</th>
                    <th>Retour</th>
                    <th>Jours</th>
                    <th>Raison</th>
                    <th>Justificatif</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const statLabel = STATUS_LABEL[r._statut] || r._statut;
                    const statBadge = STATUS_BADGE[r._statut] || 'badge-grey';
                    const isPending = r._statut === 'En attente';
                    const showEdit = canEdit(r);
                    const showDelete = canDelete(r);
                    return (
                      <tr key={r.id || i}>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <User size={13} style={{ color: 'var(--red)' }} />
                            </div>
                            {r.employe || '-'}
                          </div>
                        </td>
                        <td><span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{r.type || '-'}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.dateDebut || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.dateFin || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{r.dateRetour || '-'}</td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>
                            {r.jours != null ? r.jours : '-'}
                          </span>
                        </td>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: '0.82rem' }}>
                          {r.raison || <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td>
                          {r.fichier
                            ? <span style={{ fontSize: '0.75rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 3 }}><Upload size={11} /> {r.fichier}</span>
                            : <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>
                          }
                        </td>
                        <td><span className={"badge " + statBadge}>{statLabel}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            {isPending && canApproveRefuse && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600 }}
                                  onClick={() => handleApprove(r.id)}
                                  disabled={saving}
                                >
                                  Approuver
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: '#FFEBEE', color: 'var(--red)', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600 }}
                                  onClick={() => handleRefuse(r.id)}
                                  disabled={saving}
                                >
                                  Refuser
                                </button>
                              </>
                            )}
                            {r._statut === 'Approuve' && canApproveRefuse && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{ background: '#FFF3E0', color: '#E65100', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600 }}
                                onClick={() => handleCancelApproved(r.id)}
                                disabled={saving}
                                title="Annuler et restituer les jours"
                              >
                                Annuler
                              </button>
                            )}
                            <button
                              type="button"
                              title="Telecharger PDF"
                              onClick={() => handleDownloadPdf(r)}
                              disabled={saving || pdfLoadingId === r.id}
                              style={{ background: 'none', border: 'none', cursor: pdfLoadingId === r.id ? 'wait' : 'pointer', color: 'var(--red)', padding: 4, opacity: pdfLoadingId === r.id ? 0.5 : 1 }}
                            >
                              <FileDown size={15} />
                            </button>
                            {showEdit && (
                              <button
                                type="button"
                                title="Modifier"
                                onClick={() => openEdit(r)}
                                disabled={saving}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
                              >
                                <Edit2 size={15} />
                              </button>
                            )}
                            {showDelete && (
                              <button
                                type="button"
                                title="Supprimer"
                                onClick={() => handleDelete(r.id)}
                                disabled={saving}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="rh-leave-modal-overlay">
          <div className="rh-leave-modal-box">
            <div className="rh-back-bar rh-m-only">
              <button type="button" className="rh-back-btn" onClick={closeModal} aria-label="Retour">
                ← Retour
              </button>
              <button type="button" className="rh-emp-modal-close" onClick={closeModal} aria-label="Fermer">
                <X size={20} />
              </button>
            </div>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.03em', margin: 0 }}>
                {editingId ? 'Modifier demande de conge' : 'Nouvelle demande de conge'}
              </h2>
              <button type="button" className="rh-desk-close" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }} aria-label="Fermer">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{ background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', color: '#C62828' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Employe */}
              <div className="form-group">
                <label>Employe</label>
                {canManageLeaves ? (
                  <select value={form.employee_id} onChange={e => setF('employee_id', e.target.value)} style={INPUT_S(errors.employee_id)}>
                    <option value="">Selectionner un employe...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{employeeFullName(emp)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    readOnly
                    value={myEmployee ? employeeFullName(myEmployee) : '—'}
                    style={{ ...INPUT_S(errors.employee_id), background: '#F3F4F6', color: 'var(--text-2)' }}
                  />
                )}
                {errors.employee_id && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.employee_id}</div>}
              </div>

              {/* Type de conge */}
              <div className="form-group">
                <label>Type de conge</label>
                <select value={form.type} onChange={e => setF('type', e.target.value)} style={INPUT_S(false)}>
                  {CONGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Dates */}
              <div className="rh-leave-modal-dates">
                <div className="form-group">
                  <label>Date de debut</label>
                  <input
                    type="date"
                    value={form.dateDebut}
                    onChange={e => setF('dateDebut', e.target.value)}
                    style={INPUT_S(errors.dateDebut)}
                  />
                  {errors.dateDebut && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.dateDebut}</div>}
                </div>
                <div className="form-group">
                  <label>Date de fin</label>
                  <input
                    type="date"
                    value={form.dateFin}
                    min={form.dateDebut || undefined}
                    onChange={e => setF('dateFin', e.target.value)}
                    style={INPUT_S(errors.dateFin)}
                  />
                  {errors.dateFin && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.dateFin}</div>}
                </div>
              </div>

              {/* Auto-calculated info + calcul des droits */}
              {form.dateDebut && form.dateFin && jours > 0 && (
                <div style={{ background: '#F3F4F6', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Jours demandes</div>
                      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--red)' }}>{jours} jour{jours > 1 ? 's' : ''}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Date de retour au travail</div>
                      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{dateRetour}</div>
                    </div>
                  </div>
                  {rights && leaveTypeConsumesBalance(form.type) && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        Calcul des droits
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, fontSize: '0.8rem' }}>
                        <div><span style={{ color: 'var(--text-3)' }}>Jours travaillés</span><div style={{ fontWeight: 700 }}>{rights.joursTravailles}</div></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Jours fériés</span><div style={{ fontWeight: 700 }}>{rights.joursFeries}</div></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Reliquat ancien</span><div style={{ fontWeight: 700 }}>{rights.reliquatAncien}</div></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Droit au congé</span><div style={{ fontWeight: 700 }}>{rights.droitAcquis}</div></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Jours consommés</span><div style={{ fontWeight: 700 }}>{rights.joursConsommes}</div></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Solde disponible</span><div style={{ fontWeight: 700 }}>{rights.soldeAvant}</div></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Jours demandés</span><div style={{ fontWeight: 700 }}>{rights.joursDemandes}</div></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Reliquat estimé</span><div style={{ fontWeight: 700, color: rights.depasseSolde ? 'var(--red)' : 'var(--text)' }}>{rights.reliquatNouveau}</div></div>
                      </div>
                      {rights.depasseSolde && (
                        <div style={{ marginTop: 8, color: '#C62828', fontSize: '0.8rem', fontWeight: 600 }}>
                          Attention : la demande dépasse le solde disponible.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Raison */}
              <div className="form-group">
                <label>Raison (optionnel)</label>
                <textarea
                  rows={2}
                  placeholder="Motif de la demande..."
                  value={form.raison}
                  onChange={e => setF('raison', e.target.value)}
                  style={{ ...INPUT_S(false), resize: 'vertical' }}
                />
              </div>

              {/* Justificatif */}
              <div className="form-group">
                <label>Justificatif (PDF ou image, optionnel)</label>
                <div
                  onClick={() => fileRef.current && fileRef.current.click()}
                  style={{ border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)', fontSize: '0.875rem', background: '#FAFAFA', transition: 'border-color 0.15s' }}
                >
                  <Upload size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
                  {form.fichier
                    ? <span style={{ color: 'var(--text)', fontWeight: 600 }}>{form.fichier.name}</span>
                    : existingFichierUrl
                      ? <span style={{ color: 'var(--text)', fontWeight: 600 }}>{existingFichierUrl}</span>
                      : <span>Cliquer pour joindre un fichier...</span>
                  }
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: 'none' }}
                  onChange={e => setF('fichier', e.target.files[0] || null)}
                />
              </div>

              <div className="rh-leave-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Plus size={14} /> {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Soumettre la demande'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
