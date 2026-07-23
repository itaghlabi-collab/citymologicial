import { Users, Plus, Edit2, Trash2, Search, UserCheck, X, Upload, Download, Loader, FolderOpen, Eye } from 'lucide-react';
import { useState, useRef } from 'react';
import { DEPARTMENTS } from '../data/departments';
import { useEmployees } from '../hooks/useEmployees';
import { employeeToForm } from '../services/rh/employees';
import { generateEmployeePdf } from '../services/rh/employeePdf';
import EmployeeDocuments from './rh/EmployeeDocuments';
import EmployeeProfileView from './rh/EmployeeProfileView';

const EMPTY_EMP = {
  firstname: '',
  lastname: '',
  email: '',
  poste: '',
  department: '',
  department_id: null,
  telephone: '',
  date_embauche: '',
  date_naissance: '',
  type_contrat: '',
  contact_urgence: '',
  salaire: '',
  statut: 'Actif',
  adresse: '',
  numero_cin: '',
  cnss: '',
  rib: '',
  banque: '',
  situation_familiale: '',
  conges_jours_annuels: 0,
  conges_reliquat: 0,
  conges_annee_ref: new Date().getFullYear(),
  conges_jours_travailles: '',
};

const CONTRACT_TYPES = ['CDI', 'CDD', 'Stage', 'Alternance', 'Freelance', 'Autre'];

function fieldStyle(hasError) {
  return {
    padding: '9px 12px',
    border: '1.5px solid ' + (hasError ? 'var(--red)' : 'var(--border)'),
    borderRadius: 'var(--radius)',
    fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    background: '#fff',
  };
}

function fmtMAD(n) {
  const num = typeof n === 'string' ? parseFloat(n.replace(/\s/g, '')) : Number(n);
  if (isNaN(num)) return '0 MAD';
  return num.toLocaleString('fr-MA') + ' MAD';
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: bg,
        color: '#fff',
        padding: '12px 20px',
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
        fontSize: '0.88rem',
        fontWeight: 600,
        maxWidth: 340,
      }}
    >
      {toast.msg}
    </div>
  );
}

function validateForm(form) {
  const e = {};
  if (!form.firstname.trim()) e.firstname = 'Requis';
  if (!form.lastname.trim()) e.lastname = 'Requis';
  if (!form.email.trim() || !form.email.includes('@')) e.email = 'Email invalide';
  if (!form.poste.trim()) e.poste = 'Requis';
  if (!form.salaire || isNaN(Number(form.salaire))) e.salaire = 'Montant valide requis';
  return e;
}

