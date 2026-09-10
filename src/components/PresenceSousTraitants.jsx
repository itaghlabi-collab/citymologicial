/**
 * PresenceSousTraitants.jsx — Pointage journalier sous-traitants (isolé)
 * Ne touche pas Présence ouvriers ni Situation / paiements.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, CheckCircle, XCircle, Users, Percent, Search, Loader2,
  RefreshCw, Trash2, Edit2, X, Filter,
} from 'lucide-react';
import { useSubcontractorAttendance } from '../hooks/useSubcontractorAttendance';
import { SUB_ATT_STATUTS } from '../services/rh/subcontractorAttendance';

const INPUT = {
  width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.84rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
};
const SELECT = { ...INPUT, cursor: 'pointer' };

const LABEL = {
  display: 'block', fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-MA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return d;
  }
}

function statutLabel(s) {
  return s === 'absent' ? 'Absent' : 'Présent';
}

function projectLabel(p) {
  if (!p) return '—';
  return p.nom || p.name || p.ref || p.label || '—';
}

function pickSubsForPointage(subs, projectId) {
  const actifs = (subs || []).filter((s) => s.statut !== 'archive' && s.statut !== 'inactif');
  if (!projectId) return [];
  // Uniquement les ST réellement affectés au projet (pas de fallback « tous les actifs »)
  return actifs.filter((s) => (
    (s.activeAssignments || []).some((a) => String(a.projectId) === String(projectId))
  ));
}

function Field({ label, required, children }) {
  return (
    <div className="st-pres-field">
      <label style={LABEL}>
        {label}{required ? <span style={{ color: 'var(--red)' }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function PointageForm({
  subcontractors, projects, saving, onCancel, onSave, loadDay,
}) {
  const [date, setDate] = useState(todayISO());
  const [projectId, setProjectId] = useState('');
  const [statuses, setStatuses] = useState({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const list = useMemo(() => {
    let rows = pickSubsForPointage(subcontractors, projectId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((s) => (
        String(s.fullName || '').toLowerCase().includes(q)
        || String(s.fonction || '').toLowerCase().includes(q)
        || String(s.currentProject || '').toLowerCase().includes(q)
      ));
    }
    return rows;
  }, [subcontractors, projectId, search]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!date || !projectId) {
        setStatuses({});
        return;
      }
      const existing = await loadDay(date, projectId);
      if (!alive) return;
      const map = {};
      (existing || []).forEach((r) => {
        map[r.subcontractor_id] = r.statut;
      });
      setStatuses(map);
    })();
    return () => { alive = false; };
  }, [date, projectId, loadDay]);

  function setStatut(subId, statut) {
    setStatuses((prev) => ({ ...prev, [subId]: statut }));
  }

  async function handleSubmit() {
    setError('');
    if (!date) { setError('Date requise.'); return; }
    if (!projectId) { setError('Projet / chantier requis.'); return; }
    const entries = Object.entries(statuses)
      .filter(([, st]) => st === 'present' || st === 'absent')
      .map(([subcontractor_id, statut]) => ({ subcontractor_id, statut }));
    if (!entries.length) {
      setError('Cochez au moins un Présent ou Absent.');
      return;
    }
    const res = await onSave({ date, projectId, entries });
    if (!res?.success) setError(res?.error || 'Erreur enregistrement.');
  }

  const marked = Object.keys(statuses).filter((k) => statuses[k] === 'present' || statuses[k] === 'absent').length;

  return (
    <div className="card st-pres-pointage" style={{ padding: 16, marginBottom: 16 }}>
      <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 800 }}>Nouveau pointage</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-3)' }}>
            1 date · 1 chantier · Présent / Absent
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <div className="st-pres-pointage-controls">
        <Field label="Date" required>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT} />
        </Field>
        <Field label="Projet / Chantier" required>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={SELECT}>
            <option value="">Sélectionner…</option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>{projectLabel(p)}</option>
            ))}
          </select>
        </Field>
        <Field label="Rechercher">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, métier…"
              style={{ ...INPUT, paddingLeft: 32 }}
            />
          </div>
        </Field>
      </div>

      {error ? (
        <div style={{ background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8, padding: '8px 12px', margin: '10px 0', color: '#C62828', fontSize: '0.82rem' }}>
          {error}
        </div>
      ) : null}

      {!projectId ? (
        <div style={{ textAlign: 'center', padding: '20px 12px', color: 'var(--text-3)', fontSize: '0.85rem' }}>
          Choisissez un projet pour afficher les sous-traitants.
        </div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 12px', color: 'var(--text-3)', fontSize: '0.85rem' }}>
          Aucun sous-traitant affecté à ce projet.
          <br />
          Affectez-les depuis Projets → Équipe → Affecter des sous-traitants.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: '10px 0 8px' }}>
            {list.length} sous-traitant{list.length > 1 ? 's' : ''} · {marked} pointé{marked > 1 ? 's' : ''}
          </div>
          <div className="st-pres-pointage-list">
            {list.map((s) => {
              const st = statuses[s.id];
              const projetHint = projectId
                ? ((s.activeAssignments || []).find((a) => String(a.projectId) === String(projectId))?.projectName
                  || projectLabel(projects.find((p) => String(p.id) === String(projectId))))
                : '—';
              return (
                <div
                  key={s.id}
                  className={`st-pres-row${st === 'present' ? ' is-present' : ''}${st === 'absent' ? ' is-absent' : ''}`}
                >
                  <div className="st-pres-row-info">
                    <div className="st-pres-row-name">{s.fullName}</div>
                    <div className="st-pres-row-meta">
                      <span>{s.fonction || '—'}</span>
                      <span className="st-pres-dot">·</span>
                      <span>{projetHint || '—'}</span>
                    </div>
                  </div>
                  <div className="st-pres-row-actions">
                    <button
                      type="button"
                      className={`st-pres-btn present${st === 'present' ? ' active' : ''}`}
                      onClick={() => setStatut(s.id, 'present')}
                    >
                      <CheckCircle size={15} /> Présent
                    </button>
                    <button
                      type="button"
                      className={`st-pres-btn absent${st === 'absent' ? ' active' : ''}`}
                      onClick={() => setStatut(s.id, 'absent')}
                    >
                      <XCircle size={15} /> Absent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving || !projectId}>
          {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />} Enregistrer
        </button>
      </div>
    </div>
  );
}

export default function PresenceSousTraitants() {
  const {
    records, subcontractors, projects, loading, saving, error, configured,
    reload, saveBatch, updateOne, remove, loadDay,
  } = useSubcontractorAttendance();

  const [showForm, setShowForm] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSubId, setFilterSubId] = useState('');
  const [filterMetier, setFilterMetier] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch] = useState('');

  const metiers = useMemo(() => {
    const set = new Set();
    (subcontractors || []).forEach((s) => {
      if (s.fonction?.trim()) set.add(s.fonction.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [subcontractors]);

  useEffect(() => {
    const t = setTimeout(() => {
      reload({
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
        subcontractorId: filterSubId || undefined,
        projectId: filterProjectId || undefined,
        statut: filterStatut || undefined,
        metier: filterMetier || undefined,
        search: search || undefined,
      });
    }, 180);
    return () => clearTimeout(t);
  }, [filterDateFrom, filterDateTo, filterSubId, filterMetier, filterProjectId, filterStatut, search, reload]);

  const filtered = records;

  const kpis = useMemo(() => {
    const total = filtered.length;
    const presents = filtered.filter((r) => r.statut === 'present').length;
    const absents = filtered.filter((r) => r.statut === 'absent').length;
    const rate = total > 0 ? Math.round((presents / total) * 100) : 0;
    const uniqueSubs = new Set(filtered.map((r) => r.subcontractor_id)).size;
    return { total, presents, absents, rate, uniqueSubs };
  }, [filtered]);

  async function handleSaveBatch(payload) {
    const res = await saveBatch(payload);
    if (res.success) setShowForm(false);
    return res;
  }

  async function handleToggleStatut(row) {
    const next = row.statut === 'present' ? 'absent' : 'present';
    await updateOne(row.id, { statut: next });
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce pointage ?')) return;
    await remove(id);
  }

  const hasFilters = filterDateFrom || filterDateTo || filterSubId || filterMetier || filterProjectId || filterStatut || search;

  return (
    <div className="animate-fade-in st-pres-page">
      <div className="flex-between st-pres-header" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ marginBottom: 2, fontSize: 'clamp(1.15rem, 2.5vw, 1.45rem)' }}>
            PRÉSENCE SOUS-TRAITANTS
          </h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Suivi journalier par chantier</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Actualiser
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm((v) => !v)}
            disabled={!configured}
          >
            <Plus size={14} /> {showForm ? 'Fermer' : 'Nouveau pointage'}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)',
          padding: '10px 14px', marginBottom: 12, fontSize: '0.84rem', color: '#C62828',
        }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()}>Réessayer</button>
        </div>
      ) : null}

      <div className="st-pres-kpis">
        <div className="stat-card st-pres-kpi">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}><Users size={16} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : kpis.uniqueSubs}</div>
            <div className="stat-label">Sous-traitants</div>
          </div>
        </div>
        <div className="stat-card st-pres-kpi">
          <div className="stat-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}><CheckCircle size={16} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : kpis.presents}</div>
            <div className="stat-label">Présents</div>
          </div>
        </div>
        <div className="stat-card st-pres-kpi">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: 'var(--red)' }}><XCircle size={16} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : kpis.absents}</div>
            <div className="stat-label">Absents</div>
          </div>
        </div>
        <div className="stat-card st-pres-kpi">
          <div className="stat-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}><Percent size={16} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : `${kpis.rate} %`}</div>
            <div className="stat-label">Taux</div>
          </div>
        </div>
      </div>

      {showForm && (
        <PointageForm
          subcontractors={subcontractors}
          projects={projects}
          saving={saving}
          loadDay={loadDay}
          onCancel={() => setShowForm(false)}
          onSave={handleSaveBatch}
        />
      )}

      <div className="card st-pres-filters" style={{ marginBottom: 12, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--text-3)', fontSize: '0.78rem', fontWeight: 700 }}>
          <Filter size={13} /> Historique
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterDateFrom(''); setFilterDateTo('');
                setFilterSubId(''); setFilterMetier(''); setFilterProjectId('');
                setFilterStatut(''); setSearch('');
              }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.78rem', fontWeight: 600 }}
            >
              Effacer
            </button>
          )}
        </div>
        <div className="st-pres-filter-grid">
          <Field label="Du">
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={INPUT} />
          </Field>
          <Field label="Au">
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={INPUT} />
          </Field>
          <Field label="Sous-traitant">
            <select value={filterSubId} onChange={(e) => setFilterSubId(e.target.value)} style={SELECT}>
              <option value="">Tous</option>
              {(subcontractors || []).map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </Field>
          <Field label="Métier">
            <select value={filterMetier} onChange={(e) => setFilterMetier(e.target.value)} style={SELECT}>
              <option value="">Tous</option>
              {metiers.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Projet">
            <select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)} style={SELECT}>
              <option value="">Tous</option>
              {(projects || []).map((p) => (
                <option key={p.id} value={p.id}>{projectLabel(p)}</option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={SELECT}>
              <option value="">Tous</option>
              {SUB_ATT_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Recherche">
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom…" style={{ ...INPUT, paddingLeft: 32 }} />
            </div>
          </Field>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={20} className="spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-3)' }}>
            <Users size={26} style={{ marginBottom: 8, opacity: 0.45 }} />
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>
              Aucune présence enregistrée
            </div>
            <div style={{ fontSize: '0.82rem' }}>
              {hasFilters ? 'Aucun résultat pour ces filtres.' : 'Créez le premier pointage ci-dessus.'}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap table-wrap--wide st-pres-desktop">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sous-traitant</th>
                    <th>Métier</th>
                    <th>Projet</th>
                    <th>Présence</th>
                    <th style={{ width: 90 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td style={{ fontWeight: 600 }}>{r.subcontractor_name}</td>
                      <td>{r.metier || '—'}</td>
                      <td>{r.project_name}</td>
                      <td>
                        <span className={`badge ${r.statut === 'present' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.7rem' }}>
                          {statutLabel(r.statut)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button type="button" className="btn btn-ghost btn-sm" title="Basculer" onClick={() => handleToggleStatut(r)} disabled={saving}>
                            <Edit2 size={13} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(r.id)} style={{ color: 'var(--red)' }} disabled={saving}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="st-pres-mobile">
              {filtered.map((r) => (
                <div key={r.id} className="st-pres-hist-card">
                  <div className="flex-between" style={{ gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontFamily: 'var(--font-head)', fontSize: '0.92rem' }}>{r.subcontractor_name}</strong>
                    <span className={`badge ${r.statut === 'present' ? 'badge-green' : 'badge-red'}`}>{statutLabel(r.statut)}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{r.metier || '—'}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 10 }}>
                    {fmtDate(r.date)} · {r.project_name}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1, minHeight: 40 }} onClick={() => handleToggleStatut(r)} disabled={saving}>
                      Basculer
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', minHeight: 40, minWidth: 44 }} onClick={() => handleDelete(r.id)} disabled={saving}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        .st-pres-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }
        .st-pres-kpi .stat-value { font-size: 1.15rem; }
        .st-pres-kpi .stat-label { font-size: 0.7rem; }
        .st-pres-kpi .stat-icon { width: 34px; height: 34px; }

        .st-pres-pointage-controls {
          display: grid;
          grid-template-columns: 140px minmax(180px, 1.4fr) minmax(160px, 1fr);
          gap: 10px;
          align-items: end;
        }

        .st-pres-pointage-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: min(52vh, 420px);
          overflow: auto;
          padding-right: 2px;
        }

        .st-pres-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
        }
        .st-pres-row.is-present { background: #F1F8E9; border-color: #A5D6A7; }
        .st-pres-row.is-absent { background: #FFEBEE; border-color: #EF9A9A; }
        .st-pres-row-info { min-width: 0; flex: 1; }
        .st-pres-row-name {
          font-family: var(--font-head);
          font-weight: 800;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .st-pres-row-meta {
          font-size: 0.74rem;
          color: var(--text-3);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .st-pres-dot { margin: 0 4px; }
        .st-pres-row-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        .st-pres-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-height: 36px;
          min-width: 96px;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--surface-2);
          color: var(--text);
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          font-family: var(--font-body);
        }
        .st-pres-btn.present.active { background: #2E7D32; color: #fff; border-color: #2E7D32; }
        .st-pres-btn.absent.active { background: var(--red); color: #fff; border-color: var(--red); }

        .st-pres-filter-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .st-pres-filter-grid .st-pres-field:last-child {
          grid-column: span 2;
        }

        .st-pres-mobile { display: none; flex-direction: column; gap: 8px; padding: 10px; }
        .st-pres-hist-card {
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
        }

        @media (max-width: 1100px) {
          .st-pres-filter-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .st-pres-filter-grid .st-pres-field:last-child {
            grid-column: span 1;
          }
          .st-pres-pointage-controls {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 768px) {
          .st-pres-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
          .st-pres-pointage-controls {
            grid-template-columns: 1fr;
          }
          .st-pres-filter-grid {
            grid-template-columns: 1fr 1fr;
          }
          .st-pres-filter-grid .st-pres-field:last-child {
            grid-column: 1 / -1;
          }
          .st-pres-row {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            padding: 12px;
          }
          .st-pres-row-name { white-space: normal; }
          .st-pres-row-meta { white-space: normal; }
          .st-pres-row-actions { width: 100%; }
          .st-pres-btn {
            flex: 1;
            min-height: 44px;
            min-width: 0;
          }
          .st-pres-pointage-list {
            max-height: none;
          }
          .st-pres-desktop { display: none !important; }
          .st-pres-mobile { display: flex !important; }
        }

        @media (max-width: 420px) {
          .st-pres-filter-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
