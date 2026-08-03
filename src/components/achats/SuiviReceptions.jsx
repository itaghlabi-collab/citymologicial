/**
 * SuiviReceptions.jsx — Check-list de récupération des Ordres d'achat (Validé).
 * Visibilité uniquement : n'écrit pas dans OA métier / stock / finance.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Eye, Search, Loader2, ChevronLeft, ChevronRight, Package,
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
  KpiCard, EmptyState, SectionTitle, FField, Modal,
} from './shared.jsx';

/** Textes longs : coupe uniquement entre mots (jamais lettre à lettre). */
const SOFT_WRAP = {
  overflowWrap: 'break-word',
  wordBreak: 'normal',
  whiteSpace: 'normal',
  minWidth: 0,
};

function canEditChecklist(role) {
  return role === PURCHASE_ROLES.MAGASINIER
    || role === PURCHASE_ROLES.CHARGEE_ACHATS
    || role === PURCHASE_ROLES.DG;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Enrichissement UI : statut / avancement basés sur les cases (qty technique 0 ou pleine). */
function enrichSuiviRow(row) {
  const lines = (row.lines || []).map((l) => {
    const done = Number(l.qty_retrieved) > 0;
    return {
      ...l,
      done,
      statut_ligne: done ? RETRIEVAL_STATUS.RECUPERE : RETRIEVAL_STATUS.A_RECUPERER,
    };
  });
  const linesTotal = lines.length;
  const linesChecked = lines.filter((l) => l.done).length;
  let statut = RETRIEVAL_STATUS.A_RECUPERER;
  if (linesTotal > 0 && linesChecked > 0 && linesChecked < linesTotal) {
    statut = RETRIEVAL_STATUS.PARTIEL;
  } else if (linesTotal > 0 && linesChecked >= linesTotal) {
    statut = RETRIEVAL_STATUS.RECUPERE;
  }
  const lastRetrieved = lines
    .filter((l) => l.done && l.retrieved_at)
    .sort((a, b) => String(b.retrieved_at).localeCompare(String(a.retrieved_at)))[0];
  return {
    ...row,
    lines,
    titre: row.titre || lines[0]?.designation || row.ref || '—',
    demandeur: row.demandeur || '—',
    date_validation: row.date_validation || row.date_commande || '',
    statut_recuperation: statut,
    lines_checked: linesChecked,
    lines_total: linesTotal,
    avancement_label: `${linesChecked} / ${linesTotal} ligne${linesTotal > 1 ? 's' : ''} récupérée${linesChecked > 1 ? 's' : ''}`,
    articles_restants: Math.max(0, linesTotal - linesChecked),
    derniere_recuperation: lastRetrieved?.retrieved_at || '—',
    confirme_par: lastRetrieved?.retrieved_by || '—',
  };
}

/** qty technique pour l’API existante : 0 (décoché) ou pleine (coché). */
function technicalQty(line, checked) {
  const ordered = Math.max(Number(line.qty_ordered) || 0, 1);
  return {
    qtyRetrieved: checked ? ordered : 0,
    qtyOrdered: ordered,
  };
}

function MetaRow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 34%) 1fr', gap: 8, alignItems: 'start' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '0.88rem', color: 'var(--text)', ...SOFT_WRAP }}>{children}</div>
    </div>
  );
}

