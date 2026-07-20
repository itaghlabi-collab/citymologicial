/**
 * AttendanceExcelImportWizard — Assistant import pointage.
 * Étapes 1–4 : fichier, chantiers, ouvriers, résumé + import présences/HS.
 * Aucun calcul de salaire dans ce wizard.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, X, FileSpreadsheet, AlertTriangle, CheckCircle2,
  Building2, Warehouse, Factory, Users, CalendarDays, Loader2,
  ChevronRight, ChevronLeft, Clock, UserPlus,
} from 'lucide-react';
import { parseAttendanceExcelFile } from '../../services/rh/attendanceExcelParse';
import {
  buildInitialSiteMappings,
  buildInitialWorkerMappings,
  buildPlannedImportLines,
  summarizeImportValidation,
  buildImportBatchPreview,
} from '../../services/rh/attendanceExcelMatch';
import {
  executeAttendanceExcelImport,
  ensureWorkerAssignedToProject,
} from '../../services/rh/attendanceExcelImport';
import {
  buildCostVentilationPreview,
  detectPayrollConflictsForImport,
  syncPayrollAfterExcelImport,
} from '../../services/rh/attendanceExcelPayrollSync';
import { listWorkerPayroll } from '../../services/rh/workerPayroll';

function fmtDateFr(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function KindBadge({ kind, label }) {
  const styles = {
    project: { bg: '#E3F2FD', color: '#1565C0', Icon: Building2 },
    internal_atelier: { bg: '#FFF3E0', color: '#E65100', Icon: Factory },
    internal_depot: { bg: '#F3E5F5', color: '#6A1B9A', Icon: Warehouse },
    unknown: { bg: '#F5F5F5', color: '#616161', Icon: Building2 },
  };
  const cfg = styles[kind] || styles.unknown;
  const Icon = cfg.Icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, color: cfg.color, borderRadius: 999,
      padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700,
    }}>
      <Icon size={12} /> {label}
    </span>
  );
}

function StatPill({ label, value, warn }) {
  return (
    <div style={{
      background: warn ? '#FFF8E1' : 'var(--bg)',
      border: `1px solid ${warn ? '#FFE082' : 'var(--border)'}`,
      borderRadius: 10, padding: '10px 12px', minWidth: 0,
    }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', color: warn ? '#E65100' : 'inherit' }}>
        {value}
      </div>
    </div>
  );
}

function StepChip({ n, label, active, done }) {
  const bg = active ? 'var(--red)' : done ? '#2E7D32' : 'var(--bg)';
  const color = active || done ? '#fff' : 'var(--text-3)';
  return (
    <span style={{ background: bg, color, borderRadius: 999, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700 }}>
      {n}. {label}
    </span>
  );
}

export default function AttendanceExcelImportWizard({
  open,
  onClose,
  workers: workersProp = [],
  projects = [],
  chefsChantier = [],
  userLabel = '',
  onImported,
}) {
  const inputRef = useRef(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [preview, setPreview] = useState(null);
  const [siteMappings, setSiteMappings] = useState([]);
  const [workerMappings, setWorkerMappings] = useState([]);
  const [localWorkers, setLocalWorkers] = useState(workersProp);
  const [importReport, setImportReport] = useState(null);
  const [payrollMode, setPayrollMode] = useState('sync'); // sync | skip
  const [payrollConflicts, setPayrollConflicts] = useState(null);

  useEffect(() => {
    setLocalWorkers(workersProp);
  }, [workersProp]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const plannedLines = useMemo(
    () => buildPlannedImportLines({
      preview,
      siteMappings,
      workerMappings,
      workers: localWorkers,
      projects,
    }),
    [preview, siteMappings, workerMappings, localWorkers, projects],
  );

  const summary = useMemo(
    () => summarizeImportValidation({
      preview,
      siteMappings,
      workerMappings,
      plannedLines,
    }),
    [preview, siteMappings, workerMappings, plannedLines],
  );

  const batchPreview = useMemo(
    () => (preview ? buildImportBatchPreview(preview, summary, { userLabel }) : null),
    [preview, summary, userLabel],
  );

  const ventilation = useMemo(
    () => buildCostVentilationPreview(plannedLines),
    [plannedLines],
  );

  useEffect(() => {
    if (step !== 4 || !plannedLines.length) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const payroll = await listWorkerPayroll().catch(() => []);
        if (cancelled) return;
        setPayrollConflicts(detectPayrollConflictsForImport({
          plannedLines,
          payrollRecords: payroll,
        }));
      } catch {
        if (!cancelled) setPayrollConflicts(null);
      }
    })();
    return () => { cancelled = true; };
  }, [step, plannedLines]);

  if (!open) return null;

  async function handleFile(file) {
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setError('Formats acceptés : .xlsx ou .xls');
      setPreview(null);
      return;
    }
    setBusy(true);
    setError('');
    setImportReport(null);
    try {
      const result = await parseAttendanceExcelFile(file);
      setPreview(result);
      if (!result.ok) {
        setError(result.error || 'Impossible d’analyser le fichier.');
        setSiteMappings([]);
        setWorkerMappings([]);
        setStep(1);
      } else {
        setSiteMappings(buildInitialSiteMappings(result, projects));
        setWorkerMappings(buildInitialWorkerMappings(result, localWorkers));
        setStep(1);
      }
    } catch (e) {
      setPreview(null);
      setSiteMappings([]);
      setWorkerMappings([]);
      setError(e?.message || 'Erreur de lecture du fichier Excel.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPreview(null);
    setSiteMappings([]);
    setWorkerMappings([]);
    setError('');
    setProgress('');
    setImportReport(null);
    setPayrollMode('sync');
    setPayrollConflicts(null);
    setStep(1);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose?.();
  }

  function setSiteProject(siteKey, projectId) {
    const p = (projects || []).find((x) => String(x.id) === String(projectId));
    setSiteMappings((rows) => rows.map((row) => {
      if (row.key !== siteKey) return row;
      if (!projectId) {
        return {
          ...row,
          projectId: '',
          projectLabel: '',
          status: 'a_resoudre',
          matchScore: 0,
          matchReason: '',
        };
      }
      return {
        ...row,
        projectId: String(projectId),
        projectLabel: p?.nom || p?.ref || String(projectId),
        status: 'manual',
        matchScore: 100,
        matchReason: 'validé utilisateur',
      };
    }));
  }

  function setWorkerLink(key, workerId) {
    const w = (localWorkers || []).find((x) => String(x.id) === String(workerId));
    setWorkerMappings((rows) => rows.map((row) => {
      if (row.key !== key) return row;
      if (!workerId) {
        return {
          ...row,
          action: 'unset',
          workerId: '',
          workerLabel: '',
          status: 'unmatched',
          matchScore: 0,
          matchReason: '',
        };
      }
      return {
        ...row,
        action: 'link',
        workerId: String(workerId),
        workerLabel: `${w?.prenom || ''} ${w?.nom || ''}`.trim(),
        status: 'manual',
        matchScore: 100,
        matchReason: 'validé utilisateur',
      };
    }));
  }

  function setWorkerCreate(key) {
    setWorkerMappings((rows) => rows.map((row) => (
      row.key === key
        ? {
          ...row,
          action: 'create',
          workerId: '',
          workerLabel: '',
          status: 'create',
          matchScore: 0,
          matchReason: 'création à la validation',
        }
        : row
    )));
  }

  async function handleAssignNow(workerId, projectId, workerLabel, projectLabel) {
    if (!workerId || !projectId) return;
    setBusy(true);
    setError('');
    try {
      await ensureWorkerAssignedToProject(projectId, workerId);
      setLocalWorkers((list) => list.map((w) => {
        if (String(w.id) !== String(workerId)) return w;
        const ids = new Set([...(w.assigned_project_ids || []).map(String), String(projectId)]);
        return { ...w, assigned_project_ids: [...ids] };
      }));
      setProgress(`Affecté : ${workerLabel} → ${projectLabel}`);
    } catch (e) {
      setError(e?.message || 'Affectation impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!summary.canValidate) return;
    setBusy(true);
    setError('');
    setProgress('Import présences / HS…');
    try {
      const report = await executeAttendanceExcelImport({
        preview,
        siteMappings,
        workerMappings,
        workers: localWorkers,
        projects,
        chefsChantier,
        onProgress: (p) => setProgress(p.message || ''),
      });

      let payrollSync = { skipped: true };
      if (payrollMode === 'sync') {
        setProgress('Sync paiement hebdomadaire (moteur ERP)…');
        payrollSync = await syncPayrollAfterExcelImport({
          mode: 'sync',
          importMeta: {
            batchId: report.batchId,
            ref: report.ref,
            source: 'excel',
            note: `Import Excel ${report.ref}`,
          },
        });
      }

      const fullReport = { ...report, payrollSync };
      setImportReport(fullReport);
      setProgress('');
      onImported?.(fullReport);
    } catch (e) {
      setError(e?.message || 'Échec de l’import.');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  function canGoStep2() { return Boolean(preview?.ok); }
  function canGoStep3() { return canGoStep2(); }
  function canGoStep4() {
    return workerMappings.every((w) => (
      (w.action === 'link' && w.workerId) || w.action === 'create'
    ));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9200,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 12,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) handleClose(); }}
    >
      <div
        className="card"
        style={{
          width: 'min(980px, 100%)',
          maxHeight: 'min(92vh, 920px)',
          overflow: 'auto',
          borderRadius: 14,
          padding: 0,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: '#fff', zIndex: 2,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>
              Importer un pointage Excel
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 2 }}>
              Présences + HS uniquement — la paie reste gérée par les services RH existants
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleClose} disabled={busy} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <StepChip n={1} label="Fichier" active={step === 1} done={step > 1} />
            <StepChip n={2} label="Chantiers" active={step === 2} done={step > 2} />
            <StepChip n={3} label="Ouvriers" active={step === 3} done={step > 3} />
            <StepChip n={4} label="Résumé" active={step === 4} done={Boolean(importReport)} />
          </div>

          {step === 1 && (
            <>
              <div style={{
                border: '1.5px dashed var(--border)', borderRadius: 12, padding: '20px 16px',
                textAlign: 'center', background: 'var(--bg)', marginBottom: 16,
              }}>
                <FileSpreadsheet size={28} style={{ color: 'var(--red)', marginBottom: 8 }} />
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Sélectionner un fichier .xlsx / .xls</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginBottom: 12 }}>
                  Semaine lue dans le contenu du fichier uniquement.
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => inputRef.current?.click()} style={{ minHeight: 44 }}>
                  {busy ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
                  {busy ? 'Analyse…' : 'Choisir un fichier'}
                </button>
                {preview?.fileName && (
                  <div style={{ marginTop: 10, fontSize: '0.82rem' }}>Fichier : <strong>{preview.fileName}</strong></div>
                )}
              </div>

              {preview?.week && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14,
                  padding: '10px 12px', background: '#E8F5E9', border: '1px solid #A5D6A7',
                  borderRadius: 10, fontSize: '0.88rem', color: '#1B5E20',
                }}>
                  <CalendarDays size={16} />
                  <strong>Semaine :</strong>
                  <span>{fmtDateFr(preview.week.debut)} → {fmtDateFr(preview.week.fin)}</span>
                </div>
              )}

              {preview?.stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                  <StatPill label="Blocs" value={preview.stats.siteCount} />
                  <StatPill label="Ouvriers" value={preview.stats.workerCount} />
                  <StatPill label="Présences" value={preview.stats.presenceCount} />
                  <StatPill label="HS (>8h)" value={preview.stats.overtimeHintCount} />
                  <StatPill label="Redirections" value={preview.stats.redirectCount} />
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: 12 }}>
                Aucun projet / chantier / centre n’est créé automatiquement. Les suggestions partielles restent
                <strong> À résoudre</strong> jusqu’à validation manuelle (ex. BENSOUDA2).
              </p>
              <div className="att-xlsx-sites-table table-wrap" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--border)' }}>
                      {['Bloc Excel', 'Type', 'Projet ERP existant', 'Statut'].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {siteMappings.map((s) => (
                      <tr key={s.key} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 700 }}>{s.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                            {s.responsable ? `Resp. ${s.responsable}` : '—'}
                            {s.redirectOnly ? ' · via redirection cellule' : ''}
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px' }}><KindBadge kind={s.kind} label={s.affectationLabel} /></td>
                        <td style={{ padding: '8px 10px', minWidth: 220 }}>
                          <select
                            className="crm-filter-select"
                            style={{ width: '100%', minHeight: 40 }}
                            value={s.projectId || ''}
                            onChange={(e) => setSiteProject(s.key, e.target.value)}
                          >
                            <option value="">À résoudre — choisir un projet…</option>
                            {(projects || []).map((p) => (
                              <option key={p.id} value={p.id}>{p.nom || p.ref}</option>
                            ))}
                          </select>
                          {!s.projectId && s.suggestions?.[0] && (
                            <div style={{ fontSize: '0.72rem', color: '#E65100', marginTop: 4 }}>
                              Suggestion (non appliquée) : {s.suggestions[0].projectLabel} — {s.suggestions[0].reason}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '0.8rem' }}>
                          {s.projectId
                            ? <span style={{ color: '#2E7D32', fontWeight: 700 }}>Validé</span>
                            : <span style={{ color: '#C62828', fontWeight: 700 }}>À résoudre</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="att-xlsx-sites-cards" style={{ display: 'none', flexDirection: 'column', gap: 10 }}>
                {siteMappings.map((s) => (
                  <div key={`card-${s.key}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <strong>{s.title}</strong>
                      <KindBadge kind={s.kind} label={s.affectationLabel} />
                    </div>
                    <select
                      className="crm-filter-select"
                      style={{ width: '100%', minHeight: 44 }}
                      value={s.projectId || ''}
                      onChange={(e) => setSiteProject(s.key, e.target.value)}
                    >
                      <option value="">À résoudre — choisir un projet…</option>
                      {(projects || []).map((p) => (
                        <option key={p.id} value={p.id}>{p.nom || p.ref}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: 12 }}>
                Matching CIN → téléphone → nom. Seul un ouvrier peut être créé explicitement — jamais un chantier.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {workerMappings.map((w) => (
                  <div key={w.key} style={{
                    border: '1px solid var(--border)', borderRadius: 12, padding: 12,
                    background: w.status === 'uncertain' ? '#FFF8E1' : '#fff',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <div>
                        <strong>{w.excelName}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                          {w.matchReason || 'non reconnu'}
                          {w.status === 'uncertain' ? ' · incertaine' : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`btn btn-sm ${w.action === 'create' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setWorkerCreate(w.key)}
                      >
                        <UserPlus size={14} /> Créer l’ouvrier
                      </button>
                    </div>
                    {w.action !== 'create' ? (
                      <select
                        className="crm-filter-select"
                        style={{ width: '100%', minHeight: 44 }}
                        value={w.workerId || ''}
                        onChange={(e) => setWorkerLink(w.key, e.target.value)}
                      >
                        <option value="">Associer à un ouvrier ERP…</option>
                        {(localWorkers || []).map((x) => {
                          const id = String(x.id);
                          const label = `${x.prenom || ''} ${x.nom || ''}`.trim() || id;
                          const sug = (w.suggestions || []).find((s) => s.workerId === id);
                          return (
                            <option key={id} value={id}>
                              {label}{sug ? ` — ${sug.reason} (${sug.score}%)` : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div style={{ fontSize: '0.84rem', color: '#1565C0', fontWeight: 600 }}>
                        Création à l’import (nom Excel) — aucun projet créé.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              {batchPreview && (
                <div style={{
                  marginBottom: 14, padding: '12px 14px', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Historique prévu</div>
                  <div style={{ fontSize: '0.84rem', display: 'grid', gap: 4 }}>
                    <div>Réf. : <strong>{importReport?.ref || batchPreview.refPreview}</strong></div>
                    <div>Semaine : {fmtDateFr(batchPreview.weekDebut)} → {fmtDateFr(batchPreview.weekFin)}</div>
                    <div>Lignes prêtes : {summary.readyCount} / {summary.plannedCount}</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
                <StatPill label="Ouvriers reconnus" value={summary.workersRecognized} />
                <StatPill label="Ouvriers inconnus" value={summary.workersUnknown} warn={summary.workersUnknown > 0} />
                <StatPill label="Projets validés" value={summary.projectsRecognized} />
                <StatPill label="Chantiers à résoudre" value={summary.projectsUnknown} warn={summary.projectsUnknown > 0} />
                <StatPill label="Atelier/Dépôt" value={summary.costCenterCount} />
                <StatPill label="Non affectés" value={summary.unassignedCount} warn={summary.unassignedCount > 0} />
                <StatPill label="Redirections" value={summary.redirectCount} />
                <StatPill label="HS détectées" value={summary.overtimeCount} />
                <StatPill label="Anomalies" value={summary.anomalyCount} warn={summary.anomalyCount > 0} />
              </div>

              {summary.unassignedPairs?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Affectations manquantes</div>
                  {summary.unassignedPairs.map((p) => (
                    <div
                      key={`${p.workerId}-${p.projectId}`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
                        alignItems: 'center', padding: '10px 12px', marginBottom: 6,
                        border: '1px solid #FFE082', borderRadius: 10, background: '#FFF8E1',
                      }}
                    >
                      <div style={{ fontSize: '0.84rem' }}>
                        <strong>{p.workerLabel}</strong> — projet reconnu <strong>{p.projectLabel}</strong>
                        <div style={{ color: '#E65100', fontWeight: 700 }}>non affecté</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => handleAssignNow(p.workerId, p.projectId, p.workerLabel, p.projectLabel)}
                      >
                        Affecter maintenant
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {summary.overtimeDetails?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={15} /> HS détectées (module Heures supplémentaires)
                  </div>
                  <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 480 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          {['Ouvrier', 'Jour', 'Date', 'HS', 'Chantier'].map((h) => (
                            <th key={h} style={{ padding: '7px 8px', textAlign: 'left', color: 'var(--text-3)', fontSize: '0.68rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summary.overtimeDetails.map((l) => (
                          <tr key={`hs-${l.key}`} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '7px 8px' }}>{l.workerExcelName}</td>
                            <td style={{ padding: '7px 8px' }}>{l.dayLabel}</td>
                            <td style={{ padding: '7px 8px' }}>{fmtDateFr(l.date)}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 700 }}>{l.overtimeHours} h</td>
                            <td style={{ padding: '7px 8px' }}>{l.projectLabel || l.siteTitle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={15} /> Futures présences ({plannedLines.length})
                </div>
                <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: 280, border: '1px solid var(--border)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 720 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', position: 'sticky', top: 0 }}>
                        {['Ouvrier', 'Date', 'Chantier', 'Statut', 'H. norm.', 'HS', 'État'].map((h) => (
                          <th key={h} style={{ padding: '7px 8px', textAlign: 'left', color: 'var(--text-3)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plannedLines.map((l) => (
                        <tr key={l.key} style={{ borderTop: '1px solid var(--border)', background: l.ready ? undefined : '#FFEBEE' }}>
                          <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{l.workerExcelName}</td>
                          <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{fmtDateFr(l.date)}</td>
                          <td style={{ padding: '7px 8px' }}>
                            {l.projectLabel || l.siteTitle}
                            {l.redirectedFromBlock ? ' ↩' : ''}
                          </td>
                          <td style={{ padding: '7px 8px' }}>{l.statut}</td>
                          <td style={{ padding: '7px 8px' }}>{l.statut === 'present' ? l.normalHours : '—'}</td>
                          <td style={{ padding: '7px 8px' }}>{l.overtimeHours || '—'}</td>
                          <td style={{ padding: '7px 8px', fontWeight: 700, color: l.ready ? '#2E7D32' : '#C62828' }}>
                            {l.ready ? 'OK' : (l.blockingReason || 'À résoudre')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {summary.anomalies?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {summary.anomalies.map((a, i) => (
                    <div
                      key={`${a.code}-${i}`}
                      style={{
                        fontSize: '0.82rem', padding: '8px 10px', borderRadius: 8, marginBottom: 6,
                        background: a.level === 'error' ? '#FFEBEE' : '#FFF8E1',
                        color: a.level === 'error' ? '#C62828' : '#E65100',
                        border: `1px solid ${a.level === 'error' ? '#EF9A9A' : '#FFE082'}`,
                      }}
                    >
                      {a.message}
                    </div>
                  ))}
                </div>
              )}

              {ventilation.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Ventilation des coûts (jours — informatif)</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 8 }}>
                    1 sync paie ERP = lignes officielles ouvrier×chantier×semaine (structure actuelle).
                    Atelier / Dépôt = charges internes, exclus des KPI marge chantier.
                    Aucun montant recalculé ici.
                  </div>
                  {ventilation.slice(0, 12).map((v) => (
                    <div key={v.workerId || v.workerLabel} style={{
                      border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 8, fontSize: '0.82rem',
                    }}>
                      <strong>{v.workerLabel}</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {v.parts.map((p) => (
                          <span
                            key={`${p.projectId || p.label}`}
                            style={{
                              background: p.isInternal ? '#F3E5F5' : '#E3F2FD',
                              color: p.isInternal ? '#6A1B9A' : '#1565C0',
                              borderRadius: 999, padding: '3px 8px', fontWeight: 700, fontSize: '0.72rem',
                            }}
                          >
                            {p.label}: {p.pct}% ({p.days}j){p.isInternal ? ' · interne' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {payrollConflicts?.alreadySynced && (
                <div style={{
                  marginBottom: 14, padding: 12, borderRadius: 10,
                  border: '1px solid #FFE082', background: '#FFF8E1', fontSize: '0.84rem',
                }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Cette semaine est déjà synchronisée</div>
                  {payrollConflicts.hasPaid && (
                    <div style={{ color: '#C62828', marginBottom: 6 }}>
                      {payrollConflicts.paid.length} ligne(s) déjà <strong>Payée(s)</strong> — le moteur ERP ne les modifiera jamais.
                    </div>
                  )}
                  {payrollConflicts.hasPending && (
                    <div style={{ marginBottom: 6 }}>
                      {payrollConflicts.pending.length} ligne(s) en attente / brouillon — « Remplacer » = mise à jour via le sync officiel.
                    </div>
                  )}
                </div>
              )}

              {!importReport && (
                <div style={{ marginBottom: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Paiement hebdomadaire (étape 4)</div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: '0.84rem' }}>
                    <input
                      type="radio"
                      name="payrollMode"
                      checked={payrollMode === 'sync'}
                      onChange={() => setPayrollMode('sync')}
                    />
                    <span>
                      <strong>Remplacer / synchroniser</strong> — exécute uniquement
                      <code style={{ marginLeft: 4 }}>syncWorkerPayrollFromAttendance</code>
                      (aucune formule parallèle). Les lignes Payées sont ignorées.
                    </span>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.84rem' }}>
                    <input
                      type="radio"
                      name="payrollMode"
                      checked={payrollMode === 'skip'}
                      onChange={() => setPayrollMode('skip')}
                    />
                    <span>
                      <strong>Ignorer</strong> — crée présences + HS seulement, sans sync paie.
                    </span>
                  </label>
                </div>
              )}

              {importReport && (
                <div style={{
                  marginBottom: 12, padding: '12px', borderRadius: 10,
                  background: importReport.errors?.length ? '#FFF8E1' : '#E8F5E9',
                  border: `1px solid ${importReport.errors?.length ? '#FFE082' : '#A5D6A7'}`,
                  fontSize: '0.85rem',
                }}>
                  <div style={{ fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} /> Import {importReport.ref}
                  </div>
                  <div>Présences créées : {importReport.attendances}</div>
                  <div>HS créées : {importReport.overtimes}</div>
                  <div>Ouvriers créés : {importReport.createdWorkers}</div>
                  <div>Affectations : {importReport.assignments}</div>
                  <div>Ignorées (doublons présence) : {importReport.skipped}</div>
                  {importReport.payrollSync && (
                    <div style={{ marginTop: 6 }}>
                      Sync paie :{' '}
                      {importReport.payrollSync.skipped
                        ? 'ignorée'
                        : `créées ${importReport.payrollSync.created || 0}, maj ${importReport.payrollSync.updated || 0}, payées ignorées ${importReport.payrollSync.skippedPaid || 0}`}
                    </div>
                  )}
                  {importReport.errors?.length > 0 && (
                    <div style={{ marginTop: 8, color: '#C62828' }}>
                      {importReport.errors.slice(0, 8).map((e, i) => (
                        <div key={i}>{e.type}: {e.worker || e.name || ''} — {e.message}</div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 8, color: 'var(--text-3)' }}>
                    Prochaine étape : valider le paiement hebdo RH → caisse « Main d&apos;œuvre » ;
                    chantiers clients → dépense projet ; ATELIER / DÉPÔT → dépense générale
                    « Main-d&apos;œuvre interne » (hors projet / hors KPI chantier).
                  </div>
                </div>
              )}
            </>
          )}

          {(error || progress) && (
            <div style={{
              marginTop: 8, fontSize: '0.84rem',
              color: error ? '#C62828' : 'var(--text-2)',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              {busy && <Loader2 size={14} className="spin" />}
              {error || progress}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          position: 'sticky', bottom: 0, background: '#fff',
        }}>
          <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy || !preview}>
            Réinitialiser
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={busy}>Fermer</button>
            {step > 1 && !importReport && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft size={15} /> Retour
              </button>
            )}
            {step < 4 && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  busy
                  || (step === 1 && !canGoStep2())
                  || (step === 2 && !canGoStep3())
                  || (step === 3 && !canGoStep4())
                }
                onClick={() => setStep((s) => s + 1)}
              >
                Continuer <ChevronRight size={15} />
              </button>
            )}
            {step === 4 && !importReport && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !summary.canValidate}
                onClick={handleImport}
              >
                {busy ? <Loader2 size={15} className="spin" /> : null}
                Créer les présences & HS
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
