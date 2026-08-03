/**
 * SuiviReceptions.jsx — Check-list de récupération des Bons de commande.
 * Visibilité uniquement : n'écrit pas dans purchase_orders / stock / finance.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Eye, Search, Loader2, ChevronLeft, Package,
  CheckSquare, Square, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  listSuiviReceptions,
  filterSuiviReceptions,
  buildSuiviKpis,
  upsertLineRetrieval,
  RETRIEVAL_STATUS,
  RETRIEVAL_STATUS_BADGE,
} from '../../services/achats/purchaseOrderRetrievals';
import {
  resolveCurrentPurchaseRole,
  PURCHASE_ROLES,
} from '../../services/achats/purchaseWorkflowRoles';
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, SectionTitle, FField, formatMAD,
} from './shared.jsx';

function canEditChecklist(role) {
  return role === PURCHASE_ROLES.MAGASINIER
    || role === PURCHASE_ROLES.CHARGEE_ACHATS
    || role === PURCHASE_ROLES.DG;
}

function DetailChecklist({ item, canEdit, userName, onSaved, onBack }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(
    (item.lines || []).map((l) => [l.line_id, {
      qty: l.qty_retrieved,
      observation: l.observation || '',
      date: l.retrieved_at || new Date().toISOString().slice(0, 10),
    }]),
  ));
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function saveLine(line) {
    if (!canEdit) return;
    const d = drafts[line.line_id] || {};
    setBusyId(line.line_id);
    setError('');
    setSuccess('');
    try {
      await upsertLineRetrieval({
        purchaseOrderId: item.id,
        lineId: line.line_id,
        qtyRetrieved: d.qty,
        qtyOrdered: line.qty_ordered,
        retrievedBy: userName,
        observation: d.observation,
        retrievedAt: d.date,
      });
      setSuccess(`Ligne « ${line.designation} » enregistrée.`);
      await onSaved();
    } catch (e) {
      setError(e?.message || 'Enregistrement impossible.');
    } finally {
      setBusyId('');
    }
  }

  async function toggleDone(line) {
    if (!canEdit) return;
    const nextQty = line.done ? 0 : line.qty_ordered;
    setDrafts((prev) => ({
      ...prev,
      [line.line_id]: {
        ...(prev[line.line_id] || {}),
        qty: nextQty,
        date: (prev[line.line_id]?.date) || new Date().toISOString().slice(0, 10),
      },
    }));
    setBusyId(line.line_id);
    setError('');
    try {
      await upsertLineRetrieval({
        purchaseOrderId: item.id,
        lineId: line.line_id,
        qtyRetrieved: nextQty,
        qtyOrdered: line.qty_ordered,
        retrievedBy: userName,
        observation: drafts[line.line_id]?.observation || '',
        retrievedAt: drafts[line.line_id]?.date || new Date().toISOString().slice(0, 10),
      });
      await onSaved();
    } catch (e) {
      setError(e?.message || 'Enregistrement impossible.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ChevronLeft size={14} /> Retour à la liste
      </button>

      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">{item.ref}</h1>
        <p className="page-subtitle">
          {item.fournisseur} · {item.date_commande || '—'} ·{' '}
          <span className={`badge ${RETRIEVAL_STATUS_BADGE[item.statut_recuperation] || 'badge-grey'}`}>
            {item.statut_recuperation}
          </span>
          {' · '}{item.pourcentage}% récupéré
        </p>
      </div>

      {error && <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--red)' }}>{error}</div>}
      {success && <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--green, #1a7f4b)' }}>{success}</div>}

      {!canEdit && (
        <div className="card" style={{ padding: 12, marginBottom: 12, fontSize: '0.84rem', color: 'var(--text-2)' }}>
          Consultation seule — la check-list est mise à jour par le magasinier / Achats.
        </div>
      )}

      <div className="card" style={{ padding: 20 }}>
        <SectionTitle icon={<ClipboardCheck size={12} />}>Check-list de récupération</SectionTitle>
        {(item.lines || []).length === 0 ? (
          <EmptyState icon={Package} title="Aucune ligne article" text="Ce bon de commande n'a pas de lignes à récupérer." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {item.lines.map((line) => {
              const d = drafts[line.line_id] || { qty: line.qty_retrieved, observation: '', date: '' };
              const Icon = line.done ? CheckSquare : Square;
              return (
                <div
                  key={line.line_id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '14px 16px',
                    background: line.done ? 'rgba(34, 160, 90, 0.06)' : 'var(--surface)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!canEdit || busyId === line.line_id}
                      onClick={() => toggleDone(line)}
                      title={line.done ? 'Marquer non récupéré' : 'Marquer récupéré'}
                      style={{ padding: 4, marginTop: 2 }}
                    >
                      <Icon size={20} style={{ color: line.done ? 'var(--green, #1a7f4b)' : 'var(--text-3)' }} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{line.designation}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 2 }}>
                        Commandé : {line.qty_ordered} {line.unite}
                        {line.retrieved_by ? ` · Confirmé par ${line.retrieved_by}` : ''}
                        {line.retrieved_at ? ` · ${line.retrieved_at}` : ''}
                      </div>

                      {canEdit && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
                          <FField label="Quantité récupérée">
                            <input
                              type="number"
                              min="0"
                              max={line.qty_ordered}
                              step="0.01"
                              value={d.qty}
                              onChange={(e) => setDrafts((p) => ({
                                ...p,
                                [line.line_id]: { ...d, qty: e.target.value },
                              }))}
                              style={INPUT_STYLE}
                            />
                          </FField>
                          <FField label="Date de récupération">
                            <input
                              type="date"
                              value={d.date || ''}
                              onChange={(e) => setDrafts((p) => ({
                                ...p,
                                [line.line_id]: { ...d, date: e.target.value },
                              }))}
                              style={INPUT_STYLE}
                            />
                          </FField>
                          <FField label="Observation">
                            <input
                              value={d.observation || ''}
                              onChange={(e) => setDrafts((p) => ({
                                ...p,
                                [line.line_id]: { ...d, observation: e.target.value },
                              }))}
                              style={INPUT_STYLE}
                              placeholder="Facultatif"
                            />
                          </FField>
                          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busyId === line.line_id}
                              onClick={() => saveLine(line)}
                            >
                              {busyId === line.line_id ? '…' : 'Enregistrer'}
                            </button>
                          </div>
                        </div>
                      )}

                      {!canEdit && line.observation && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: 8 }}>
                          Observation : {line.observation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SuiviReceptions() {
  const { user } = useAuth();
  const userName = (user?.nom || user?.email || '').trim();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState(PURCHASE_ROLES.OTHER);
  const [detailId, setDetailId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterFourn, setFilterFourn] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, r] = await Promise.all([
        listSuiviReceptions(),
        resolveCurrentPurchaseRole(user),
      ]);
      setRows(list);
      setRole(r);
    } catch (e) {
      const msg = e?.message || String(e);
      if (/purchase_order_retrievals|does not exist|42P01|schema cache/i.test(msg)) {
        setError('Table de suivi absente. Exécutez supabase/RUN_SUIVI_RECEPTIONS_BC.sql dans Supabase SQL Editor.');
      } else {
        setError(msg);
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => filterSuiviReceptions(rows, {
    statut: filterStatut,
    fournisseur: filterFourn,
    projet: filterProjet,
    dateFrom,
    dateTo,
    search,
  }), [rows, filterStatut, filterFourn, filterProjet, dateFrom, dateTo, search]);

  const kpis = useMemo(() => buildSuiviKpis(filtered), [filtered]);
  const fournisseurs = useMemo(
    () => [...new Set(rows.map((r) => r.fournisseur).filter((x) => x && x !== '—'))].sort(),
    [rows],
  );
  const projets = useMemo(
    () => [...new Set(rows.map((r) => r.projet).filter((x) => x && x !== '—'))].sort(),
    [rows],
  );

  const detail = detailId ? rows.find((r) => r.id === detailId) : null;
  const editable = canEditChecklist(role);

  if (detail) {
    return (
      <DetailChecklist
        item={detail}
        canEdit={editable}
        userName={userName}
        onBack={() => setDetailId(null)}
        onSaved={async () => {
          await load();
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">SUIVI DES RÉCEPTIONS</h1>
          <p className="page-subtitle">Check-list de récupération des bons de commande — visibilité uniquement.</p>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={<Package size={17} />} label="Bons à récupérer" value={kpis.a_recuperer} color="orange" />
        <KpiCard icon={<ClipboardCheck size={17} />} label="Bons partiellement récupérés" value={kpis.partiel} color="blue" />
        <KpiCard icon={<CheckSquare size={17} />} label="Bons récupérés" value={kpis.recupere} color="green" />
        <KpiCard icon={<Square size={17} />} label="Articles restant à récupérer" value={kpis.articles_restants} color="red" />
      </div>

      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf. BC, fournisseur…" style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
            <option value="">Tous</option>
            <option value={RETRIEVAL_STATUS.A_RECUPERER}>{RETRIEVAL_STATUS.A_RECUPERER}</option>
            <option value={RETRIEVAL_STATUS.PARTIEL}>{RETRIEVAL_STATUS.PARTIEL}</option>
            <option value={RETRIEVAL_STATUS.RECUPERE}>{RETRIEVAL_STATUS.RECUPERE}</option>
          </select>
          <select value={filterFourn} onChange={(e) => setFilterFourn(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
            <option value="">Fournisseur</option>
            {fournisseurs.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={filterProjet} onChange={(e) => setFilterProjet(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
            <option value="">Projet</option>
            {projets.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 150 }} title="Du" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 150 }} title="Au" />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(''); setFilterStatut(''); setFilterFourn(''); setFilterProjet(''); setDateFrom(''); setDateTo(''); }}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: 'var(--text-3)' }}>
          <Loader2 size={18} className="cin-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Aucun bon à afficher" text="Aucun bon de commande ne correspond aux filtres." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence BC</th>
                <th>Fournisseur</th>
                <th>Projet</th>
                <th>Date commande</th>
                <th>Montant</th>
                <th>Statut récupération</th>
                <th>% récupéré</th>
                <th>Dernière mise à jour</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td data-label="Réf."><strong style={{ color: 'var(--red)' }}>{r.ref}</strong></td>
                  <td data-label="Fournisseur">{r.fournisseur}</td>
                  <td data-label="Projet">{r.projet}</td>
                  <td data-label="Date">{r.date_commande || '—'}</td>
                  <td data-label="Montant">
                    <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{formatMAD(r.montant)}</span>
                  </td>
                  <td data-label="Statut">
                    <span className={`badge ${RETRIEVAL_STATUS_BADGE[r.statut_recuperation] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>
                      {r.statut_recuperation}
                    </span>
                  </td>
                  <td data-label="%">{r.pourcentage}%</td>
                  <td data-label="Maj">{r.derniere_maj}</td>
                  <td data-label="Actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailId(r.id)} title="Ouvrir la check-list">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
