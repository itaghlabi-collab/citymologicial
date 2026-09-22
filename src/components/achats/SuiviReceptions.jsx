/**
 * SuiviReceptions.jsx — Demande de récupération (Achats)
 * Création simple (qui / quand / quoi) + suivi statut.
 * Route inchangée : suivi-receptions. Ne touche pas Logistique.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Plus, Search, Loader2, Trash2, CheckCircle, X, Package,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  listDemandesRecuperationAchats,
  createDemandeRecuperationAchats,
  updateDemandeRecuperationStatut,
  deleteDemandeRecuperationAchats,
  filterDemandesRecuperation,
  computeDemandesRecuperationKpis,
  DEMANDE_RECUP_STATUTS,
  DEMANDE_RECUP_LABEL,
  DEMANDE_RECUP_BADGE,
} from '../../services/achats/achatDemandesRecuperation';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  KpiCard, EmptyState, FField, Modal,
} from './shared.jsx';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function userLabel(user) {
  return (user?.nom || user?.email || '').trim();
}

const EMPTY_FORM = () => ({
  qui: '',
  quand: todayISO(),
  quoi: '',
});

export default function SuiviReceptions() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listDemandesRecuperationAchats());
    } catch (e) {
      const msg = e?.message || String(e);
      if (/achat_demandes_recuperation|does not exist|42P01|schema cache/i.test(msg)) {
        setError('Table absente — exécutez supabase/RUN_ACHAT_DEMANDES_RECUPERATION.sql dans Supabase.');
      } else {
        setError(msg);
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filterDemandesRecuperation(rows, { search, statut: filterStatut }),
    [rows, search, filterStatut],
  );
  const kpis = useMemo(() => computeDemandesRecuperationKpis(rows), [rows]);

  function openCreate() {
    setForm({ ...EMPTY_FORM(), qui: userLabel(user) });
    setFormErrors({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (!String(form.qui || '').trim()) e.qui = 'Requis';
    if (!String(form.quand || '').trim()) e.quand = 'Requis';
    if (!String(form.quoi || '').trim()) e.quoi = 'Requis';
    return e;
  }

  async function handleCreate(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createDemandeRecuperationAchats(form);
      setShowModal(false);
      await load();
    } catch (e) {
      setError(e?.message || 'Erreur création.');
    } finally {
      setSaving(false);
    }
  }

  async function markRecuperee(row) {
    if (!window.confirm(`Marquer ${row.ref} comme récupérée ?`)) return;
    setSaving(true);
    try {
      await updateDemandeRecuperationStatut(row.id, DEMANDE_RECUP_STATUTS.RECUPEREE);
      await load();
    } catch (e) {
      setError(e?.message || 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Supprimer la demande ${row.ref} ?`)) return;
    setSaving(true);
    try {
      await deleteDemandeRecuperationAchats(row.id);
      await load();
    } catch (e) {
      setError(e?.message || 'Erreur suppression.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Demande de récupération</h1>
          <p className="page-subtitle">Créer une demande (qui / quand / quoi) puis suivre le statut.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate} disabled={loading || saving}>
          <Plus size={15} /> Créer une demande
        </button>
      </div>

      {error && (
        <div style={{
          background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', color: '#C62828',
        }}>
          {error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 8 }}>Réessayer</button>
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 16 }}>
        <KpiCard icon={<Package size={17} />} label="Total" value={loading ? '—' : kpis.total} color="grey" />
        <KpiCard icon={<ClipboardCheck size={17} />} label="À récupérer" value={loading ? '—' : kpis.aRecuperer} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Récupérées" value={loading ? '—' : kpis.recuperees} color="green" />
      </div>

      <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Réf., qui, quoi..."
              style={{ ...INPUT_STYLE, paddingLeft: 32 }}
            />
          </div>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, minWidth: 160 }}>
            <option value="">Tous les statuts</option>
            {Object.entries(DEMANDE_RECUP_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
            <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck size={22} />}
            title="Aucune demande"
            sub="Créez une demande de récupération (qui, quand, quoi)."
            action="Créer une demande"
            onAction={openCreate}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Qui</th>
                  <th>Quand</th>
                  <th>Quoi</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{r.ref}</td>
                    <td style={{ fontWeight: 600 }}>{r.qui}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.quand || '—'}</td>
                    <td style={{ maxWidth: 320 }}>{r.quoi}</td>
                    <td>
                      <span className={`badge ${DEMANDE_RECUP_BADGE[r.statut] || 'badge-grey'}`}>
                        {r.statut_label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {r.statut === DEMANDE_RECUP_STATUTS.A_RECUPERER && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                            onClick={() => markRecuperee(r)}
                            title="Marquer récupérée"
                          >
                            <CheckCircle size={13} /> Récupérée
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={saving}
                          onClick={() => handleDelete(r)}
                          title="Supprimer"
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

      <Modal open={showModal} onClose={() => !saving && setShowModal(false)} title="Créer une demande de récupération" width={480}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FField label="Qui" required>
            <input
              style={{ ...INPUT_STYLE, borderColor: formErrors.qui ? 'var(--red)' : undefined }}
              value={form.qui}
              onChange={(e) => setForm((p) => ({ ...p, qui: e.target.value }))}
              placeholder="Nom du demandeur / récupérateur"
            />
            {formErrors.qui && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{formErrors.qui}</span>}
          </FField>
          <FField label="Quand" required>
            <input
              type="date"
              style={{ ...INPUT_STYLE, borderColor: formErrors.quand ? 'var(--red)' : undefined }}
              value={form.quand}
              onChange={(e) => setForm((p) => ({ ...p, quand: e.target.value }))}
            />
            {formErrors.quand && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{formErrors.quand}</span>}
          </FField>
          <FField label="Quoi" required>
            <textarea
              rows={4}
              style={{ ...TEXTAREA_STYLE, borderColor: formErrors.quoi ? 'var(--red)' : undefined }}
              value={form.quoi}
              onChange={(e) => setForm((p) => ({ ...p, quoi: e.target.value }))}
              placeholder="Ex. Matériel électrique OA-2026-279, 4 disques NAS..."
            />
            {formErrors.quoi && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{formErrors.quoi}</span>}
          </FField>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setShowModal(false)}>
              <X size={14} /> Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              Créer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