function DetailChecklist({ item, canEdit, userName, onSaved, onBack }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(
    (item.lines || []).map((l) => [l.line_id, {
      observation: l.observation || '',
      date: l.retrieved_at || '',
    }]),
  ));
  const [history, setHistory] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setDrafts(Object.fromEntries(
      (item.lines || []).map((l) => [l.line_id, {
        observation: l.observation || '',
        date: l.retrieved_at || '',
      }]),
    ));
  }, [item]);

  function pushHistory({ line, from, to, observation, date }) {
    setHistory((prev) => [{
      id: `${Date.now()}-${line.line_id}`,
      date: date || todayISO(),
      ligne: line.designation || line.line_id,
      ancien: from,
      nouveau: to,
      utilisateur: userName || '—',
      observation: observation || '',
    }, ...prev]);
  }

  async function saveLine(line) {
    if (!canEdit) return;
    const d = drafts[line.line_id] || {};
    const checked = !!line.done;
    const date = (d.date || '').trim() || (checked ? todayISO() : '');
    if (checked && !date) {
      setError('Date de récupération obligatoire pour marquer Récupéré.');
      return;
    }
    if (checked && !(d.date || '').trim()) {
      setDrafts((prev) => ({
        ...prev,
        [line.line_id]: { ...d, date },
      }));
    }
    setBusyId(line.line_id);
    setError('');
    setSuccess('');
    try {
      // qty non saisie : auto 0 / qty_ordered pour compatibilité statut (donnée technique invisible).
      const qty = technicalQty(line, checked);
      await upsertLineRetrieval({
        acquisitionOrderId: item.id,
        lineId: line.line_id,
        qtyRetrieved: qty.qtyRetrieved,
        qtyOrdered: qty.qtyOrdered,
        retrievedBy: userName,
        observation: d.observation,
        retrievedAt: date || null,
      });
      pushHistory({
        line,
        from: checked ? RETRIEVAL_STATUS.A_RECUPERER : RETRIEVAL_STATUS.RECUPERE,
        to: checked ? RETRIEVAL_STATUS.RECUPERE : RETRIEVAL_STATUS.A_RECUPERER,
        observation: d.observation,
        date,
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
    const nextDone = !line.done;
    const currentDraft = drafts[line.line_id] || {};
    const date = (currentDraft.date || '').trim() || (nextDone ? todayISO() : '');
    if (nextDone && !date) {
      setError('Date de récupération obligatoire pour marquer Récupéré.');
      return;
    }
    setDrafts((prev) => ({
      ...prev,
      [line.line_id]: {
        ...(prev[line.line_id] || {}),
        date: nextDone ? (date || todayISO()) : (prev[line.line_id]?.date || ''),
      },
    }));
    setBusyId(line.line_id);
    setError('');
    try {
      const qty = technicalQty(line, nextDone);
      await upsertLineRetrieval({
        acquisitionOrderId: item.id,
        lineId: line.line_id,
        qtyRetrieved: qty.qtyRetrieved,
        qtyOrdered: qty.qtyOrdered,
        retrievedBy: userName,
        observation: currentDraft.observation || '',
        retrievedAt: nextDone ? date : (currentDraft.date || null),
      });
      pushHistory({
        line,
        from: line.done ? RETRIEVAL_STATUS.RECUPERE : RETRIEVAL_STATUS.A_RECUPERER,
        to: nextDone ? RETRIEVAL_STATUS.RECUPERE : RETRIEVAL_STATUS.A_RECUPERER,
        observation: currentDraft.observation || '',
        date: nextDone ? date : (currentDraft.date || todayISO()),
      });
      await onSaved();
    } catch (e) {
      setError(e?.message || 'Enregistrement impossible.');
    } finally {
      setBusyId('');
    }
  }

  const persistedHistory = (item.lines || [])
    .filter((l) => l.retrieved_at || l.retrieved_by || l.observation)
    .map((l) => ({
      id: `persisted-${l.line_id}`,
      date: l.retrieved_at || (l.updated_at ? String(l.updated_at).slice(0, 10) : '—'),
      ligne: l.designation,
      ancien: '—',
      nouveau: l.done ? RETRIEVAL_STATUS.RECUPERE : RETRIEVAL_STATUS.A_RECUPERER,
      utilisateur: l.retrieved_by || '—',
      observation: l.observation || '',
    }));
  const historyRows = [...history, ...persistedHistory];

  return (
    <div className="animate-fade-in suivi-receptions-page">
      <button
        type="button"
        className="btn btn-ghost btn-sm suivi-back-btn"
        onClick={onBack}
        style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ChevronLeft size={16} /> Retour à la liste
      </button>

      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={SOFT_WRAP}>{item.ref}</h1>
        <p className="page-subtitle" style={SOFT_WRAP}>
          {item.titre && item.titre !== item.ref ? `${item.titre} · ` : ''}
          {item.fournisseur} · {item.date_validation || item.date_commande || '—'} ·{' '}
          <span className={`badge ${RETRIEVAL_STATUS_BADGE[item.statut_recuperation] || 'badge-grey'}`}>
            {item.statut_recuperation}
          </span>
          {' · '}{item.avancement_label || `${item.lines_checked || 0} / ${item.lines_total || 0} lignes`}
        </p>
      </div>

      {error && <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--red)', ...SOFT_WRAP }}>{error}</div>}
      {success && <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--green, #1a7f4b)', ...SOFT_WRAP }}>{success}</div>}

      {!canEdit && (
        <div className="card" style={{ padding: 12, marginBottom: 12, fontSize: '0.84rem', color: 'var(--text-2)' }}>
          Consultation seule — la check-list est mise à jour par le magasinier / Achats.
        </div>
      )}

      <div className="card suivi-detail-card" style={{ padding: 20 }}>
        <SectionTitle icon={<ClipboardCheck size={12} />}>Check-list de récupération</SectionTitle>
        {(item.lines || []).length === 0 ? (
          <EmptyState icon={Package} title="Aucune ligne" text="Aucune ligne à récupérer pour cette demande." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {item.lines.map((line) => {
              const d = drafts[line.line_id] || { observation: '', date: '' };
              const Icon = line.done ? CheckSquare : Square;
              const qtyLabel = line.qty_ordered != null && line.qty_ordered !== '' && Number(line.qty_ordered) > 0
                ? `Quantité demandée : ${line.qty_ordered}${line.unite ? ` ${line.unite}` : ''}`
                : null;
              return (
                <div
                  key={line.line_id}
                  className="suivi-line-card"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '14px 16px',
                    background: line.done ? 'rgba(34, 160, 90, 0.06)' : 'var(--surface)',
                  }}
                >
                  <div className="suivi-line-head" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!canEdit || busyId === line.line_id}
                      onClick={() => toggleDone(line)}
                      title={line.done ? 'Marquer non récupéré' : 'Marquer récupéré'}
                      style={{ padding: 6, marginTop: 0, flexShrink: 0, minWidth: 36, minHeight: 36 }}
                    >
                      <Icon size={22} style={{ color: line.done ? 'var(--green, #1a7f4b)' : 'var(--text-3)' }} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', ...SOFT_WRAP }}>{line.designation}</div>
                        <span className={`badge ${RETRIEVAL_STATUS_BADGE[line.statut_ligne] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>
                          {line.statut_ligne || (line.done ? RETRIEVAL_STATUS.RECUPERE : RETRIEVAL_STATUS.A_RECUPERER)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 6, ...SOFT_WRAP }}>
                        {qtyLabel || 'Récupéré'}
                        {line.retrieved_by ? ` · Confirmé par ${line.retrieved_by}` : ''}
                        {line.retrieved_at ? ` · ${line.retrieved_at}` : ''}
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="suivi-line-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
                      <FField label="Date de récupération">
                        <input
                          type="date"
                          value={d.date || ''}
                          onChange={(e) => setDrafts((p) => ({
                            ...p,
                            [line.line_id]: { ...d, date: e.target.value },
                          }))}
                          style={{ ...INPUT_STYLE, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
                        />
                      </FField>
                      <FField label="Observation">
                        <input
                          value={d.observation || ''}
                          onChange={(e) => setDrafts((p) => ({
                            ...p,
                            [line.line_id]: { ...d, observation: e.target.value },
                          }))}
                          style={{ ...INPUT_STYLE, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
                          placeholder="Facultatif"
                        />
                      </FField>
                      <div className="suivi-line-save" style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === line.line_id}
                          onClick={() => saveLine(line)}
                          style={{ width: '100%' }}
                        >
                          {busyId === line.line_id ? '…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!canEdit && line.observation && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: 8, ...SOFT_WRAP }}>
                      Observation : {line.observation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card suivi-detail-card" style={{ padding: 20, marginTop: 16 }}>
        <SectionTitle icon={<ClipboardCheck size={12} />}>Historique</SectionTitle>
        {historyRows.length === 0 ? (
          <div style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucun historique pour le moment.</div>
        ) : (
          <div className="table-wrap" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ligne</th>
                  <th>Ancien statut</th>
                  <th>Nouveau statut</th>
                  <th>Utilisateur</th>
                  <th>Observation</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((h) => (
                  <tr key={h.id}>
                    <td data-label="Date">{h.date}</td>
                    <td data-label="Ligne" style={SOFT_WRAP}>{h.ligne}</td>
                    <td data-label="Ancien">{h.ancien}</td>
                    <td data-label="Nouveau">
                      <span className={`badge ${RETRIEVAL_STATUS_BADGE[h.nouveau] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>
                        {h.nouveau}
                      </span>
                    </td>
                    <td data-label="Utilisateur" style={SOFT_WRAP}>{h.utilisateur}</td>
                    <td data-label="Observation" style={SOFT_WRAP}>{h.observation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  const [actionError, setActionError] = useState('');
  const [role, setRole] = useState(PURCHASE_ROLES.OTHER);
  const [detailId, setDetailId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterFourn, setFilterFourn] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmItem, setConfirmItem] = useState(null);
  const [bulkBusyId, setBulkBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, r] = await Promise.all([
        listSuiviReceptions(),
        resolveCurrentPurchaseRole(user),
      ]);
      setRows((list || []).map(enrichSuiviRow));
      setRole(r);
    } catch (e) {
      const msg = e?.message || String(e);
      if (/purchase_acquisition_order_retrievals|does not exist|42P01|schema cache/i.test(msg)) {
        setError('Table de suivi absente. Exécutez supabase/RUN_SUIVI_RECEPTIONS_OA.sql dans Supabase SQL Editor.');
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

  async function confirmMarkAllRetrieved() {
    if (!confirmItem || bulkBusyId) return;
    const item = confirmItem;
    const pending = (item.lines || []).filter((l) => !l.done);
    if (!pending.length) {
      setConfirmItem(null);
      return;
    }
    setBulkBusyId(item.id);
    setActionError('');
    const date = todayISO();
    try {
      // Réutilise upsertLineRetrieval ligne par ligne (même logique check-list).
      for (const line of pending) {
        const qty = technicalQty(line, true);
        await upsertLineRetrieval({
          acquisitionOrderId: item.id,
          lineId: line.line_id,
          qtyRetrieved: qty.qtyRetrieved,
          qtyOrdered: qty.qtyOrdered,
          retrievedBy: userName,
          observation: line.observation || '',
          retrievedAt: date,
        });
      }
      setConfirmItem(null);
      await load();
    } catch (e) {
      setActionError(e?.message || 'Enregistrement impossible. Réessayez.');
      // Ne ferme pas la modal : statut UI non modifié tant que load() n'a pas réussi.
    } finally {
      setBulkBusyId('');
    }
  }

  function renderQuickRetrieve(item, { mobile = false } = {}) {
    const done = item.statut_recuperation === RETRIEVAL_STATUS.RECUPERE;
    const busy = bulkBusyId === item.id;
    if (!editable) return null;
    if (done) {
      return (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled
          title="Déjà récupéré"
          style={{
            color: 'var(--green, #1a7f4b)',
            minHeight: mobile ? 42 : 36,
            width: mobile ? '100%' : undefined,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: 1,
            cursor: 'default',
          }}
        >
          <CheckSquare size={16} /> {mobile ? 'Récupéré' : null}
        </button>
      );
    }
    return (
      <button
        type="button"
        className={mobile ? 'btn btn-ghost btn-sm' : 'btn btn-ghost btn-sm'}
        disabled={!!bulkBusyId}
        title="Marquer comme récupéré"
        onClick={(e) => {
          e.stopPropagation();
          setActionError('');
          setConfirmItem(item);
        }}
        style={{
          minHeight: mobile ? 42 : 36,
          width: mobile ? '100%' : undefined,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          border: mobile ? '1px solid var(--border)' : undefined,
        }}
      >
        {busy ? <Loader2 size={16} className="cin-spin" /> : <Square size={16} />}
        {mobile ? 'Marquer comme récupéré' : null}
      </button>
    );
  }

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
    <div className="animate-fade-in suivi-receptions-page">
      <style>{`
        .suivi-receptions-page { max-width: 100%; overflow-x: hidden; box-sizing: border-box; }
        .suivi-receptions-page *, .suivi-receptions-page *::before, .suivi-receptions-page *::after { box-sizing: border-box; }
        .suivi-receptions-page .suivi-kpi-grid { margin-bottom: 16px; }
        .suivi-receptions-page .suivi-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .suivi-receptions-page .suivi-filters-search { flex: 1; min-width: 180px; position: relative; }
        .suivi-receptions-page .suivi-filters-search input,
        .suivi-receptions-page .suivi-filters select,
        .suivi-receptions-page .suivi-filters input[type="date"] { width: 100%; max-width: 100%; }
        .suivi-receptions-page .suivi-mobile-list { display: none; }
        .suivi-receptions-page .suivi-desktop-table { display: block; }
        .suivi-receptions-page .suivi-oa-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius, 10px);
          box-shadow: var(--shadow);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .suivi-receptions-page .suivi-oa-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .suivi-receptions-page .suivi-oa-card-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .suivi-receptions-page .suivi-oa-card-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text);
          overflow-wrap: break-word;
          word-break: normal;
          white-space: normal;
        }
        .suivi-receptions-page .suivi-desktop-scroll {
          overflow-x: auto;
          max-width: 100%;
          -webkit-overflow-scrolling: touch;
        }
        .suivi-receptions-page .suivi-oa-table {
          width: 100%;
          min-width: 1445px;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .suivi-receptions-page .suivi-oa-table th,
        .suivi-receptions-page .suivi-oa-table td {
          vertical-align: middle;
          padding: 10px 12px;
          overflow-wrap: break-word;
          word-break: normal;
          white-space: normal;
        }
        .suivi-receptions-page .suivi-oa-table th { white-space: nowrap; }
        .suivi-receptions-page .suivi-col-ref { min-width: 145px; width: 145px; white-space: nowrap !important; }
        .suivi-receptions-page .suivi-col-titre { min-width: 190px; width: 22%; }
        .suivi-receptions-page .suivi-col-fourn { min-width: 170px; width: 16%; }
        .suivi-receptions-page .suivi-col-projet { min-width: 190px; width: 18%; }
        .suivi-receptions-page .suivi-col-date { min-width: 115px; width: 115px; white-space: nowrap !important; }
        .suivi-receptions-page .suivi-col-statut { min-width: 155px; width: 155px; white-space: nowrap !important; }
        .suivi-receptions-page .suivi-col-avanc { min-width: 170px; width: 170px; }
        .suivi-receptions-page .suivi-col-maj { min-width: 160px; width: 160px; white-space: nowrap !important; }
        .suivi-receptions-page .suivi-col-actions { min-width: 150px; width: 150px; white-space: nowrap !important; }
        .suivi-receptions-page .suivi-actions-row {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .suivi-receptions-page .suivi-actions-row .btn {
          min-width: 36px;
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .suivi-receptions-page .suivi-oa-card-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .suivi-receptions-page .suivi-ref-link {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: var(--red);
          font-weight: 700;
          font-family: inherit;
          font-size: inherit;
          text-align: left;
          white-space: nowrap;
        }
        .suivi-receptions-page .suivi-ref-link:hover { text-decoration: underline; }
        @media (max-width: 1024px) {
          .suivi-receptions-page .suivi-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 12px;
          }
        }
        @media (max-width: 768px) {
          .suivi-receptions-page .suivi-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px;
            margin-bottom: 12px;
          }
          .suivi-receptions-page .suivi-kpi-grid .stat-card {
            padding: 12px 10px;
            gap: 8px;
            min-width: 0;
          }
          .suivi-receptions-page .suivi-kpi-grid .stat-icon {
            width: 34px;
            height: 34px;
            border-radius: 8px;
            flex-shrink: 0;
          }
          .suivi-receptions-page .suivi-kpi-grid .stat-icon svg { width: 15px; height: 15px; }
          .suivi-receptions-page .suivi-kpi-grid .stat-value { font-size: 1.25rem; }
          .suivi-receptions-page .suivi-kpi-grid .stat-label { font-size: 0.7rem; line-height: 1.2; }
          .suivi-receptions-page .suivi-filters-card { padding: 12px !important; margin-bottom: 12px !important; }
          .suivi-receptions-page .suivi-filters {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            align-items: stretch;
          }
          .suivi-receptions-page .suivi-filters-search { grid-column: 1 / -1; min-width: 0; }
          .suivi-receptions-page .suivi-filters-projet { grid-column: 1 / -1; }
          .suivi-receptions-page .suivi-filters-reset { grid-column: 1 / -1; }
          .suivi-receptions-page .suivi-filters-reset .btn { width: 100%; min-height: 40px; }
          .suivi-receptions-page .suivi-filters select,
          .suivi-receptions-page .suivi-filters input[type="date"] {
            max-width: none !important;
            min-height: 40px;
          }
          .suivi-receptions-page .suivi-desktop-table { display: none !important; }
          .suivi-receptions-page .suivi-mobile-list {
            display: flex !important;
            flex-direction: column;
            gap: 10px;
          }
          .suivi-receptions-page .suivi-back-btn {
            width: 100%;
            justify-content: center;
            min-height: 42px;
          }
          .suivi-receptions-page .suivi-detail-card { padding: 14px !important; }
          .suivi-receptions-page .suivi-line-card { padding: 12px !important; }
          .suivi-receptions-page .suivi-line-fields {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }
          .suivi-receptions-page .suivi-line-save { width: 100%; }
          .suivi-receptions-page .suivi-line-save .btn { min-height: 42px; }
          .suivi-receptions-page .suivi-oa-card-actions .btn { width: 100%; min-height: 42px; }
        }
        @media (min-width: 1025px) {
          .suivi-receptions-page .suivi-kpi-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
      `}</style>

      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="page-title">SUIVI DES RÉCEPTIONS</h1>
          <p className="page-subtitle" style={SOFT_WRAP}>Check-list de récupération des ordres d'achat validés — visibilité uniquement.</p>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={SOFT_WRAP}>{error}</span>
        </div>
      )}
      {actionError && !confirmItem && (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={SOFT_WRAP}>{actionError}</span>
        </div>
      )}

      <div className="stat-grid suivi-kpi-grid">
        <KpiCard icon={<Package size={17} />} label="À récupérer" value={kpis.a_recuperer} color="orange" />
        <KpiCard icon={<ClipboardCheck size={17} />} label="Partiellement récupérés" value={kpis.partiel} color="blue" />
        <KpiCard icon={<CheckSquare size={17} />} label="Récupérés" value={kpis.recupere} color="green" />
        <KpiCard icon={<Square size={17} />} label="Lignes restant à récupérer" value={kpis.articles_restants} color="red" />
      </div>

      <div className="card suivi-filters-card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div className="suivi-filters">
          <div className="suivi-filters-search">
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Réf. OA, fournisseur, projet…"
              style={{ ...INPUT_STYLE, paddingLeft: 32, width: '100%', maxWidth: '100%' }}
            />
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
          <select
            className="suivi-filters-projet"
            value={filterProjet}
            onChange={(e) => setFilterProjet(e.target.value)}
            style={{ ...SELECT_STYLE, maxWidth: 180 }}
          >
            <option value="">Projet</option>
            {projets.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 150 }} title="Du" aria-label="Date début" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 150 }} title="Au" aria-label="Date fin" />
          <div className="suivi-filters-reset">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setSearch(''); setFilterStatut(''); setFilterFourn(''); setFilterProjet(''); setDateFrom(''); setDateTo(''); }}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: 'var(--text-3)' }}>
          <Loader2 size={18} className="cin-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Aucun ordre à afficher" text="Aucun ordre d'achat Validé ne correspond aux filtres." />
      ) : (
        <>
          <div className="card suivi-desktop-table" style={{ padding: 0 }}>
            <div className="suivi-desktop-scroll">
              <table className="data-table suivi-oa-table">
                <thead>
                  <tr>
                    <th className="suivi-col-ref">Référence OA</th>
                    <th className="suivi-col-titre">Titre</th>
                    <th className="suivi-col-fourn">Fournisseur</th>
                    <th className="suivi-col-projet">Projet</th>
                    <th className="suivi-col-date">Date OA</th>
                    <th className="suivi-col-statut">Statut récupération</th>
                    <th className="suivi-col-avanc">Avancement</th>
                    <th className="suivi-col-maj">Dernière récupération</th>
                    <th className="suivi-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="suivi-col-ref" data-label="Réf. OA">
                        <button type="button" className="suivi-ref-link" onClick={() => setDetailId(r.id)} title="Voir le détail">
                          {r.ref}
                        </button>
                      </td>
                      <td className="suivi-col-titre" data-label="Titre" style={SOFT_WRAP}>{r.titre || '—'}</td>
                      <td className="suivi-col-fourn" data-label="Fournisseur" style={SOFT_WRAP}>{r.fournisseur}</td>
                      <td className="suivi-col-projet" data-label="Projet" style={SOFT_WRAP}>{r.projet}</td>
                      <td className="suivi-col-date" data-label="Date OA">{r.date_validation || r.date_commande || '—'}</td>
                      <td className="suivi-col-statut" data-label="Statut">
                        <span className={`badge ${RETRIEVAL_STATUS_BADGE[r.statut_recuperation] || 'badge-grey'}`} style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                          {r.statut_recuperation}
                        </span>
                      </td>
                      <td className="suivi-col-avanc" data-label="Avancement" style={SOFT_WRAP}>
                        {r.avancement_label || `${r.lines_checked || 0} / ${r.lines_total || 0}`}
                      </td>
                      <td className="suivi-col-maj" data-label="Dernière récup.">{r.derniere_recuperation || '—'}</td>
                      <td className="suivi-col-actions" data-label="Actions">
                        <div className="suivi-actions-row">
                          {renderQuickRetrieve(r)}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDetailId(r.id)}
                            title="Voir le détail"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="suivi-mobile-list">
            {filtered.map((r) => (
              <div key={r.id} className="suivi-oa-card">
                <div className="suivi-oa-card-head">
                  <button type="button" className="suivi-ref-link" onClick={() => setDetailId(r.id)} style={{ whiteSpace: 'normal', ...SOFT_WRAP }}>
                    {r.ref}
                  </button>
                  <span className={`badge ${RETRIEVAL_STATUS_BADGE[r.statut_recuperation] || 'badge-grey'}`} style={{ fontSize: '0.72rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {r.statut_recuperation}
                  </span>
                </div>
                <div className="suivi-oa-card-title">{r.titre || '—'}</div>
                <div className="suivi-oa-card-body">
                  <MetaRow label="Fournisseur">{r.fournisseur || '—'}</MetaRow>
                  <MetaRow label="Projet">{r.projet || '—'}</MetaRow>
                  <MetaRow label="Date OA">{r.date_validation || r.date_commande || '—'}</MetaRow>
                  <MetaRow label="Avancement">{r.avancement_label || `${r.lines_checked || 0} / ${r.lines_total || 0}`}</MetaRow>
                  {r.derniere_recuperation && r.derniere_recuperation !== '—' && (
                    <MetaRow label="Dernière récup.">{r.derniere_recuperation}</MetaRow>
                  )}
                </div>
                <div className="suivi-oa-card-actions">
                  {renderQuickRetrieve(r, { mobile: true })}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setDetailId(r.id)}
                    style={{ width: '100%', minHeight: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    Voir le détail <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal
        open={!!confirmItem}
        onClose={() => {
          if (bulkBusyId) return;
          setConfirmItem(null);
          setActionError('');
        }}
        title="Confirmer la récupération"
        width={480}
      >
        <p style={{ margin: '0 0 12px', fontSize: '0.92rem', lineHeight: 1.45, ...SOFT_WRAP }}>
          Confirmer la récupération complète de cet ordre d&apos;achat ?
          Toutes les lignes seront marquées comme récupérées à la date du jour.
        </p>
        {confirmItem && (
          <p style={{ margin: '0 0 16px', fontSize: '0.84rem', color: 'var(--text-2)', ...SOFT_WRAP }}>
            <strong style={{ color: 'var(--red)' }}>{confirmItem.ref}</strong>
            {confirmItem.titre ? ` — ${confirmItem.titre}` : ''}
          </p>
        )}
        {actionError && (
          <div style={{ marginBottom: 12, color: 'var(--red)', fontSize: '0.84rem', ...SOFT_WRAP }}>{actionError}</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!!bulkBusyId}
            onClick={() => { setConfirmItem(null); setActionError(''); }}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!!bulkBusyId}
            onClick={confirmMarkAllRetrieved}
            style={{ minWidth: 180, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {bulkBusyId ? <Loader2 size={14} className="cin-spin" /> : null}
            Confirmer la récupération
          </button>
        </div>
      </Modal>
    </div>
  );
}
