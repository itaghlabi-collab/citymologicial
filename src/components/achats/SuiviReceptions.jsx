/**
 * SuiviReceptions.jsx — Demande de récupération (Achats), 100 % manuelle.
 * Création (DA + départ + destination) → « En attente de traitement ».
 * Magasinier « Traiter » (chauffeur/coursier + véhicule) → « En cours de transport » → « Traitée ».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardCheck, Search, Loader2, CheckCircle, Package, Truck, Navigation, Plus, Clock,
} from 'lucide-react';
import {
  listDemandesRecuperationAchats,
  markDemandeRecuperationDone,
  markDemandeRecuperationTraitee,
  createDemandeRecuperationManuelle,
  listPurchaseRequestsForRecup,
  listProjectsForRecup,
  getRecupPurchaseRequest,
  filterDemandesRecuperation,
  computeDemandesRecuperationKpis,
  DEMANDE_RECUP_STATUTS,
  DEMANDE_RECUP_LABEL,
  DEMANDE_RECUP_BADGE,
  DEPOT_KHYAYTA_LABEL,
} from '../../services/achats/achatDemandesRecuperation';
import { listEmployees, employeeFullName } from '../../services/rh/employees';
import { listVehicles } from '../../services/logistique/vehicles';
import { isPickupDriverPoste } from '../../services/logistique/pickupRequests';
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, FField, Modal,
} from './shared.jsx';

const LAST_N = 10;
const DEPOT_DESTINATION = '__depot_khyayta__';
const EMPTY_CREATE_FORM = { purchaseRequestId: '', depart: '', destination: '', remarque: '' };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function vehicleOptionLabel(v) {
  if (!v) return '';
  const name = [v.marque, v.modele].filter(Boolean).join(' ') || v.vehicule || '';
  const mat = v.matricule || v.matricule_ww || '';
  if (mat && name) return `${mat} — ${name}`;
  return mat || name || v.id || '';
}

/** Uniquement H100, KIA, Ford Transit (parc logistique). */
function isSelectableTripVehicle(v) {
  const hay = [v?.marque, v?.modele, v?.vehicule]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!hay) return false;
  if (hay.includes('h100')) return true;
  if (hay.includes('ford') && hay.includes('transit')) return true;
  if (hay.includes('kia')) return true;
  return false;
}

