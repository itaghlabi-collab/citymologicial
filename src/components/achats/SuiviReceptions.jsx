/**
 * SuiviReceptions.jsx — Demande de récupération (Achats)
 * Source : OP Achats payés → « Prête à récupérer ».
 * Magasinier confirme avec chauffeur/coursier + les 3 véhicules logistique.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardCheck, Search, Loader2, CheckCircle, Package, Truck,
} from 'lucide-react';
import {
  listDemandesRecuperationAchats,
  syncPaidOpsToDemandesRecuperation,
  markDemandeRecuperationDone,
  filterDemandesRecuperation,
  computeDemandesRecuperationKpis,
  DEMANDE_RECUP_STATUTS,
  DEMANDE_RECUP_LABEL,
  DEMANDE_RECUP_BADGE,
} from '../../services/achats/achatDemandesRecuperation';
import { listEmployees, employeeFullName } from '../../services/rh/employees';
import { listVehicles } from '../../services/logistique/vehicles';
import { isPickupDriverPoste } from '../../services/logistique/pickupRequests';
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, FField, Modal,
} from './shared.jsx';

const LAST_N = 10;

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
              Aucun chauffeur / coursier
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

  const load = useCallback(async ({ sync = true } = {}) => {
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
      setLoading(false);
      return;
    }
    setLoading(false);

    if (!sync) return;
    try {
      const touched = await syncPaidOpsToDemandesRecuperation();
      if (touched?.length) {
        setRows(await listDemandesRecuperationAchats());
      }
    } catch (syncErr) {
      const msg = syncErr?.message || String(syncErr);
      const code = syncErr?.code || '';
      if (
        code === '42P01'
        || /relation ["'].*achat_demandes_recuperation["'] does not exist/i.test(msg)
        || /Could not find the table ['"]public\.achat_demandes_recuperation['"]/i.test(msg)
      ) {
        setError('Table absente — exécutez supabase/RUN_ACHAT_DEMANDES_RECUPERATION.sql dans Supabase.');
      } else if (/statut_check|check constraint|23514/i.test(`${msg} ${code}`)) {
        setError('Contrainte statut : ajoutez « en_cours » via SQL Supabase, puis Réessayer.');
      } else {
        console.warn('[CITYMO] sync OP → récupération', syncErr);
      }
    }
  }, []);

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
      await load({ sync: false });
    } catch (err) {
      setError(err?.message || 'Erreur enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  const isPrete = (r) => r.statut === DEMANDE_RECUP_STATUTS.PRETE || r.statut === 'a_recuperer';

  return (
    <div className="animate-fade-in recup-page">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <h1 className="page-title">Demande de récupération</h1>
        <p className="page-subtitle recup-page-sub">
          OP Initié = En cours · OP Payé = À récupérer. Le magasinier confirme avec chauffeur/coursier et véhicule.
        </p>
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
        <KpiCard icon={<ClipboardCheck size={17} />} label="En cours" value={loading ? '—' : kpis.enCours} color="blue" />
        <KpiCard icon={<Truck size={17} />} label="À récupérer" value={loading ? '—' : kpis.aRecuperer} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Récupérées" value={loading ? '—' : kpis.recuperees} color="green" />
      </div>

      <div className="card recup-filters" style={{ padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0, maxWidth: 280 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="DA, OA, titre, fournisseur…"
              style={{ ...INPUT_STYLE, paddingLeft: 30, minHeight: 36, paddingTop: 7, paddingBottom: 7, fontSize: '0.84rem' }}
            />
          </div>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            style={{ ...SELECT_STYLE, minWidth: 140, maxWidth: 180, minHeight: 36, padding: '7px 10px', fontSize: '0.84rem' }}
          >
            <option value="">Tous les statuts</option>
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

      <div className="card recup-list-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
            <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck size={22} />}
            title="Aucune demande"
            sub="Les demandes apparaissent dès qu’un ordre de paiement est Initié ou Payé."
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
                    <th>OA</th>
                    <th>Fournisseur</th>
                    <th>Quoi</th>
                    <th>Statut</th>
                    <th>Chauffeur / Véhicule</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{r.ref}</td>
                      <td style={{ fontWeight: 600 }}>{r.purchase_request_ref || '—'}</td>
                      <td>{r.purchase_oa_ref || '—'}</td>
                      <td>{r.fournisseur || '—'}</td>
                      <td style={{ maxWidth: 280, fontSize: '0.84rem' }}>{r.quoi || '—'}</td>
                      <td>
                        <span className={`badge ${DEMANDE_RECUP_BADGE[r.statut] || 'badge-grey'}`}>
                          {r.statut_label}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {r.statut === DEMANDE_RECUP_STATUTS.RECUPEREE
                          ? (
                            <>
                              <div>{r.chauffeur || '—'}</div>
                              <div style={{ color: 'var(--text-3)' }}>{r.vehicule || '—'}</div>
                            </>
                            )
                          : '—'}
                      </td>
                      <td>
                        {isPrete(r) && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                            onClick={() => openRecup(r)}
                          >
                            <Truck size={13} /> Récupérée
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
                    <span className="recup-mobile-da">{r.purchase_request_ref || r.ref}</span>
                    <span className="recup-mobile-quoi" title={r.quoi}>{r.quoi || '—'}</span>
                  </div>
                  <span className={`badge recup-mobile-badge ${DEMANDE_RECUP_BADGE[r.statut] || 'badge-grey'}`}>
                    {r.statut_label}
                  </span>
                  {isPrete(r) ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm recup-mobile-action"
                      disabled={saving}
                      onClick={() => openRecup(r)}
                      aria-label="Marquer récupérée"
                    >
                      <Truck size={14} />
                    </button>
                  ) : (
                    <span className="recup-mobile-action-spacer" />
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
        title="Confirmer la récupération"
        width={460}
      >
        {recupRow && (
          <form onSubmit={handleConfirmRecup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)' }}>
              <strong>{recupRow.purchase_request_ref || recupRow.ref}</strong>
              {recupRow.fournisseur ? ` — ${recupRow.fournisseur}` : ''}
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
                Valider récupération
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
