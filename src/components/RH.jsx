import { Users, Plus, Edit2, Trash2, Search, UserCheck, X, Upload, Download, Loader, FolderOpen, Eye } from 'lucide-react';
import { useState, useRef } from 'react';
import { DEPARTMENTS } from '../data/departments';
import { useEmployees } from '../hooks/useEmployees';
import { generateEmployeePdf } from '../services/rh/employeePdf';
import EmployeeDocuments from './rh/EmployeeDocuments';

const EMPTY_EMP = {
  firstname: '',
  lastname: '',
  email: '',
  poste: '',
  department: '',
  telephone: '',
  date_embauche: '',
  salaire: '',
  statut: 'Actif', /* conservé en base, non affiché dans le formulaire */
  adresse: '',
  numero_cin: '',
  cnss: '',
  rib: '',
  banque: '',
  situation_familiale: '',
};

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
  const [docsEmployee, setDocsEmployee] = useState(null);
  const [docsMode, setDocsMode] = useState('manage');
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
    setForm({
      firstname: emp.firstname || '',
      lastname: emp.lastname || '',
      email: emp.email || '',
      poste: emp.poste || '',
      department: emp.department || '',
      telephone: emp.telephone || '',
      date_embauche: emp.date_embauche || '',
      salaire: emp.salaire ?? '',
      statut: emp.statut || 'Actif',
      adresse: emp.adresse || '',
      numero_cin: emp.numero_cin || '',
      cnss: emp.cnss || '',
      rib: emp.rib || '',
      banque: emp.banque || '',
      situation_familiale: emp.situation_familiale || '',
    });
    setErrors({});
    setShowModal(true);
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
      showToast('success', editingId ? 'Employé modifié avec succès.' : 'Employé créé avec succès.');
      closeModal();
    } else {
      showToast('error', result.error);
    }
  }

  return (
    <div className="animate-fade-in">
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

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative' }}>
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
                style={{
                  paddingLeft: 30,
                  paddingRight: 12,
                  paddingTop: 8,
                  paddingBottom: 8,
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              value={statutFilter}
              onChange={(e) => setStatutFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-body)',
                background: '#fff',
                outline: 'none',
              }}
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
              <Upload size={14} /> Importer liste
            </button>

            <button className="btn btn-primary btn-sm" onClick={openCreate} disabled={!configured || saving}>
              <Plus size={14} /> Ajouter
            </button>
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
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
                          title="Dossier administratif"
                          onClick={() => { setDocsMode('view'); setDocsEmployee(emp); }}
                        >
                          <Eye size={13} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '4px 8px' }}
                          title="Gérer les documents"
                          onClick={() => { setDocsMode('manage'); setDocsEmployee(emp); }}
                        >
                          <FolderOpen size={13} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '4px 8px' }}
                          title="Modifier"
                          onClick={() => openEdit(emp)}
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '4px 8px' }}
                          title="Supprimer"
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
        )}
      </div>

      {showModal && (
        <div className="rh-emp-modal-overlay">
          <div className="rh-emp-modal-box">
            <div className="flex-between rh-emp-modal-header">
              <h2 className="rh-emp-modal-title">
                {editingId ? 'Modifier employé' : 'Nouvel employé'}
              </h2>
              <button type="button" className="rh-emp-modal-close" onClick={closeModal} aria-label="Fermer">
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

      {docsEmployee && (
        <EmployeeDocuments
          employee={docsEmployee}
          mode={docsMode}
          onClose={() => { setDocsEmployee(null); setDocsMode('manage'); }}
        />
      )}
    </div>
  );
}