export default function RH() {
  const {
    employees,
    filtered,
    stats,
    loading,
    saving,
    error,
    configured,
    search,
    setSearch,
    statutFilter,
    setStatutFilter,
    load,
    create,
    update,
    remove,
    importSeed,
  } = useEmployees();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_EMP);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [docsEmployee, setDocsEmployee] = useState(null);
  const toastTimer = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_EMP);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(emp) {
    setEditingId(emp.id);
    setForm(employeeToForm(emp));
    setErrors({});
    setShowModal(true);
  }

  function openView(emp) {
    setViewEmployee(emp);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_EMP);
    setErrors({});
  }

  async function handleDownloadPdf(emp) {
    setPdfLoadingId(emp.id);
    try {
      await generateEmployeePdf(emp);
      showToast('success', `Fiche PDF — ${emp.firstname} ${emp.lastname}`);
    } catch (err) {
      console.error('[CITYMO] PDF employé', err);
      showToast('error', 'Erreur lors de la génération PDF.');
    } finally {
      setPdfLoadingId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cet employé ?')) return;
    const result = await remove(id);
    if (result.success) {
      showToast('success', 'Employé supprimé avec succès.');
    } else {
      showToast('error', result.error);
    }
  }

  async function handleImportSeed() {
    if (!window.confirm('Importer les 25 employés de la liste CITYMO ? Les doublons (CIN / téléphone) seront ignorés.')) {
      return;
    }
    const result = await importSeed();
    if (result.success) {
      const errPart = result.errors?.length ? ` (${result.errors.length} erreur(s))` : '';
      const updPart = result.updated ? `, ${result.updated} mis à jour` : '';
      showToast(
        'success',
        `Import terminé : ${result.imported} importé(s)${updPart}, ${result.skipped} ignoré(s)${errPart}. Voir la console.`,
      );
    } else {
      showToast('error', result.error || 'Erreur import.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validateForm(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    const result = editingId
      ? await update(editingId, form)
      : await create(form);

    if (result.success) {
      const saved = result.data;
      if (saved) {
        setViewEmployee((prev) => (prev?.id === saved.id ? saved : prev));
      }
      showToast('success', editingId ? 'Employé modifié avec succès.' : 'Employé créé avec succès.');
      closeModal();
    } else {
      showToast('error', result.error);
    }
  }

  return (
    <div className="animate-fade-in rh-page">
      <Toast toast={toast} />

      <div className="page-header">
        <h1 className="page-title">Ressources Humaines</h1>
        <p className="page-subtitle">Gestion du personnel, congés et salaires</p>
      </div>

      {!configured && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#FFF3E0',
            border: '1px solid #FFB74D',
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            marginBottom: 16,
            fontSize: '0.85rem',
            color: '#E65100',
          }}
        >
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
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

      <div className="stat-grid rh-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Users size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : stats.total}</div>
            <div className="stat-label">Total employés</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green"><UserCheck size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : stats.actifs}</div>
            <div className="stat-label">Actifs</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange"><Users size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : stats.conge}</div>
            <div className="stat-label">En congé</div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Users size={16} /> Liste des employés
          </div>

          <div className="rh-m-toolbar">
            <div className="rh-m-toolbar-search">
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-3)',
                }}
              />
              <input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Rechercher un employé"
              />
            </div>

            <div className="rh-m-toolbar-row">
              <select
                className="rh-m-toolbar-select"
                value={statutFilter}
                onChange={(e) => setStatutFilter(e.target.value)}
                aria-label="Filtrer par statut"
              >
                <option value="">Tous statuts</option>
                <option value="Actif">Actif</option>
                <option value="Conge">Congé</option>
                <option value="Inactif">Inactif</option>
              </select>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleImportSeed}
                disabled={!configured || saving}
                title="Importer la liste employés (sans doublons)"
              >
                <Upload size={14} /> Importer
              </button>

              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate} disabled={!configured || saving}>
                <Plus size={14} /> Ajouter
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            {stats.total === 0 && !search && !statutFilter ? (
              <>
                <p style={{ marginBottom: 16 }}>Aucun employé en base. Importer la liste CITYMO (25 personnes) ?</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleImportSeed}
                  disabled={!configured || saving}
                >
                  <Upload size={16} /> Importer les 25 employés
                </button>
              </>
            ) : (
              'Aucun employé.'
            )}
          </div>
        ) : (
          <>
            <div className="rh-m-only rh-m-cards">
              {filtered.map((emp) => {
                const statutBadge =
                  emp.statut === 'Actif'
                    ? 'badge-green'
                    : emp.statut === 'Conge'
                      ? 'badge-orange'
                      : 'badge-grey';
                const tel = emp.telephone || '';
                const mail = emp.email || '';
                const contactLine = [tel, mail].filter(Boolean).join(' · ');
                const cinSalaire = [
                  emp.numero_cin ? `CIN ${emp.numero_cin}` : '',
                  emp.salaire != null && emp.salaire !== '' ? fmtMAD(emp.salaire) : '',
                ].filter(Boolean).join(' · ');

                return (
                  <article key={emp.id} className="rh-m-card">
                    <div className="rh-m-card-head">
                      <div className="rh-m-card-name">{emp.firstname} {emp.lastname}</div>
                      <span className={`badge ${statutBadge}`}>{emp.statut || 'Actif'}</span>
                    </div>
                    {emp.department ? (
                      <span className="badge badge-blue" style={{ marginBottom: 6, display: 'inline-block' }}>
                        {emp.department}
                      </span>
                    ) : null}
                    {emp.poste ? <div className="rh-m-card-poste">{emp.poste}</div> : null}
                    {contactLine ? <div className="rh-m-card-meta">{contactLine}</div> : null}
                    {cinSalaire ? <div className="rh-m-card-meta">{cinSalaire}</div> : null}
                    <div className="rh-m-card-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Voir la fiche employé"
                        aria-label="Voir fiche"
                        onClick={() => openView(emp)}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Gérer les documents"
                        aria-label="Documents"
                        onClick={() => setDocsEmployee(emp)}
                      >
                        <FolderOpen size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Modifier"
                        aria-label="Modifier"
                        onClick={() => openEdit(emp)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Télécharger fiche employé"
                        aria-label="Télécharger"
                        disabled={pdfLoadingId === emp.id}
                        onClick={() => handleDownloadPdf(emp)}
                      >
                        {pdfLoadingId === emp.id ? (
                          <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
                        ) : (
                          <Download size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Supprimer"
                        aria-label="Supprimer"
                        onClick={() => handleDelete(emp.id)}
                      >
                        <Trash2 size={16} style={{ color: 'var(--red)' }} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="table-wrap rh-desk-only">
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Email</th>
                    <th>Téléphone</th>
                    <th>CIN</th>
                    <th>Poste</th>
                    <th>Département</th>
                    <th>Salaire</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((emp) => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600 }}>
                        {emp.firstname} {emp.lastname}
                      </td>

                      <td style={{ fontSize: '0.85rem' }}>{emp.email || '—'}</td>

                      <td style={{ fontSize: '0.85rem' }}>{emp.telephone || '—'}</td>

                      <td style={{ fontFamily: 'var(--font-head)', fontSize: '0.85rem' }}>
                        {emp.numero_cin || '—'}
                      </td>

                      <td>{emp.poste || '—'}</td>

                      <td>
                        <span className="badge badge-blue">
                          {emp.department || '—'}
                        </span>
                      </td>

                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>
                        {fmtMAD(emp.salaire)}
                      </td>

                      <td>
                        <span
                          className={
                            'badge ' +
                            (emp.statut === 'Actif'
                              ? 'badge-green'
                              : emp.statut === 'Conge'
                                ? 'badge-orange'
                                : 'badge-grey')
                          }
                        >
                          {emp.statut || 'Actif'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px' }}
                            title="Télécharger fiche employé"
                            aria-label="Télécharger"
                            disabled={pdfLoadingId === emp.id}
                            onClick={() => handleDownloadPdf(emp)}
                          >
                            {pdfLoadingId === emp.id ? (
                              <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                            ) : (
                              <Download size={13} />
                            )}
                          </button>

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px' }}
                            title="Voir la fiche employé"
                            aria-label="Voir fiche"
                            onClick={() => openView(emp)}
                          >
                            <Eye size={13} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px' }}
                            title="Gérer les documents"
                            aria-label="Documents"
                            onClick={() => { setDocsEmployee(emp); }}
                          >
                            <FolderOpen size={13} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px' }}
                            title="Modifier"
                            aria-label="Modifier"
                            onClick={() => openEdit(emp)}
                          >
                            <Edit2 size={13} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px' }}
                            title="Supprimer"
                            aria-label="Supprimer"
                            onClick={() => handleDelete(emp.id)}
                          >
                            <Trash2 size={13} style={{ color: 'var(--red)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="rh-emp-modal-overlay">
          <div className="rh-emp-modal-box">
            <div className="rh-back-bar rh-m-only">
              <button type="button" className="rh-back-btn" onClick={closeModal} aria-label="Retour">
                ← Retour
              </button>
              <button type="button" className="rh-emp-modal-close" onClick={closeModal} aria-label="Fermer">
                <X size={20} />
              </button>
            </div>
            <div className="flex-between rh-emp-modal-header">
              <h2 className="rh-emp-modal-title">
                {editingId ? 'Modifier employé' : 'Nouvel employé'}
              </h2>
              <button type="button" className="rh-emp-modal-close rh-desk-only" onClick={closeModal} aria-label="Fermer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="rh-emp-modal-form">
              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>Prénom</label>
                  <input
                    type="text"
                    className="rh-emp-field"
                    placeholder="Ahmed"
                    value={form.firstname}
                    onChange={(e) => setForm((p) => ({ ...p, firstname: e.target.value }))}
                    style={fieldStyle(errors.firstname)}
                  />
                  {errors.firstname && <div className="rh-emp-field-error">{errors.firstname}</div>}
                </div>
                <div className="form-group">
                  <label>Nom</label>
                  <input
                    type="text"
                    className="rh-emp-field"
                    placeholder="Benali"
                    value={form.lastname}
                    onChange={(e) => setForm((p) => ({ ...p, lastname: e.target.value }))}
                    style={fieldStyle(errors.lastname)}
                  />
                  {errors.lastname && <div className="rh-emp-field-error">{errors.lastname}</div>}
                </div>
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="rh-emp-field"
                  placeholder="ahmed.benali@citymo.ma"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  style={fieldStyle(errors.email)}
                />
                {errors.email && <div className="rh-emp-field-error">{errors.email}</div>}
              </div>

              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>Poste</label>
                  <input
                    type="text"
                    className="rh-emp-field"
                    placeholder="Chef de chantier"
                    value={form.poste}
                    onChange={(e) => setForm((p) => ({ ...p, poste: e.target.value }))}
                    style={fieldStyle(errors.poste)}
                  />
                  {errors.poste && <div className="rh-emp-field-error">{errors.poste}</div>}
                </div>
                <div className="form-group">
                  <label>Département</label>
                  <select
                    className="rh-emp-field"
                    value={form.department}
                    onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                    style={fieldStyle(false)}
                  >
                    <option value="">Choisir un departement...</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.nom}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>Téléphone</label>
                  <input
                    type="tel"
                    className="rh-emp-field"
                    placeholder="+212 600 000 000"
                    value={form.telephone}
                    onChange={(e) => setForm((p) => ({ ...p, telephone: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
                <div className="form-group">
                  <label>Date d&apos;embauche</label>
                  <input
                    type="date"
                    className="rh-emp-field rh-emp-field-date"
                    value={form.date_embauche}
                    onChange={(e) => setForm((p) => ({ ...p, date_embauche: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
              </div>

              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>Jours de congé annuels</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="rh-emp-field"
                    value={form.conges_jours_annuels}
                    onChange={(e) => setForm((p) => ({ ...p, conges_jours_annuels: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
                <div className="form-group">
                  <label>Reliquat ancien</label>
                  <input
                    type="number"
                    step="0.5"
                    className="rh-emp-field"
                    value={form.conges_reliquat}
                    onChange={(e) => setForm((p) => ({ ...p, conges_reliquat: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
              </div>

              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>Année de référence congés</label>
                  <input
                    type="number"
                    className="rh-emp-field"
                    value={form.conges_annee_ref}
                    onChange={(e) => setForm((p) => ({ ...p, conges_annee_ref: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
                <div className="form-group">
                  <label>Jours travaillés (optionnel)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="rh-emp-field"
                    placeholder="Auto si vide"
                    value={form.conges_jours_travailles}
                    onChange={(e) => setForm((p) => ({ ...p, conges_jours_travailles: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
              </div>

              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>Date de naissance</label>
                  <input
                    type="date"
                    className="rh-emp-field rh-emp-field-date"
                    value={form.date_naissance}
                    onChange={(e) => setForm((p) => ({ ...p, date_naissance: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
                <div className="form-group">
                  <label>Type de contrat</label>
                  <select
                    className="rh-emp-field"
                    value={form.type_contrat}
                    onChange={(e) => setForm((p) => ({ ...p, type_contrat: e.target.value }))}
                    style={fieldStyle(false)}
                  >
                    <option value="">— Choisir —</option>
                    {CONTRACT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>Statut</label>
                  <select
                    className="rh-emp-field"
                    value={form.statut}
                    onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value }))}
                    style={fieldStyle(false)}
                  >
                    <option value="Actif">Actif</option>
                    <option value="Conge">Congé</option>
                    <option value="Inactif">Inactif</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Contact d&apos;urgence</label>
                  <input
                    type="text"
                    className="rh-emp-field"
                    placeholder="Nom — +212 600..."
                    value={form.contact_urgence}
                    onChange={(e) => setForm((p) => ({ ...p, contact_urgence: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Salaire mensuel (MAD)</label>
                <input
                  type="number"
                  className="rh-emp-field"
                  placeholder="15000"
                  min="0"
                  value={form.salaire}
                  onChange={(e) => setForm((p) => ({ ...p, salaire: e.target.value }))}
                  style={fieldStyle(errors.salaire)}
                />
                {errors.salaire && <div className="rh-emp-field-error">{errors.salaire}</div>}
              </div>

              <div className="form-group">
                <label>Adresse</label>
                <textarea
                  className="rh-emp-field"
                  rows={2}
                  placeholder="Adresse complète"
                  value={form.adresse}
                  onChange={(e) => setForm((p) => ({ ...p, adresse: e.target.value }))}
                  style={{ ...fieldStyle(false), resize: 'vertical' }}
                />
              </div>

              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>N° CIN</label>
                  <input
                    type="text"
                    className="rh-emp-field"
                    placeholder="BE123456"
                    value={form.numero_cin}
                    onChange={(e) => setForm((p) => ({ ...p, numero_cin: e.target.value.toUpperCase() }))}
                    style={fieldStyle(false)}
                  />
                </div>
                <div className="form-group">
                  <label>Situation familiale</label>
                  <input
                    type="text"
                    className="rh-emp-field"
                    placeholder="Célibataire, Marié..."
                    value={form.situation_familiale}
                    onChange={(e) => setForm((p) => ({ ...p, situation_familiale: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
              </div>

              <div className="rh-emp-modal-row">
                <div className="form-group">
                  <label>CNSS</label>
                  <input
                    type="text"
                    className="rh-emp-field"
                    value={form.cnss}
                    onChange={(e) => setForm((p) => ({ ...p, cnss: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
                <div className="form-group">
                  <label>Banque</label>
                  <input
                    type="text"
                    className="rh-emp-field"
                    placeholder="CIH, AWB..."
                    value={form.banque}
                    onChange={(e) => setForm((p) => ({ ...p, banque: e.target.value }))}
                    style={fieldStyle(false)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>RIB</label>
                <input
                  type="text"
                  className="rh-emp-field"
                  placeholder="Relevé d'identité bancaire"
                  value={form.rib}
                  onChange={(e) => setForm((p) => ({ ...p, rib: e.target.value }))}
                  style={fieldStyle(false)}
                />
              </div>

              <div className="rh-emp-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || !configured}>
                  {saving ? (
                    <span className="rh-emp-spinner" />
                  ) : editingId ? (
                    'Modifier'
                  ) : (
                    <>
                      <Plus size={14} /> Créer l&apos;employé
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewEmployee && (
        <EmployeeProfileView
          employee={employees.find((e) => e.id === viewEmployee.id) || viewEmployee}
          onClose={() => setViewEmployee(null)}
          onOpenDocuments={() => {
            const emp = employees.find((e) => e.id === viewEmployee.id) || viewEmployee;
            setViewEmployee(null);
            setDocsEmployee(emp);
          }}
        />
      )}

      {docsEmployee && (
        <EmployeeDocuments
          employee={employees.find((e) => e.id === docsEmployee.id) || docsEmployee}
          mode="manage"
          onClose={() => { setDocsEmployee(null); }}
        />
      )}
    </div>
  );
}
