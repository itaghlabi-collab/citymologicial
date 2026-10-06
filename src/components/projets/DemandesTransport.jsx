/**
 * DemandesTransport.jsx — Projets › Demande de transport.
 * Chef de projet : évacuation (chantier → dépôt) ou transfert (chantier → chantier).
 * Magasinier : Traiter (chauffeur + véhicule) → En cours de transport → Traitée.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck, Search, Loader2, CheckCircle, Package, Navigation, Plus, Clock, XCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { can } from '../../services/admin/permissions';
import { listEmployees, employeeFullName } from '../../services/rh/employees';
import { listVehicles } from '../../services/logistique/vehicles';
import { isPickupDriverPoste } from '../../services/logistique/pickupRequests';
import {
  listTransportRequests,
  listProjectsForTransport,
  createTransportRequest,
  startTransportRequest,
  finishTransportRequest,
  cancelTransportRequest,
  filterTransportRequests,
  computeTransportKpis,
  sessionUserName,
  TRANSPORT_STATUTS,
  TRANSPORT_STATUT_LABEL,
  TRANSPORT_STATUT_BADGE,
  TRANSPORT_TYPES,
  TRANSPORT_TYPE_SHORT,
  EMPTY_TRANSPORT_FORM,
  DEPOT_KHYAYTA,
  DEPOT_VALUE,
} from '../../services/projets/transportRequests';
import {
  INPUT_STYLE, SELECT_STYLE, KpiCard, EmptyState, FField, Modal,
} from '../achats/shared.jsx';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function vehicleOptionLabel(v) {
  if (!v) return '';
  const name = [v.marque, v.modele].filter(Boolean).join(' ') || v.vehicule || '';
  const mat = v.matricule || v.matricule_ww || '';
  if (mat && name) return `${mat} — ${name}`;
  return mat || name || v.id || '';
}

function errorMessage(err) {
  const msg = err?.message || String(err || '');
  if (/project_transport_requests|list_projects_for_transport|schema cache/i.test(msg) && /not find|does not exist|schema cache/i.test(msg)) {
    return 'Exécutez supabase/RUN_PROJECT_TRANSPORT_REQUESTS.sql dans Supabase.';
  }
  if (/row-level security|permission denied/i.test(msg)) {
    return 'Accès refusé — vérifiez les droits sur « Demande de transport ».';
  }
  return msg || 'Erreur.';
}

const ERR_TEXT = { color: 'var(--red)', fontSize: '0.75rem' };

export default function DemandesTransport() {
  const { user } = useAuth();
  const userName = sessionUserName(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterType, setFilterType] = useState('');
  const [perms, setPerms] = useState({ creer: false, traiter: false });
  const [projects, setProjects] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_TRANSPORT_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState('');

  const [traiterRow, setTraiterRow] = useState(null);
  const [traiterForm, setTraiterForm] = useState({ chauffeur: '', vehicule: '', date_transport: todayISO() });
  const [traiterErrors, setTraiterErrors] = useState({});
  const [finishRow, setFinishRow] = useState(null);
  const [cancelRow, setCancelRow] = useState(null);
  const [detailRow, setDetailRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listTransportRequests());
    } catch (err) {
      setError(errorMessage(err));
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    (async () => {
      const [creer, traiter] = await Promise.all([
        can(user, 'demandes-transport', 'creer').catch(() => false),
        can(user, 'demandes-chantier', 'voir').catch(() => false),
      ]);
      if (!cancelled) setPerms({ creer, traiter });
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [projs, emps, vehs] = await Promise.all([
        listProjectsForTransport().catch(() => []),
        listEmployees().catch(() => []),
        listVehicles().catch(() => []),
      ]);
      if (cancelled) return;
      setProjects(projs);
      setDrivers((emps || [])
        .filter((e) => isPickupDriverPoste(e.poste))
        .map((e) => employeeFullName(e))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'fr')));
      setVehicles((vehs || []).map(vehicleOptionLabel).filter(Boolean));
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => filterTransportRequests(rows, { search, statut: filterStatut, type: filterType }),
    [rows, search, filterStatut, filterType],
  );
  const kpis = useMemo(() => computeTransportKpis(rows), [rows]);

  function openCreate() {
    setForm(EMPTY_TRANSPORT_FORM);
    setFormErrors({});
    setFormError('');
    setCreateOpen(true);
  }

  function setType(type) {
    setForm((p) => ({
      ...p,
      type,
      destination: type === 'evacuation'
        ? DEPOT_VALUE
        : (p.destination === DEPOT_VALUE ? '' : p.destination),
    }));
  }

  async function handleCreate(ev) {
    ev.preventDefault();
    const e = {};
    if (!form.depart) e.depart = 'Requis';
    if (!form.destination) e.destination = 'Requis';
    if (form.depart && form.depart === form.destination) e.destination = 'Doit être différent du départ';
    if (!form.materiel.trim()) e.materiel = 'Requis';
    if (Object.keys(e).length) {
      setFormErrors(e);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await createTransportRequest(form, projects);
      setCreateOpen(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openTraiter(row) {
    setTraiterRow(row);
    setTraiterForm({ chauffeur: '', vehicule: '', date_transport: todayISO() });
    setTraiterErrors({});
  }

  async function handleTraiter(ev) {
    ev.preventDefault();
    const e = {};
    if (!traiterForm.chauffeur) e.chauffeur = 'Requis';
    if (!traiterForm.vehicule) e.vehicule = 'Requis';
    if (Object.keys(e).length) {
      setTraiterErrors(e);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await startTransportRequest(traiterRow.id, traiterForm);
      setTraiterRow(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(fn, row, close) {
    setSaving(true);
    setError('');
    try {
      await fn(row.id);
      close(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const isEnAttente = (r) => r.statut === TRANSPORT_STATUTS.EN_ATTENTE;
  const isEnTransport = (r) => r.statut === TRANSPORT_STATUTS.EN_TRANSPORT;
  const canCancel = (r) => isEnAttente(r) && r.created_by === user?.id;
  const trajet = (r) => `${r.depart || '—'} → ${r.destination || '—'}`;

  const placeOptions = (
    <>
      <option value="">— Sélectionner —</option>
      <option value={DEPOT_VALUE}>{DEPOT_KHYAYTA}</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </>
  );

  function actionButtons(r, mobile = false) {
    const cls = `btn btn-sm${mobile ? ' recup-mobile-action' : ''}`;
    return (
      <>
        {perms.traiter && isEnAttente(r) && (
          <button type="button" className={`${cls} btn-primary`} disabled={saving} onClick={() => openTraiter(r)}>
            {!mobile && <Truck size={13} />} Traiter
          </button>
        )}
        {perms.traiter && isEnTransport(r) && (
          <button type="button" className={`${cls} btn-secondary`} disabled={saving} onClick={() => setFinishRow(r)}>
            {!mobile && <CheckCircle size={13} />} Traitée
          </button>
        )}
        {!mobile && canCancel(r) && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setCancelRow(r)} title="Annuler la demande">
            <XCircle size={13} />
          </button>
        )}
      </>
    );
  }

  return (
    <div className="animate-fade-in recup-page transport-page">
      <div className="page-header recup-header" style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="recup-header-text" style={{ minWidth: 0 }}>
          <h1 className="page-title">Demande de transport</h1>
          <p className="page-subtitle recup-page-sub">
            Évacuation chantier → dépôt ou transfert chantier → chantier. Le magasinier la traite avec chauffeur et véhicule.
          </p>
        </div>
        {perms.creer && (
          <button type="button" className="btn btn-primary recup-new-btn" onClick={openCreate} disabled={saving}>
            <Plus size={15} /> <span className="recup-new-btn-long">Nouvelle demande</span><span className="recup-new-btn-short">Nouvelle</span>
          </button>
        )}
      </div>

      {error && (
        <div style={{
          background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', color: '#C62828',
        }}>
          {error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()} style={{ marginLeft: 8 }}>Réessayer</button>
        </div>
      )}

      <div className="stat-grid recup-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginBottom: 12 }}>
        <KpiCard icon={<Package size={17} />} label="Total" value={loading ? '—' : kpis.total} color="grey" />
        <KpiCard icon={<Clock size={17} />} label="En attente" value={loading ? '—' : kpis.enAttente} color="orange" />
        <KpiCard icon={<Navigation size={17} />} label="En transport" value={loading ? '—' : kpis.enTransport} color="purple" />
        <KpiCard icon={<CheckCircle size={17} />} label="Traitées" value={loading ? '—' : kpis.traitees} color="green" />
      </div>

      <div className="card recup-filters" style={{ padding: '10px 12px', marginBottom: 12 }}>
        <div className="recup-filters-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="recup-filter-search" style={{ position: 'relative', flex: '1 1 180px', minWidth: 0, maxWidth: 280 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Réf, chantier, matériel, demandeur…"
              style={{ ...INPUT_STYLE, paddingLeft: 30, minHeight: 36, paddingTop: 7, paddingBottom: 7, fontSize: '0.84rem' }}
            />
          </div>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            style={{ ...SELECT_STYLE, minWidth: 140, maxWidth: 200, minHeight: 36, padding: '7px 10px', fontSize: '0.84rem' }}
          >
            <option value="">Tous les statuts</option>
            {Object.values(TRANSPORT_STATUTS).map((s) => (
              <option key={s} value={s}>{TRANSPORT_STATUT_LABEL[s]}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ ...SELECT_STYLE, minWidth: 130, maxWidth: 180, minHeight: 36, padding: '7px 10px', fontSize: '0.84rem' }}
          >
            <option value="">Tous les types</option>
            <option value="evacuation">Évacuation</option>
            <option value="transfert">Transfert</option>
          </select>
          {(filterStatut || filterType || search) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setFilterStatut(''); setFilterType(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.78rem', fontWeight: 600 }}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      <div className="card recup-list-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
            <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Truck size={22} />}
            title="Aucune demande de transport"
            sub={perms.creer ? 'Cliquez sur « Nouvelle demande » pour évacuer ou transférer du matériel.' : 'Aucune demande pour le moment.'}
            action={perms.creer ? 'Nouvelle demande' : undefined}
            onAction={openCreate}
          />
        ) : (
          <>
            <div className="table-wrap recup-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>Réf.</th>
                    <th>Type</th>
                    <th>Départ → Destination</th>
                    <th>Matériel</th>
                    <th>Demandeur</th>
                    <th>Date souhaitée</th>
                    <th>Statut</th>
                    <th>Chauffeur / Véhicule</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setDetailRow(r)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', textDecoration: 'underline' }}
                        >
                          {r.ref}
                        </button>
                        {r.priorite === 'urgente' && <span className="badge badge-red" style={{ marginLeft: 6 }}>Urgent</span>}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{TRANSPORT_TYPE_SHORT[r.type]}</td>
                      <td style={{ maxWidth: 260, fontSize: '0.82rem' }}>{trajet(r)}</td>
                      <td style={{ maxWidth: 240, fontSize: '0.82rem' }}>
                        {r.materiel}
                        {r.quantite && <div style={{ color: 'var(--text-3)' }}>{r.quantite}</div>}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{r.demandeur_nom || '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{formatDate(r.date_souhaitee) || '—'}</td>
                      <td>
                        <span className={`badge ${TRANSPORT_STATUT_BADGE[r.statut] || 'badge-grey'}`}>{r.statut_label}</span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {r.chauffeur || r.vehicule ? (
                          <>
                            <div>{r.chauffeur || '—'}</div>
                            <div style={{ color: 'var(--text-3)' }}>{r.vehicule || '—'}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{actionButtons(r)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="recup-mobile-list">
              {filtered.map((r) => (
                <li key={r.id} className="recup-mobile-row">
                  <div className="recup-mobile-main" role="button" tabIndex={0} onClick={() => setDetailRow(r)}>
                    <div className="recup-mobile-top">
                      <span className="recup-mobile-da">{r.ref}</span>
                      <span className={`badge recup-mobile-badge ${TRANSPORT_STATUT_BADGE[r.statut] || 'badge-grey'}`}>{r.statut_label}</span>
                      {r.priorite === 'urgente' && <span className="badge badge-red recup-mobile-badge">Urgent</span>}
                    </div>
                    <span className="recup-mobile-quoi" title={r.materiel}>{r.materiel}</span>
                    <span className="recup-mobile-trajet" title={trajet(r)}>{trajet(r)}</span>
                    <span className="recup-mobile-trajet">
                      {[TRANSPORT_TYPE_SHORT[r.type], r.demandeur_nom && `Par ${r.demandeur_nom}`, formatDate(r.date_souhaitee)].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {actionButtons(r, true)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Modal open={createOpen} onClose={() => !saving && setCreateOpen(false)} title="Nouvelle demande de transport" width={540}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {formError && (
            <div style={{ background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#C62828' }}>
              {formError}
            </div>
          )}
          <FField label="Demandeur">
            <input style={{ ...INPUT_STYLE, background: 'var(--surface-2)' }} value={userName || '—'} readOnly disabled />
          </FField>
          <FField label="Type" required>
            <select style={SELECT_STYLE} value={form.type} disabled={saving} onChange={(e) => setType(e.target.value)}>
              {TRANSPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FField>
          <FField label="Départ" required>
            <select
              style={{ ...SELECT_STYLE, borderColor: formErrors.depart ? 'var(--red)' : undefined }}
              value={form.depart}
              disabled={saving}
              onChange={(e) => setForm((p) => ({ ...p, depart: e.target.value }))}
            >
              {placeOptions}
            </select>
            {formErrors.depart && <span style={ERR_TEXT}>{formErrors.depart}</span>}
          </FField>
          <FField label="Destination" required>
            <select
              style={{ ...SELECT_STYLE, borderColor: formErrors.destination ? 'var(--red)' : undefined }}
              value={form.destination}
              disabled={saving}
              onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))}
            >
              {placeOptions}
            </select>
            {formErrors.destination && <span style={ERR_TEXT}>{formErrors.destination}</span>}
          </FField>
          <FField label="Matériel à transporter" required>
            <textarea
              style={{ ...INPUT_STYLE, minHeight: 64, resize: 'vertical', borderColor: formErrors.materiel ? 'var(--red)' : undefined }}
              value={form.materiel}
              disabled={saving}
              placeholder="Ex. échafaudages, chutes de placo, outillage…"
              onChange={(e) => setForm((p) => ({ ...p, materiel: e.target.value }))}
            />
            {formErrors.materiel && <span style={ERR_TEXT}>{formErrors.materiel}</span>}
          </FField>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <FField label="Quantité / volume">
              <input
                style={INPUT_STYLE}
                value={form.quantite}
                disabled={saving}
                placeholder="Ex. 2 palettes, 1 camion"
                onChange={(e) => setForm((p) => ({ ...p, quantite: e.target.value }))}
              />
            </FField>
            <FField label="Date souhaitée">
              <input
                type="date"
                style={INPUT_STYLE}
                value={form.date_souhaitee}
                disabled={saving}
                onChange={(e) => setForm((p) => ({ ...p, date_souhaitee: e.target.value }))}
              />
            </FField>
            <FField label="Priorité">
              <select style={SELECT_STYLE} value={form.priorite} disabled={saving} onChange={(e) => setForm((p) => ({ ...p, priorite: e.target.value }))}>
                <option value="normale">Normale</option>
                <option value="urgente">Urgente</option>
              </select>
            </FField>
          </div>
          <FField label="Remarque">
            <textarea
              style={{ ...INPUT_STYLE, minHeight: 56, resize: 'vertical' }}
              value={form.remarque}
              disabled={saving}
              onChange={(e) => setForm((p) => ({ ...p, remarque: e.target.value }))}
            />
          </FField>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setCreateOpen(false)}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              Créer la demande
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!traiterRow} onClose={() => !saving && setTraiterRow(null)} title="Traiter — chauffeur et véhicule" width={460}>
        {traiterRow && (
          <form onSubmit={handleTraiter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)' }}>
              <strong>{traiterRow.ref}</strong> — {TRANSPORT_TYPE_SHORT[traiterRow.type]}
              <br />{trajet(traiterRow)}
              <br />{traiterRow.materiel}{traiterRow.quantite ? ` (${traiterRow.quantite})` : ''}
              {traiterRow.demandeur_nom && <><br />Demandée par {traiterRow.demandeur_nom}</>}
            </p>
            <FField label="Chauffeur / Coursier" required>
              <select
                style={{ ...SELECT_STYLE, borderColor: traiterErrors.chauffeur ? 'var(--red)' : undefined }}
                value={traiterForm.chauffeur}
                disabled={saving}
                onChange={(e) => setTraiterForm((p) => ({ ...p, chauffeur: e.target.value }))}
              >
                <option value="">— Sélectionner —</option>
                {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              {traiterErrors.chauffeur && <span style={ERR_TEXT}>{traiterErrors.chauffeur}</span>}
            </FField>
            <FField label="Véhicule" required>
              <select
                style={{ ...SELECT_STYLE, borderColor: traiterErrors.vehicule ? 'var(--red)' : undefined }}
                value={traiterForm.vehicule}
                disabled={saving}
                onChange={(e) => setTraiterForm((p) => ({ ...p, vehicule: e.target.value }))}
              >
                <option value="">— Sélectionner —</option>
                {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {traiterErrors.vehicule && <span style={ERR_TEXT}>{traiterErrors.vehicule}</span>}
            </FField>
            <FField label="Date du transport">
              <input
                type="date"
                style={INPUT_STYLE}
                value={traiterForm.date_transport}
                disabled={saving}
                onChange={(e) => setTraiterForm((p) => ({ ...p, date_transport: e.target.value }))}
              />
            </FField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setTraiterRow(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
                Valider — en cours de transport
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!finishRow} onClose={() => !saving && setFinishRow(null)} title="Confirmer le traitement" width={440}>
        {finishRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-2)' }}>
              <strong>{finishRow.ref}</strong> — {trajet(finishRow)}
              <br />Le transport est terminé : marquer cette demande comme traitée ?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setFinishRow(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => runAction(finishTransportRequest, finishRow, setFinishRow)}>
                {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
                Traitée
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!cancelRow} onClose={() => !saving && setCancelRow(null)} title="Annuler la demande" width={420}>
        {cancelRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-2)' }}>
              <strong>{cancelRow.ref}</strong> — {trajet(cancelRow)}
              <br />Annuler cette demande de transport ?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setCancelRow(null)}>Retour</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => runAction(cancelTransportRequest, cancelRow, setCancelRow)}>
                {saving ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                Annuler la demande
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!detailRow} onClose={() => setDetailRow(null)} title={`Demande de transport ${detailRow?.ref || ''}`} width={520}>
        {detailRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
              {[
                ['Statut', detailRow.statut_label],
                ['Type', TRANSPORT_TYPE_SHORT[detailRow.type]],
                ['Priorité', detailRow.priorite === 'urgente' ? 'Urgente' : 'Normale'],
                ['Départ', detailRow.depart],
                ['Destination', detailRow.destination],
                ['Date souhaitée', formatDate(detailRow.date_souhaitee)],
                ['Matériel', detailRow.materiel],
                ['Quantité / volume', detailRow.quantite],
                ['Demandeur', detailRow.demandeur_nom],
                ['Chauffeur', detailRow.chauffeur],
                ['Véhicule', detailRow.vehicule],
                ['Date du transport', formatDate(detailRow.date_transport)],
                ['Traitée par', detailRow.traite_par_nom],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
                </div>
              ))}
            </div>
            {detailRow.remarque && (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Remarque</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{detailRow.remarque}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {canCancel(detailRow) && (
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => { setCancelRow(detailRow); setDetailRow(null); }}>
                  <XCircle size={14} /> Annuler la demande
                </button>
              )}
              {perms.traiter && isEnAttente(detailRow) && (
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => { openTraiter(detailRow); setDetailRow(null); }}>
                  <Truck size={14} /> Traiter
                </button>
              )}
              {perms.traiter && isEnTransport(detailRow) && (
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => { setFinishRow(detailRow); setDetailRow(null); }}>
                  <CheckCircle size={14} /> Traitée
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
