/**
 * PresenceSousTraitants.jsx — Pointage journalier sous-traitants (isolé)
 * Ne touche pas Présence ouvriers ni Situation / paiements.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, CheckCircle, XCircle, Users, Percent, Search, Loader2,
  RefreshCw, Trash2, Edit2, X, CalendarDays,
} from 'lucide-react';
import { useSubcontractorAttendance } from '../hooks/useSubcontractorAttendance';
import { SUB_ATT_STATUTS } from '../services/rh/subcontractorAttendance';

const INPUT = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
};
const SELECT = { ...INPUT, cursor: 'pointer' };

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

/** Sous-traitants à pointer pour un chantier : affectés actifs d’abord, sinon tous actifs. */
function pickSubsForPointage(subs, projectId) {
  const actifs = (subs || []).filter((s) => s.statut !== 'archive' && s.statut !== 'inactif');
  if (!projectId) return actifs;
  const assigned = actifs.filter((s) => (
    (s.activeAssignments || []).some((a) => String(a.projectId) === String(projectId))
  ));
  return assigned.length ? assigned : actifs;
}

function PointageForm({
  subcontractors, projects, saving, onCancel, onSave, loadDay,
}) {
  const [date, setDate] = useState(todayISO());
  const [projectId, setProjectId] = useState('');
  const [statuses, setStatuses] = useState({}); // subId -> present|absent
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

  const marked = Object.keys(statuses).length;

  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800 }}>Nouveau pointage</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>
            Présent / Absent — un seul pointage par sous-traitant, date et chantier
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 5 }}>
            Date <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 5 }}>
            Projet / Chantier <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={SELECT}>
            <option value="">Sélectionner…</option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>{projectLabel(p)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 5 }}>
            Rechercher
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, métier…"
              style={{ ...INPUT, paddingLeft: 32 }}
            />
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8, padding: '10px 12px', marginBottom: 12, color: '#C62828', fontSize: '0.84rem' }}>
          {error}
        </div>
      ) : null}

      {!projectId ? (
        <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text-3)', fontSize: '0.88rem' }}>
          Choisissez un projet / chantier pour afficher les sous-traitants.
        </div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text-3)', fontSize: '0.88rem' }}>
          Aucun sous-traitant actif à pointer.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 10 }}>
            {list.length} sous-traitant{list.length > 1 ? 's' : ''} · {marked} pointé{marked > 1 ? 's' : ''}
          </div>
          <div className="st-presence-cards" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((s) => {
              const st = statuses[s.id];
              const projetHint = projectId
                ? ((s.activeAssignments || []).find((a) => String(a.projectId) === String(projectId))?.projectName
                  || s.currentProject
                  || projectLabel(projects.find((p) => String(p.id) === String(projectId))))
                : (s.currentProject || '—');
              return (
                <div
                  key={s.id}
                  className="card"
                  style={{
                    padding: '14px 16px',
                    border: st === 'present' ? '1.5px solid #A5D6A7'
                      : st === 'absent' ? '1.5px solid #EF9A9A'
                        : '1px solid var(--border)',
                    background: st === 'present' ? '#F1F8E9'
                      : st === 'absent' ? '#FFEBEE'
                        : '#fff',
                  }}
                >
                  <div style={{ fontWeight: 800, fontFamily: 'var(--font-head)', fontSize: '0.95rem', marginBottom: 2 }}>
                    {s.fullName}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: 2 }}>
                    {s.fonction || '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 12 }}>
                    {projetHint || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setStatut(s.id, 'present')}
                      style={{
                        flex: 1, minWidth: 120, minHeight: 44,
                        background: st === 'present' ? '#2E7D32' : 'var(--surface-2)',
                        color: st === 'present' ? '#fff' : 'var(--text)',
                        border: '1px solid var(--border)',
                        fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <CheckCircle size={16} /> Présent
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setStatut(s.id, 'absent')}
                      style={{
                        flex: 1, minWidth: 120, minHeight: 44,
                        background: st === 'absent' ? 'var(--red)' : 'var(--surface-2)',
                        color: st === 'absent' ? '#fff' : 'var(--text)',
                        border: '1px solid var(--border)',
                        fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <XCircle size={16} /> Absent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 18 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving || !projectId}>
          {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />} Enregistrer le pointage
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
  const [filterDate, setFilterDate] = useState('');
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
        date: filterDate || undefined,
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
  }, [filterDate, filterDateFrom, filterDateTo, filterSubId, filterMetier, filterProjectId, filterStatut, search, reload]);

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

  const hasFilters = filterDate || filterDateFrom || filterDateTo || filterSubId || filterMetier || filterProjectId || filterStatut || search;

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>PRÉSENCE SOUS-TRAITANTS</h1>
          <p className="page-subtitle">Suivi journalier de la présence des sous-traitants par chantier</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Actualiser
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
            disabled={!configured}
          >
            <Plus size={14} /> Nouveau pointage
          </button>
        </div>
      </div>

      {error ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)',
          padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#C62828',
        }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()}>Réessayer</button>
        </div>
      ) : null}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 18 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}><Users size={17} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : kpis.uniqueSubs}</div>
            <div className="stat-label">Sous-traitants</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}><CheckCircle size={17} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : kpis.presents}</div>
            <div className="stat-label">Présents</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE', color: 'var(--red)' }}><XCircle size={17} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : kpis.absents}</div>
            <div className="stat-label">Absents</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}><Percent size={17} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : `${kpis.rate} %`}</div>
            <div className="stat-label">Taux de présence</div>
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

      <div className="card" style={{ marginBottom: 14, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <CalendarDays size={14} style={{ color: 'var(--text-3)' }} />
          <input type="date" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setFilterDateFrom(''); setFilterDateTo(''); }} style={{ ...INPUT, maxWidth: 150 }} title="Date exacte" />
          <input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setFilterDate(''); }} style={{ ...INPUT, maxWidth: 150 }} title="Période du" />
          <input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setFilterDate(''); }} style={{ ...INPUT, maxWidth: 150 }} title="Période au" />
          <select value={filterSubId} onChange={(e) => setFilterSubId(e.target.value)} style={{ ...SELECT, maxWidth: 200 }}>
            <option value="">Tous les sous-traitants</option>
            {(subcontractors || []).map((s) => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
          </select>
          <select value={filterMetier} onChange={(e) => setFilterMetier(e.target.value)} style={{ ...SELECT, maxWidth: 160 }}>
            <option value="">Tous les métiers</option>
            {metiers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)} style={{ ...SELECT, maxWidth: 200 }}>
            <option value="">Tous les projets</option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>{projectLabel(p)}</option>
            ))}
          </select>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT, maxWidth: 130 }}>
            <option value="">Tous statuts</option>
            {SUB_ATT_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div style={{ flex: 1, minWidth: 140, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" style={{ ...INPUT, paddingLeft: 32 }} />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterDate(''); setFilterDateFrom(''); setFilterDateTo('');
                setFilterSubId(''); setFilterMetier(''); setFilterProjectId('');
                setFilterStatut(''); setSearch('');
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600 }}
            >
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={20} className="spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
            <Users size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>
              Aucune présence enregistrée
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              {hasFilters ? 'Aucun résultat pour ces filtres.' : 'Créez le premier pointage via le bouton ci-dessus.'}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="table-wrap table-wrap--wide st-presence-desktop">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sous-traitant</th>
                    <th>Métier</th>
                    <th>Projet</th>
                    <th>Présence</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Date">{fmtDate(r.date)}</td>
                      <td data-label="Sous-traitant" style={{ fontWeight: 600 }}>{r.subcontractor_name}</td>
                      <td data-label="Métier">{r.metier || '—'}</td>
                      <td data-label="Projet">{r.project_name}</td>
                      <td data-label="Présence">
                        <span className={`badge ${r.statut === 'present' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.72rem' }}>
                          {statutLabel(r.statut)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Basculer Présent / Absent"
                            onClick={() => handleToggleStatut(r)}
                            disabled={saving}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Supprimer"
                            onClick={() => handleDelete(r.id)}
                            style={{ color: 'var(--red)' }}
                            disabled={saving}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="st-presence-mobile" style={{ display: 'none', flexDirection: 'column', gap: 10, padding: 12 }}>
              {filtered.map((r) => (
                <div key={r.id} className="card" style={{ padding: 14 }}>
                  <div className="flex-between" style={{ gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontFamily: 'var(--font-head)' }}>{r.subcontractor_name}</strong>
                    <span className={`badge ${r.statut === 'present' ? 'badge-green' : 'badge-red'}`}>{statutLabel(r.statut)}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{r.metier || '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 10 }}>
                    {fmtDate(r.date)} · {r.project_name}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1, minHeight: 40 }} onClick={() => handleToggleStatut(r)} disabled={saving}>
                      Basculer
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', minHeight: 40 }} onClick={() => handleDelete(r.id)} disabled={saving}>
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
        @media (max-width: 768px) {
          .st-presence-desktop { display: none !important; }
          .st-presence-mobile { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
