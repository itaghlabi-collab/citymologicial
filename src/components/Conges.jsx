import { CalendarOff, Plus, CheckCircle, XCircle, Clock, X, Upload, User, Edit2, Trash2, FileDown } from 'lucide-react';
import { useState, useRef } from 'react';
import { useLeaves } from '../hooks/useLeaves';
import { employeeFullName } from '../services/rh/leaves';
import { generateLeaveRequestPdf } from '../services/rh/leaveRequestPdf';

const CONGE_TYPES = [
  'Conge annuel',
  'Conge maladie',
  'Conge maternite / paternite',
  'Conge sans solde',
  'Conge exceptionnel',
  'RTT',
];

const STATUS_BADGE = {
  'En attente': 'badge-orange',
  'Approuve': 'badge-green',
  'Refuse': 'badge-red',
};

const STATUS_LABEL = {
  'En attente': 'En attente',
  'Approuve': 'Approuve',
  'Refuse': 'Refuse',
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

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Count working days between two date strings (excluding Sundays only) */
function countWorkingDays(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (cur.getDay() !== 0) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Return the next working day after a date string */
function nextWorkingDay(dateStr) {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return formatLocalDate(d);
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
    leaves,
    permissions,
  } = useLeaves();

  const { superAdmin, canApproveRefuse, canEdit, canDelete } = permissions;

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [existingFichierUrl, setExistingFichierUrl] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const toastRef = useRef(null);
  const fileRef = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function openModal() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      employee_id: superAdmin ? '' : (myEmployee?.id || ''),
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
    if (superAdmin) return form;
    return { ...form, employee_id: myEmployee?.id || form.employee_id };
  }

  function validate() {
    const submitForm = resolveSubmitForm();
    const e = {};
    if (superAdmin && !submitForm.employee_id) e.employee_id = 'Requis';
    if (!superAdmin && !myEmployee) {
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
    const jours = countWorkingDays(submitForm.dateDebut, submitForm.dateFin);
    const dateRetour = nextWorkingDay(submitForm.dateFin);
    const fichierUrl = submitForm.fichier
      ? submitForm.fichier.name
      : (editingId ? existingFichierUrl : null);

    const payload = { jours, dateRetour, fichierUrl };

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
    const result = await approve(id);
    showToast(result.success ? 'success' : 'error', result.success ? 'Demande approuvee.' : (result.error || 'Erreur.'));
  }

  async function handleRefuse(id) {
    const result = await refuse(id);
    showToast(result.success ? 'error' : 'error', result.success ? 'Demande refusee.' : (result.error || 'Erreur.'));
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

  const jours = countWorkingDays(form.dateDebut, form.dateFin);
  const dateRetour = nextWorkingDay(form.dateFin);
  const canOpenModal = configured && (superAdmin || myEmployee);

  return (
    <div className="animate-fade-in">
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

      {configured && !superAdmin && !myEmployee && !loading && (
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
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 16 }}>
        {[
          { key: 'all', label: 'Toutes', icon: CalendarOff, color: 'blue' },
          { key: 'pending', label: 'En attente', icon: Clock, color: 'orange' },
          { key: 'approved', label: 'Approuvees', icon: CheckCircle, color: 'green' },
          { key: 'rejected', label: 'Refusees', icon: XCircle, color: 'red' },
        ].map(({ key, label, icon: Icon, color }) => (
          <div
            key={key}
            className="stat-card"
            style={{ cursor: 'pointer', border: filter === key ? '2px solid var(--red)' : '1px solid var(--border)', transition: 'border 0.15s' }}
            onClick={() => setFilter(key)}
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
          <div className="table-wrap">
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
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 540, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {editingId ? 'Modifier demande de conge' : 'Nouvelle demande de conge'}
              </h2>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
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
                {superAdmin ? (
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

              {/* Auto-calculated info */}
              {form.dateDebut && form.dateFin && jours > 0 && (
                <div style={{ background: '#F3F4F6', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Jours demandes (hors dimanches)</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--red)' }}>{jours} jour{jours > 1 ? 's' : ''}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Date de retour au travail</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{dateRetour}</div>
                  </div>
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

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
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