function buildDriverOptions(employees = []) {
  return (employees || [])
    .filter((e) => isPickupDriverPoste(e.poste))
    .map((emp) => {
      const name = employeeFullName(emp);
      if (!name) return null;
      const poste = String(emp.poste || '').trim();
      return {
        id: String(emp.id),
        name,
        label: poste ? `${name} — ${poste}` : name,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function normQuery(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function DriverSearchSelect({
  value,
  options,
  onChange,
  placeholder = 'Rechercher un chauffeur ou un coursier…',
  disabled = false,
  invalid = false,
  emptyLabel = 'Aucun chauffeur / coursier',
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.name === value || o.label === value);
  const selectedLabel = selected?.label || value || '';

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [open, selectedLabel]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = normQuery(query);
  const browsing = open && (!q || query === selectedLabel);
  const filtered = browsing
    ? options
    : options.filter((o) => normQuery(o.label).includes(q));

  return (
    <div className="log-pickup-search" ref={wrapRef}>
      <input
        className="log-pickup-search-input"
        value={open ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery(selectedLabel);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        style={invalid ? { borderColor: 'var(--red)' } : undefined}
      />
      {open && !disabled && (
        <div className="log-pickup-search-menu" role="listbox">
          {filtered.length === 0 ? (
            <div className="log-pickup-search-option" style={{ color: 'var(--text-3)', cursor: 'default' }}>
              {emptyLabel}
            </div>
          ) : (
            filtered.map((o) => {
              const active = o.name === value || o.label === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`log-pickup-search-option${active ? ' is-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(o.name);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function SuiviReceptions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [recupRow, setRecupRow] = useState(null);
  const [recupForm, setRecupForm] = useState({ chauffeur: '', vehicule: '', date_recuperation: todayISO() });
  const [recupErrors, setRecupErrors] = useState({});
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [deliverRow, setDeliverRow] = useState(null);
  const [daRow, setDaRow] = useState(null);
  const [daData, setDaData] = useState(null);
  const [daLoading, setDaLoading] = useState(false);
  const [daError, setDaError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createErrors, setCreateErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [prOptions, setPrOptions] = useState([]);
  const [projectOptions, setProjectOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listDemandesRecuperationAchats());
    } catch (e) {
      const msg = e?.message || String(e);
      const code = e?.code || '';
      if (
        code === '42P01'
        || /relation ["'].*achat_demandes_recuperation["'] does not exist/i.test(msg)
        || /Could not find the table ['"]public\.achat_demandes_recuperation['"]/i.test(msg)
      ) {
        setError('Table absente — exécutez supabase/RUN_ACHAT_DEMANDES_RECUPERATION.sql dans Supabase.');
      } else if (/statut_check|check constraint/i.test(msg)) {
        setError('Contrainte statut manquante — exécutez le SQL en_cours dans Supabase (CHECK avec en_cours).');
      } else {
        setError(msg);
      }
      setRows([]);
    }
    setLoading(false);
  }, []);

  async function openCreate() {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateErrors({});
    setCreateError('');
    setCreateOpen(true);
    if (prOptions.length && projectOptions.length) return;
    setOptionsLoading(true);
    try {
      const [prs, projects] = await Promise.all([
        listPurchaseRequestsForRecup(),
        listProjectsForRecup(),
      ]);
      setPrOptions(prs.map((pr) => ({
        ...pr,
        name: pr.id,
        label: [pr.ref_demande, pr.titre].filter(Boolean).join(' — ') || pr.id,
      })));
      setProjectOptions(projects);
    } catch (err) {
      const msg = err?.message || String(err);
      setCreateError(/list_purchase_requests_for_recup|list_projects_for_recup|schema cache/i.test(msg)
        ? 'Exécutez supabase/RUN_ACHAT_RECUP_MANUELLE.sql dans Supabase.'
        : msg);
    } finally {
      setOptionsLoading(false);
    }
  }

  function onPickPurchaseRequest(id) {
    const pr = prOptions.find((o) => o.id === id);
    setCreateForm((p) => ({
      ...p,
      purchaseRequestId: id,
      depart: p.depart || pr?.fournisseur_souhaite || '',
    }));
  }

  async function handleCreate(ev) {
    ev.preventDefault();
    const e = {};
    if (!createForm.purchaseRequestId) e.purchaseRequestId = 'Requis';
    if (!createForm.depart.trim()) e.depart = 'Requis';
    if (!createForm.destination) e.destination = 'Requis';
    if (Object.keys(e).length) {
      setCreateErrors(e);
      return;
    }
    const purchaseRequest = prOptions.find((o) => o.id === createForm.purchaseRequestId);
    const project = projectOptions.find((p) => p.id === createForm.destination);
    setSaving(true);
    setCreateError('');
    try {
      await createDemandeRecuperationManuelle({
        purchaseRequest,
        depart: createForm.depart,
        destination: createForm.destination === DEPOT_DESTINATION ? DEPOT_KHYAYTA_LABEL : project?.label,
        destinationProjectId: project?.id || null,
        remarque: createForm.remarque,
      });
      setCreateOpen(false);
      await load();
    } catch (err) {
      const msg = err?.message || 'Erreur enregistrement.';
      setCreateError(/statut_check|check constraint|column .* does not exist|schema cache/i.test(msg)
        ? 'Exécutez supabase/RUN_ACHAT_RECUP_MANUELLE.sql dans Supabase.'
        : msg);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [emps, vehs] = await Promise.all([
          listEmployees().catch(() => []),
          listVehicles().catch(() => []),
        ]);
        if (cancelled) return;
        setDrivers(buildDriverOptions(emps));
        setVehicles((vehs || []).filter(isSelectableTripVehicle));
      } catch {
        if (!cancelled) {
          setDrivers([]);
          setVehicles([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** 10 dernières demandes (déjà triées created_at desc). */
  const recent = useMemo(() => (rows || []).slice(0, LAST_N), [rows]);

  const filtered = useMemo(
    () => filterDemandesRecuperation(recent, { search, statut: filterStatut, date: filterDate }),
    [recent, search, filterStatut, filterDate],
  );
  const kpis = useMemo(() => computeDemandesRecuperationKpis(recent), [recent]);

  function openRecup(row) {
    setRecupRow(row);
    setRecupForm({ chauffeur: '', vehicule: '', date_recuperation: todayISO() });
    setRecupErrors({});
  }

  async function handleConfirmRecup(ev) {
    ev.preventDefault();
    const e = {};
    if (!String(recupForm.chauffeur || '').trim()) e.chauffeur = 'Requis';
    if (!String(recupForm.vehicule || '').trim()) e.vehicule = 'Requis';
    if (Object.keys(e).length) {
      setRecupErrors(e);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await markDemandeRecuperationDone(recupRow.id, recupForm);
      setRecupRow(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Erreur enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelivered() {
    if (!deliverRow) return;
    setSaving(true);
    setError('');
    try {
      await markDemandeRecuperationTraitee(deliverRow.id);
      setDeliverRow(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Erreur enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  async function openDa(row) {
    setDaRow(row);
    setDaData(null);
    setDaError('');
    setDaLoading(true);
    try {
      const da = await getRecupPurchaseRequest(row.id);
      if (!da) setDaError('Demande d’achat introuvable.');
      setDaData(da);
    } catch (err) {
      setDaError(err?.message || 'Impossible de charger la demande d’achat.');
    } finally {
      setDaLoading(false);
    }
  }

  const isATraiter = (r) => r.statut === DEMANDE_RECUP_STATUTS.EN_ATTENTE
    || r.statut === DEMANDE_RECUP_STATUTS.PRETE || r.statut === 'a_recuperer';
  const isEnTransport = (r) => r.statut === DEMANDE_RECUP_STATUTS.EN_TRANSPORT;
  const showDriver = (r) => r.statut === DEMANDE_RECUP_STATUTS.RECUPEREE
    || r.statut === DEMANDE_RECUP_STATUTS.TRAITEE || isEnTransport(r);
  const trajet = (r) => (r.depart || r.destination ? `${r.depart || '—'} → ${r.destination || '—'}` : '—');

  return (
    <div className="animate-fade-in recup-page">
      <div className="page-header recup-header" style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="recup-header-text" style={{ minWidth: 0 }}>
          <h1 className="page-title">Demande de récupération</h1>
          <p className="page-subtitle recup-page-sub">
            Créez une demande (DA, départ, destination). Le magasinier la traite avec chauffeur/coursier et véhicule.
          </p>
        </div>
        <button type="button" className="btn btn-primary recup-new-btn" onClick={openCreate} disabled={saving}>
          <Plus size={15} /> <span className="recup-new-btn-long">Nouvelle demande</span><span className="recup-new-btn-short">Nouvelle</span>
        </button>
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
        <KpiCard icon={<Package size={17} />} label="Total (10 dern.)" value={loading ? '—' : kpis.total} color="grey" />
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
              placeholder="DA, titre, départ, destination…"
              style={{ ...INPUT_STYLE, paddingLeft: 30, minHeight: 36, paddingTop: 7, paddingBottom: 7, fontSize: '0.84rem' }}
            />
          </div>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            style={{ ...SELECT_STYLE, minWidth: 140, maxWidth: 180, minHeight: 36, padding: '7px 10px', fontSize: '0.84rem' }}
          >
            <option value="">Tous les statuts</option>
            <option value={DEMANDE_RECUP_STATUTS.EN_ATTENTE}>{DEMANDE_RECUP_LABEL.en_attente_traitement}</option>
            <option value={DEMANDE_RECUP_STATUTS.EN_TRANSPORT}>{DEMANDE_RECUP_LABEL.en_transport}</option>
            <option value={DEMANDE_RECUP_STATUTS.TRAITEE}>{DEMANDE_RECUP_LABEL.traitee}</option>
            <option value={DEMANDE_RECUP_STATUTS.EN_COURS}>{DEMANDE_RECUP_LABEL.en_cours}</option>
            <option value={DEMANDE_RECUP_STATUTS.PRETE}>{DEMANDE_RECUP_LABEL.prete_a_recuperer}</option>
            <option value={DEMANDE_RECUP_STATUTS.RECUPEREE}>{DEMANDE_RECUP_LABEL.recuperee}</option>
            <option value={DEMANDE_RECUP_STATUTS.ANNULEE}>{DEMANDE_RECUP_LABEL.annulee}</option>
          </select>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ ...INPUT_STYLE, minWidth: 140, maxWidth: 170, minHeight: 36, padding: '7px 10px', fontSize: '0.84rem', width: 'auto' }}
          />
          {(filterStatut || filterDate || search) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setFilterStatut(''); setFilterDate(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.78rem', fontWeight: 600 }}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      <div className="card recup-list-card" style={{ textTransform: 'uppercase' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
            <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck size={22} />}
            title="Aucune demande"
            sub="Cliquez sur « Nouvelle demande » pour créer une demande de récupération."
            action="Nouvelle demande"
            onAction={openCreate}
          />
        ) : (
          <>
            {/* Desktop : tableau */}
            <div className="table-wrap recup-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>Réf.</th>
                    <th>DA</th>
                    <th>Quoi</th>
                    <th>Départ → Destination</th>
                    <th>Statut</th>
                    <th>Chauffeur / Véhicule</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{r.ref}</td>
                      <td style={{ fontWeight: 600 }}>
                        {r.purchase_request_id ? (
                          <button
                            type="button"
                            onClick={() => openDa(r)}
                            title="Voir la demande d’achat"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--red)', fontWeight: 700, textDecoration: 'underline', textTransform: 'inherit', font: 'inherit' }}
                          >
                            {r.purchase_request_ref || 'Voir DA'}
                          </button>
                        ) : (r.purchase_request_ref || '—')}
                      </td>
                      <td style={{ maxWidth: 280, fontSize: '0.84rem' }}>{r.quoi || '—'}</td>
                      <td style={{ maxWidth: 260, fontSize: '0.82rem' }}>{trajet(r)}</td>
                      <td>
                        <span className={`badge ${DEMANDE_RECUP_BADGE[r.statut] || 'badge-grey'}`}>
                          {r.statut_label}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {showDriver(r)
                          ? (
                            <>
                              <div>{r.chauffeur || '—'}</div>
                              <div style={{ color: 'var(--text-3)' }}>{r.vehicule || '—'}</div>
                            </>
                            )
                          : '—'}
                      </td>
                      <td>
                        {isATraiter(r) && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                            onClick={() => openRecup(r)}
                          >
                            <Truck size={13} /> Traiter
                          </button>
                        )}
                        {isEnTransport(r) && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                            onClick={() => setDeliverRow(r)}
                          >
                            <CheckCircle size={13} /> Traitée
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile : 1 ligne par demande */}
            <ul className="recup-mobile-list">
              {filtered.map((r) => (
                <li key={r.id} className="recup-mobile-row">
                  <div className="recup-mobile-main">
                    <div className="recup-mobile-top">
                      <span
                        className="recup-mobile-da"
                        role={r.purchase_request_id ? 'button' : undefined}
                        tabIndex={r.purchase_request_id ? 0 : undefined}
                        onClick={r.purchase_request_id ? () => openDa(r) : undefined}
                      >
                        {r.purchase_request_ref || r.ref}
                      </span>
                      <span className={`badge recup-mobile-badge ${DEMANDE_RECUP_BADGE[r.statut] || 'badge-grey'}`}>
                        {r.statut_label}
                      </span>
                    </div>
                    <span className="recup-mobile-quoi" title={r.quoi}>{r.quoi || '—'}</span>
                    {(r.depart || r.destination) && (
                      <span className="recup-mobile-trajet" title={trajet(r)}>{trajet(r)}</span>
                    )}
                    {showDriver(r) && (r.chauffeur || r.vehicule) && (
                      <span className="recup-mobile-trajet">{[r.chauffeur, r.vehicule].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                  {isATraiter(r) && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm recup-mobile-action"
                      disabled={saving}
                      onClick={() => openRecup(r)}
                    >
                      Traiter
                    </button>
                  )}
                  {isEnTransport(r) && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm recup-mobile-action"
                      disabled={saving}
                      onClick={() => setDeliverRow(r)}
                    >
                      Traitée
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Modal
        open={!!recupRow}
        onClose={() => !saving && setRecupRow(null)}
        title="Traiter — chauffeur et véhicule"
        width={460}
        className="achats-da-uppercase"
      >
        {recupRow && (
          <form onSubmit={handleConfirmRecup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)' }}>
              <strong>{recupRow.purchase_request_ref || recupRow.ref}</strong>
              {recupRow.fournisseur ? ` — ${recupRow.fournisseur}` : ''}
              {(recupRow.depart || recupRow.destination) && (
                <><br />{trajet(recupRow)}</>
              )}
            </p>
            <FField label="Chauffeur / Coursier" required>
              <DriverSearchSelect
                value={recupForm.chauffeur}
                options={drivers}
                invalid={!!recupErrors.chauffeur}
                disabled={saving}
                onChange={(name) => setRecupForm((p) => ({ ...p, chauffeur: name }))}
              />
              {recupErrors.chauffeur && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{recupErrors.chauffeur}</span>}
            </FField>
            <FField label="Véhicule" required>
              <select
                style={{ ...SELECT_STYLE, borderColor: recupErrors.vehicule ? 'var(--red)' : undefined }}
                value={recupForm.vehicule}
                disabled={saving}
                onChange={(e) => setRecupForm((p) => ({ ...p, vehicule: e.target.value }))}
              >
                <option value="">— Sélectionner —</option>
                {vehicles.map((v) => {
                  const label = vehicleOptionLabel(v);
                  return <option key={v.id} value={label}>{label}</option>;
                })}
              </select>
              {recupErrors.vehicule && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{recupErrors.vehicule}</span>}
            </FField>
            <FField label="Date récupération">
              <input
                type="date"
                style={INPUT_STYLE}
                value={recupForm.date_recuperation}
                disabled={saving}
                onChange={(e) => setRecupForm((p) => ({ ...p, date_recuperation: e.target.value }))}
              />
            </FField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setRecupRow(null)}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
                Valider — en cours de transport
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!deliverRow}
        onClose={() => !saving && setDeliverRow(null)}
        title="Confirmer le traitement"
        width={440}
        className="achats-da-uppercase"
      >
        {deliverRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-2)' }}>
              <strong>{deliverRow.purchase_request_ref || deliverRow.ref}</strong>
              {deliverRow.fournisseur ? ` — ${deliverRow.fournisseur}` : ''}
              <br />
              Le transport est terminé : marquer cette demande comme traitée ?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setDeliverRow(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={handleConfirmDelivered}>
                {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
                Traitée
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Nouvelle demande de récupération"
        width={520}
      >
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {createError && (
            <div style={{ background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#C62828' }}>
              {createError}
            </div>
          )}
          <FField label="Demande d’achat" required>
            <DriverSearchSelect
              value={createForm.purchaseRequestId}
              options={prOptions}
              placeholder={optionsLoading ? 'Chargement…' : 'Rechercher une demande d’achat…'}
              emptyLabel="Aucune demande d’achat"
              invalid={!!createErrors.purchaseRequestId}
              disabled={saving || optionsLoading}
              onChange={onPickPurchaseRequest}
            />
            {createErrors.purchaseRequestId && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{createErrors.purchaseRequestId}</span>}
          </FField>
          <FField label="Départ" required>
            <input
              style={{ ...INPUT_STYLE, borderColor: createErrors.depart ? 'var(--red)' : undefined }}
              value={createForm.depart}
              disabled={saving}
              placeholder="Ex. fournisseur, adresse, ville…"
              onChange={(e) => setCreateForm((p) => ({ ...p, depart: e.target.value }))}
            />
            {createErrors.depart && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{createErrors.depart}</span>}
          </FField>
          <FField label="Destination" required>
            <select
              style={{ ...SELECT_STYLE, borderColor: createErrors.destination ? 'var(--red)' : undefined }}
              value={createForm.destination}
              disabled={saving || optionsLoading}
              onChange={(e) => setCreateForm((p) => ({ ...p, destination: e.target.value }))}
            >
              <option value="">— Sélectionner —</option>
              <option value={DEPOT_DESTINATION}>{DEPOT_KHYAYTA_LABEL}</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {createErrors.destination && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{createErrors.destination}</span>}
          </FField>
          <FField label="Remarque">
            <textarea
              style={{ ...INPUT_STYLE, minHeight: 64, resize: 'vertical' }}
              value={createForm.remarque}
              disabled={saving}
              onChange={(e) => setCreateForm((p) => ({ ...p, remarque: e.target.value }))}
            />
          </FField>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setCreateOpen(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || optionsLoading}>
              {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              Créer la demande
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!daRow}
        onClose={() => setDaRow(null)}
        title={`Demande d’achat ${daData?.ref_demande || daRow?.purchase_request_ref || ''}`}
        width={640}
        className="achats-da-uppercase"
      >
        {daLoading ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>
            <Loader2 size={20} className="spin" style={{ margin: '0 auto', display: 'block' }} />
          </div>
        ) : daError ? (
          <p style={{ margin: 0, color: 'var(--red)', fontSize: '0.85rem' }}>{daError}</p>
        ) : daData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {[
                ['Titre', daData.titre],
                ['Projet', [daData.project_ref, daData.project_name].filter(Boolean).join(' — ')],
                ['Priorité', daData.priorite],
                ['Date souhaitée', daData.date_limite],
                ['Demandeur', daData.requester_name],
                ['Fournisseur souhaité', daData.fournisseur_souhaite || daRow?.fournisseur],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ fontWeight: 600 }}>{value || '—'}</div>
                </div>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th>Qté</th>
                    <th>Unité</th>
                  </tr>
                </thead>
                <tbody>
                  {(daData.lines || []).length === 0 ? (
                    <tr><td colSpan={3} style={{ color: 'var(--text-3)' }}>Aucun article</td></tr>
                  ) : (daData.lines || []).map((l, i) => (
                    <tr key={l.id || i}>
                      <td>{l.designation || l.article_name || '—'}</td>
                      <td>{l.quantite ?? l.quantite_demandee ?? '—'}</td>
                      <td>{l.unite || l.unit || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {daData.description && (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>Description</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{daData.description}</div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
