/**
 * SuiviReceptions.jsx — Demande de récupération (Achats)
 * Source : OP Achats payés → « Prête à récupérer ».
 * Magasinier confirme avec chauffeur + véhicule.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, FField, Modal,
} from './shared.jsx';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function SuiviReceptions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [recupRow, setRecupRow] = useState(null);
  const [recupForm, setRecupForm] = useState({ chauffeur: '', vehicule: '', date_recuperation: todayISO() });
  const [recupErrors, setRecupErrors] = useState({});

  const load = useCallback(async ({ sync = true } = {}) => {
    setLoading(true);
    setError('');
    try {
      // Afficher d’abord la liste — ne pas bloquer sur le backfill OP
      setRows(await listDemandesRecuperationAchats());
    } catch (e) {
      const msg = e?.message || String(e);
      if (/achat_demandes_recuperation|does not exist|42P01|schema cache/i.test(msg)) {
        setError('Table absente — exécutez supabase/RUN_ACHAT_DEMANDES_RECUPERATION.sql dans Supabase.');
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
      const created = await syncPaidOpsToDemandesRecuperation();
      if (created?.length) {
        setRows(await listDemandesRecuperationAchats());
      }
    } catch (syncErr) {
      const msg = syncErr?.message || String(syncErr);
      if (/achat_demandes_recuperation|does not exist|42P01|schema cache/i.test(msg)) {
        setError('Table absente — exécutez supabase/RUN_ACHAT_DEMANDES_RECUPERATION.sql dans Supabase.');
      } else {
        console.warn('[CITYMO] sync OP payés → récupération', syncErr);
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filterDemandesRecuperation(rows, { search, statut: filterStatut }),
    [rows, search, filterStatut],
  );
  const kpis = useMemo(() => computeDemandesRecuperationKpis(rows), [rows]);

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

  const isPrete = (r) => r.statut === DEMANDE_RECUP_STATUTS.PRETE || r.statut === 'a_recuperer';

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">Demande de récupération</h1>
        <p className="page-subtitle">
          Demandes d&apos;achat déjà payées (OP Payé) — prêtes à récupérer. Le magasinier confirme avec chauffeur et véhicule.
        </p>
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
        <KpiCard icon={<ClipboardCheck size={17} />} label="Prêtes à récupérer" value={loading ? '—' : kpis.aRecuperer} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Récupérées" value={loading ? '—' : kpis.recuperees} color="green" />
      </div>

      <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="DA, OA, fournisseur, chauffeur..."
              style={{ ...INPUT_STYLE, paddingLeft: 32 }}
            />
          </div>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, minWidth: 180 }}>
            <option value="">Tous les statuts</option>
            <option value={DEMANDE_RECUP_STATUTS.PRETE}>{DEMANDE_RECUP_LABEL.prete_a_recuperer}</option>
            <option value={DEMANDE_RECUP_STATUTS.RECUPEREE}>{DEMANDE_RECUP_LABEL.recuperee}</option>
            <option value={DEMANDE_RECUP_STATUTS.ANNULEE}>{DEMANDE_RECUP_LABEL.annulee}</option>
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
            sub="Les demandes d’achat apparaissent ici dès que l’ordre de paiement est Payé."
          />
        ) : (
          <div className="table-wrap">
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
        )}
      </div>

      <Modal
        open={!!recupRow}
        onClose={() => !saving && setRecupRow(null)}
        title="Confirmer la récupération"
        width={440}
      >
        {recupRow && (
          <form onSubmit={handleConfirmRecup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)' }}>
              <strong>{recupRow.purchase_request_ref || recupRow.ref}</strong>
              {recupRow.fournisseur ? ` — ${recupRow.fournisseur}` : ''}
            </p>
            <FField label="Chauffeur" required>
              <input
                style={{ ...INPUT_STYLE, borderColor: recupErrors.chauffeur ? 'var(--red)' : undefined }}
                value={recupForm.chauffeur}
                onChange={(e) => setRecupForm((p) => ({ ...p, chauffeur: e.target.value }))}
                placeholder="Nom du chauffeur"
              />
              {recupErrors.chauffeur && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{recupErrors.chauffeur}</span>}
            </FField>
            <FField label="Véhicule" required>
              <input
                style={{ ...INPUT_STYLE, borderColor: recupErrors.vehicule ? 'var(--red)' : undefined }}
                value={recupForm.vehicule}
                onChange={(e) => setRecupForm((p) => ({ ...p, vehicule: e.target.value }))}
                placeholder="Immatricule / véhicule"
              />
              {recupErrors.vehicule && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{recupErrors.vehicule}</span>}
            </FField>
            <FField label="Date récupération">
              <input
                type="date"
                style={INPUT_STYLE}
                value={recupForm.date_recuperation}
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
