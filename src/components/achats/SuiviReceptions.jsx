/**
 * SuiviReceptions.jsx — Check-list de récupération des Ordres d'achat (Validé).
 * Visibilité uniquement : n'écrit pas dans OA métier / stock / finance.
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
  KpiCard, EmptyState, SectionTitle, FField,
} from './shared.jsx';

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
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ChevronLeft size={14} /> Retour à la liste
      </button>

      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">{item.ref}</h1>
        <p className="page-subtitle">
          {item.titre && item.titre !== item.ref ? `${item.titre} · ` : ''}
          {item.fournisseur} · {item.date_validation || item.date_commande || '—'} ·{' '}
          <span className={`badge ${RETRIEVAL_STATUS_BADGE[item.statut_recuperation] || 'badge-grey'}`}>
            {item.statut_recuperation}
          </span>
          {' · '}{item.avancement_label || `${item.lines_checked || 0} / ${item.lines_total || 0} lignes`}
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{line.designation}</div>
                        <span className={`badge ${RETRIEVAL_STATUS_BADGE[line.statut_ligne] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>
                          {line.statut_ligne || (line.done ? RETRIEVAL_STATUS.RECUPERE : RETRIEVAL_STATUS.A_RECUPERER)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 2 }}>
                        {qtyLabel || 'Récupéré'}
                        {line.retrieved_by ? ` · Confirmé par ${line.retrieved_by}` : ''}
                        {line.retrieved_at ? ` · ${line.retrieved_at}` : ''}
                      </div>

                      {canEdit && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
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

      <div className="card" style={{ padding: 20, marginTop: 16 }}>
        <SectionTitle icon={<ClipboardCheck size={12} />}>Historique</SectionTitle>
        {historyRows.length === 0 ? (
          <div style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucun historique pour le moment.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
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
                    <td data-label="Ligne">{h.ligne}</td>
                    <td data-label="Ancien">{h.ancien}</td>
                    <td data-label="Nouveau">
                      <span className={`badge ${RETRIEVAL_STATUS_BADGE[h.nouveau] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>
                        {h.nouveau}
                      </span>
                    </td>
                    <td data-label="Utilisateur">{h.utilisateur}</td>
                    <td data-label="Observation">{h.observation || '—'}</td>
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
          <p className="page-subtitle">Check-list de récupération des ordres d'achat validés — visibilité uniquement.</p>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={<Package size={17} />} label="À récupérer" value={kpis.a_recuperer} color="orange" />
        <KpiCard icon={<ClipboardCheck size={17} />} label="Partiellement récupérés" value={kpis.partiel} color="blue" />
        <KpiCard icon={<CheckSquare size={17} />} label="Récupérés" value={kpis.recupere} color="green" />
        <KpiCard icon={<Square size={17} />} label="Lignes restant à récupérer" value={kpis.articles_restants} color="red" />
      </div>

      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf. OA, fournisseur, projet…" style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
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
        <EmptyState icon={ClipboardCheck} title="Aucun ordre à afficher" text="Aucun ordre d'achat Validé ne correspond aux filtres." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence OA</th>
                <th>Titre</th>
                <th>Fournisseur</th>
                <th>Projet</th>
                <th>Date OA</th>
                <th>Statut récupération</th>
                <th>Lignes récupérées</th>
                <th>Dernière récupération</th>
                <th>Confirmé par</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td data-label="Réf. OA"><strong style={{ color: 'var(--red)' }}>{r.ref}</strong></td>
                  <td data-label="Titre">{r.titre || '—'}</td>
                  <td data-label="Fournisseur">{r.fournisseur}</td>
                  <td data-label="Projet">{r.projet}</td>
                  <td data-label="Date OA">{r.date_validation || r.date_commande || '—'}</td>
                  <td data-label="Statut">
                    <span className={`badge ${RETRIEVAL_STATUS_BADGE[r.statut_recuperation] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>
                      {r.statut_recuperation}
                    </span>
                  </td>
                  <td data-label="Avancement">{r.avancement_label || `${r.lines_checked || 0} / ${r.lines_total || 0}`}</td>
                  <td data-label="Dernière récup.">{r.derniere_recuperation || '—'}</td>
                  <td data-label="Confirmé par">{r.confirme_par || '—'}</td>
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
