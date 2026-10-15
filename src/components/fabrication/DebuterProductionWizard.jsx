import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2,
} from 'lucide-react';
import {
  FAB_ATELIERS, FAB_MACHINES, FAB_PRIORITES, FAB_UNITES, FAB_OPERATION_STATUTS,
  fabAtelierFullLabel, fabUniteLabel, fabFmtQty, todayISO,
} from '../../constants/fabrication';
import { findStaffOverlaps } from '../../services/fabrication/fabricationProductions';
import { FabModal, FabField, FAB_INPUT, FAB_SELECT, FAB_TEXTAREA, fmtDate } from './shared';
import FilePreviewList from './FilePreview';
import { LibraryStatutBadge } from './LibraryPlanDetail';

const STEPS = ['Plan', 'Désignations', 'Atelier & affectations', 'Dates & validation'];

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

function emptyLine(plan) {
  return {
    key: nextKey(),
    designation: plan ? (plan.designation || plan.nom || '') : '',
    description: '',
    quantite: '1',
    unite: 'unite',
    unite_autre: '',
    atelier: plan?.atelier || '',
    machine_type: plan?.machine_type || '',
  };
}

function emptyOperation() {
  return {
    key: nextKey(), travail: '', responsable_employee_id: '', date_prevue: '', date_limite: '', statut: 'a_faire',
  };
}

export default function DebuterProductionWizard({
  open, onClose, library, staff, projects, initialPlan, draft, saving, onSave,
}) {
  const [step, setStep] = useState(0);
  const [planSearch, setPlanSearch] = useState('');
  const [planId, setPlanId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [lines, setLines] = useState([]);
  const [priorite, setPriorite] = useState('normale');
  const [description, setDescription] = useState('');
  const [atelier, setAtelier] = useState('');
  const [machine, setMachine] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [ouvrierIds, setOuvrierIds] = useState([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [instructions, setInstructions] = useState('');
  const [operations, setOperations] = useState([]);
  const [dateDebut, setDateDebut] = useState(todayISO());
  const [dateLimite, setDateLimite] = useState('');
  const [observations, setObservations] = useState('');
  const [overlaps, setOverlaps] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setPlanSearch('');
    setStaffSearch('');
    setOverlaps({});
    if (draft) {
      setStep(0);
      setPlanId(draft.library_plan_id || '');
      setProjectId(draft.project_id || '');
      setLines((draft.lines || []).map((l) => ({
        key: nextKey(),
        designation: l.designation,
        description: l.description,
        quantite: String(l.quantite),
        unite: l.unite,
        unite_autre: l.unite_autre,
        atelier: l.atelier,
        machine_type: l.machine_type,
      })));
      setPriorite(draft.priorite || 'normale');
      setDescription(draft.description || '');
      setAtelier(draft.atelier || '');
      setMachine(draft.machine_type || '');
      setResponsableId(draft.responsable_employee_id || '');
      setOuvrierIds((draft.ouvriers || []).map((o) => o.employee_id));
      setInstructions(draft.consigne || '');
      setOperations((draft.operations || []).map((o) => ({
        key: nextKey(),
        travail: o.travail,
        responsable_employee_id: o.responsable_employee_id || '',
        date_prevue: o.date_prevue || '',
        date_limite: o.date_limite || '',
        statut: o.statut || 'a_faire',
      })));
      setDateDebut(draft.date_debut_prevue || todayISO());
      setDateLimite(draft.date_fin_prevue || '');
      setObservations(draft.observations || '');
      return;
    }
    setStep(initialPlan ? 1 : 0);
    setPlanId(initialPlan?.id || '');
    setProjectId(initialPlan?.project_id || '');
    setLines(initialPlan ? [emptyLine(initialPlan)] : []);
    setPriorite('normale');
    setDescription('');
    setAtelier(initialPlan?.atelier || '');
    setMachine(initialPlan?.machine_type || '');
    setResponsableId('');
    setOuvrierIds([]);
    setInstructions('');
    setOperations([]);
    setDateDebut(todayISO());
    setDateLimite('');
    setObservations('');
  }, [open, draft, initialPlan]);

  const plan = useMemo(() => library.find((p) => p.id === planId) || null, [library, planId]);
  const project = useMemo(() => projects.find((p) => p.id === projectId) || null, [projects, projectId]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const filteredPlans = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    return library.filter((p) => !q
      || `${p.reference} ${p.nom} ${p.projet_nom} ${p.client_nom}`.toLowerCase().includes(q));
  }, [library, planSearch]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return staff.filter((s) => !q || `${s.nom} ${s.poste} ${s.department}`.toLowerCase().includes(q));
  }, [staff, staffSearch]);

  const busyIds = useMemo(
    () => [...new Set([responsableId, ...ouvrierIds, ...operations.map((o) => o.responsable_employee_id)].filter(Boolean))],
    [responsableId, ouvrierIds, operations],
  );

  useEffect(() => {
    if (!open || step < 2 || !dateDebut || !dateLimite || !busyIds.length) {
      setOverlaps({});
      return undefined;
    }
    let alive = true;
    const t = setTimeout(() => {
      findStaffOverlaps(busyIds, dateDebut, dateLimite, draft?.id || null)
        .then((res) => { if (alive) setOverlaps(res || {}); })
        .catch(() => { if (alive) setOverlaps({}); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [open, step, busyIds, dateDebut, dateLimite, draft?.id]);

  function selectPlan(p) {
    setPlanId(p.id);
    setProjectId(p.project_id || '');
    if (!lines.length || (lines.length === 1 && !lines[0].designation)) setLines([emptyLine(p)]);
    if (!atelier && p.atelier) {
      setAtelier(p.atelier);
      setMachine(p.machine_type || '');
    }
  }

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    if (patch.atelier && !atelier) setAtelier(patch.atelier);
  }

  function updateOperation(key, patch) {
    setOperations((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function toggleOuvrier(id) {
    setOuvrierIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function validateStep(s) {
    if (s === 0 && !planId) return 'Sélectionnez un plan.';
    if (s === 1) {
      if (!projectId) return 'Le projet est obligatoire.';
      if (!lines.length) return 'Ajoutez au moins une désignation.';
      for (let i = 0; i < lines.length; i += 1) {
        const l = lines[i];
        if (!l.designation.trim()) return `Désignation ${i + 1} : libellé obligatoire.`;
        if (!(Number(l.quantite) > 0)) return `Désignation ${i + 1} : quantité obligatoire (> 0).`;
        if (!l.atelier) return `Désignation ${i + 1} : atelier obligatoire.`;
        if (l.unite === 'autre' && !l.unite_autre.trim()) return `Désignation ${i + 1} : précisez l’unité.`;
      }
    }
    if (s === 2 && !atelier) return 'L’atelier principal est obligatoire.';
    if (s === 3) {
      if (!dateDebut) return 'La date de début est obligatoire.';
      if (!dateLimite) return 'La date limite est obligatoire.';
      if (dateLimite < dateDebut) return 'La date limite doit être après la date de début.';
    }
    return '';
  }

  function goNext() {
    const msg = validateStep(step);
    if (msg) { setError(msg); return; }
    setError('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function buildPayload() {
    const resp = responsableId ? staffById.get(responsableId) : null;
    return {
      library_plan_id: planId || null,
      project: project ? { id: project.id, nom: project.nom, ref: project.ref } : null,
      transmetteur_id: plan?.created_by || null,
      transmetteur_nom: plan?.created_by_nom || '',
      lines: lines.map((l) => ({ ...l, quantite: Number(l.quantite) })),
      priorite,
      description,
      observations,
      atelier,
      machine_type: machine,
      responsable: resp,
      ouvriers: ouvrierIds.map((id) => staffById.get(id)).filter(Boolean),
      instructions,
      operations: operations.map((o) => ({
        ...o,
        responsable_nom: staffById.get(o.responsable_employee_id)?.nom || '',
      })),
      date_debut: dateDebut,
      date_limite: dateLimite,
    };
  }

  async function submit(asDraft) {
    if (asDraft) {
      if (!projectId) { setError('Choisissez au moins un plan / projet avant d’enregistrer.'); return; }
      if (!lines.some((l) => l.designation.trim())) { setError('Ajoutez au moins une désignation.'); return; }
    } else {
      for (let s = 0; s < STEPS.length; s += 1) {
        const msg = validateStep(s);
        if (msg) { setError(msg); setStep(s); return; }
      }
    }
    setError('');
    const result = await onSave(buildPayload(), { draft: asDraft, productionId: draft?.id || null });
    if (!result?.success) {
      setError(result?.error || 'Erreur enregistrement.');
      return;
    }
    onClose();
  }

  const overlapCount = Object.keys(overlaps).length;

  return (
    <FabModal open={open} onClose={onClose} title={draft ? `Reprendre le brouillon ${draft.reference}` : 'Débuter une production'} width={880}>
      <div className="fab-steps">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`fab-step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
            onClick={() => (i < step ? setStep(i) : null)}
          >
            <span className="fab-step-num">{i < step ? <Check size={12} /> : i + 1}</span>
            <span className="fab-step-label">{label}</span>
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div>
          <div className="fab-search" style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={15} className="fab-search-icon" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} aria-hidden />
            <input
              style={{ ...FAB_INPUT, paddingLeft: 38 }}
              placeholder="Rechercher par nom du plan, projet, client ou référence"
              value={planSearch}
              onChange={(e) => setPlanSearch(e.target.value)}
            />
          </div>
          {filteredPlans.length === 0 ? (
            <div style={{ fontSize: '0.86rem', color: 'var(--text-3)', padding: 16, textAlign: 'center' }}>
              Aucun plan trouvé. Ajoutez-le d’abord dans « Plans / Projets ».
            </div>
          ) : (
            <div className="fab-plan-pick">
              {filteredPlans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`fab-plan-option${p.id === planId ? ' is-on' : ''}`}
                  onClick={() => selectPlan(p)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{p.nom}</strong>
                    <LibraryStatutBadge statut={p.statut} />
                  </div>
                  <div className="fab-card-meta">{p.reference} · {p.projet_nom || '—'}{p.client_nom ? ` · ${p.client_nom}` : ''}</div>
                  <div className="fab-card-meta">{p.atelier ? fabAtelierFullLabel(p.atelier, p.machine_type) : 'Atelier non défini'} · {(p.files || []).length} fichier(s)</div>
                </button>
              ))}
            </div>
          )}
          {plan ? (
            <div style={{ marginTop: 14 }}>
              <div className="fab-section-title">Aperçu du plan sélectionné</div>
              <FilePreviewList files={plan.files || []} compact />
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div>
          <div className="fab-form-grid" style={{ marginBottom: 14 }}>
            <FabField label="Référence production">
              <input style={FAB_INPUT} value={draft?.reference || 'Attribuée à l’enregistrement'} readOnly disabled />
            </FabField>
            <FabField label="Plan">
              <input style={FAB_INPUT} value={plan ? `${plan.reference} · ${plan.nom}` : '—'} readOnly disabled />
            </FabField>
            <FabField label="Projet" required>
              <select style={FAB_SELECT} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— Choisir —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.ref ? `${p.ref} · ` : ''}{p.nom}</option>)}
              </select>
            </FabField>
            <FabField label="Priorité">
              <select style={FAB_SELECT} value={priorite} onChange={(e) => setPriorite(e.target.value)}>
                {FAB_PRIORITES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </FabField>
            <div className="fab-span-2">
              <FabField label="Description générale">
                <textarea style={{ ...FAB_TEXTAREA, minHeight: 60 }} value={description} onChange={(e) => setDescription(e.target.value)} />
              </FabField>
            </div>
          </div>

          <div className="fab-section-title">Désignations</div>
          {lines.map((l, i) => (
            <div key={l.key} className="fab-line-card">
              <div className="fab-line-head">
                <strong>Désignation {i + 1}</strong>
                {lines.length > 1 ? (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}>
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
              <div className="fab-line-grid">
                <div className="fab-line-wide">
                  <FabField label="Désignation" required>
                    <input style={FAB_INPUT} value={l.designation} onChange={(e) => updateLine(l.key, { designation: e.target.value })} />
                  </FabField>
                </div>
                <FabField label="Quantité" required>
                  <input type="number" min="0" step="any" style={FAB_INPUT} value={l.quantite} onChange={(e) => updateLine(l.key, { quantite: e.target.value })} />
                </FabField>
                <FabField label="Unité">
                  <select style={FAB_SELECT} value={l.unite} onChange={(e) => updateLine(l.key, { unite: e.target.value })}>
                    {FAB_UNITES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </FabField>
                {l.unite === 'autre' ? (
                  <FabField label="Unité (préciser)" required>
                    <input style={FAB_INPUT} value={l.unite_autre} onChange={(e) => updateLine(l.key, { unite_autre: e.target.value })} />
                  </FabField>
                ) : null}
                <FabField label="Atelier" required>
                  <select style={FAB_SELECT} value={l.atelier} onChange={(e) => updateLine(l.key, { atelier: e.target.value, machine_type: '' })}>
                    <option value="">— Choisir —</option>
                    {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </FabField>
                {l.atelier === 'machinerie' ? (
                  <FabField label="Machine">
                    <select style={FAB_SELECT} value={l.machine_type} onChange={(e) => updateLine(l.key, { machine_type: e.target.value })}>
                      <option value="">— Choisir —</option>
                      {FAB_MACHINES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </FabField>
                ) : null}
                <div className="fab-line-wide">
                  <FabField label="Description">
                    <input style={FAB_INPUT} value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} />
                  </FabField>
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines((prev) => [...prev, { ...emptyLine(null), atelier: atelier || '' }])}>
            <Plus size={14} /> Ajouter une désignation
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <div className="fab-form-grid">
            <FabField label="Atelier principal" required>
              <select style={FAB_SELECT} value={atelier} onChange={(e) => { setAtelier(e.target.value); setMachine(''); }}>
                <option value="">— Choisir —</option>
                {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </FabField>
            {atelier === 'machinerie' ? (
              <FabField label="Machine">
                <select style={FAB_SELECT} value={machine} onChange={(e) => setMachine(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {FAB_MACHINES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </FabField>
            ) : <div />}
            <div className="fab-span-2">
              <FabField label="Responsable / chef d’atelier">
                <select style={FAB_SELECT} value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
                  <option value="">— Non défini —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.nom}{s.poste ? ` — ${s.poste}` : ''}</option>)}
                </select>
                <OverlapHint list={overlaps[responsableId]} />
              </FabField>
            </div>
          </div>

          <div className="fab-section-title" style={{ marginTop: 16 }}>Ouvriers affectés ({ouvrierIds.length})</div>
          {ouvrierIds.length ? (
            <div className="fab-newfiles" style={{ marginBottom: 8 }}>
              {ouvrierIds.map((id) => (
                <span key={id} className={`fab-chip${overlaps[id] ? ' is-warn' : ''}`}>
                  {overlaps[id] ? <AlertTriangle size={12} /> : null}
                  {staffById.get(id)?.nom || '—'}
                  <button type="button" onClick={() => toggleOuvrier(id)} aria-label="Retirer">×</button>
                </span>
              ))}
            </div>
          ) : null}
          <input
            style={{ ...FAB_INPUT, marginBottom: 8 }}
            placeholder="Rechercher un employé (nom, poste)"
            value={staffSearch}
            onChange={(e) => setStaffSearch(e.target.value)}
          />
          <div className="fab-staff-list">
            {filteredStaff.map((s) => (
              <label key={s.id} className={`fab-staff-item${ouvrierIds.includes(s.id) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={ouvrierIds.includes(s.id)} onChange={() => toggleOuvrier(s.id)} />
                <span>
                  <strong>{s.nom}</strong>
                  <span className="fab-card-meta" style={{ display: 'block', margin: 0 }}>{s.poste || s.department || '—'}</span>
                </span>
                {overlaps[s.id] && ouvrierIds.includes(s.id) ? <AlertTriangle size={14} color="#E65100" /> : null}
              </label>
            ))}
          </div>
          {!dateLimite ? (
            <div className="fab-card-meta" style={{ marginTop: 6 }}>Les chevauchements de planning s’affichent dès que les dates sont saisies (étape 4).</div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <FabField label="Instructions">
              <textarea style={{ ...FAB_TEXTAREA, minHeight: 60 }} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </FabField>
          </div>

          <div className="fab-section-title" style={{ marginTop: 16 }}>Dispatching par opération (optionnel)</div>
          {operations.map((o) => (
            <div key={o.key} className="fab-line-card">
              <div className="fab-line-grid">
                <div className="fab-line-wide">
                  <FabField label="Travail">
                    <input style={FAB_INPUT} value={o.travail} placeholder="Ex. Découpe, assemblage, finition…" onChange={(e) => updateOperation(o.key, { travail: e.target.value })} />
                  </FabField>
                </div>
                <FabField label="Responsable">
                  <select style={FAB_SELECT} value={o.responsable_employee_id} onChange={(e) => updateOperation(o.key, { responsable_employee_id: e.target.value })}>
                    <option value="">—</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                  </select>
                </FabField>
                <FabField label="Date prévue">
                  <input type="date" style={FAB_INPUT} value={o.date_prevue} onChange={(e) => updateOperation(o.key, { date_prevue: e.target.value })} />
                </FabField>
                <FabField label="Date limite">
                  <input type="date" style={FAB_INPUT} value={o.date_limite} onChange={(e) => updateOperation(o.key, { date_limite: e.target.value })} />
                </FabField>
                <FabField label="Statut">
                  <select style={FAB_SELECT} value={o.statut} onChange={(e) => updateOperation(o.key, { statut: e.target.value })}>
                    {FAB_OPERATION_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </FabField>
              </div>
              <div style={{ textAlign: 'right' }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setOperations((prev) => prev.filter((x) => x.key !== o.key))}>
                  <Trash2 size={13} /> Retirer
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOperations((prev) => [...prev, emptyOperation()])}>
            <Plus size={14} /> Ajouter une opération
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <div className="fab-form-grid">
            <FabField label="Date de début" required>
              <input type="date" style={FAB_INPUT} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
            </FabField>
            <FabField label="Date limite" required>
              <input type="date" style={FAB_INPUT} value={dateLimite} onChange={(e) => setDateLimite(e.target.value)} />
            </FabField>
            <div className="fab-span-2">
              <FabField label="Observations">
                <textarea style={{ ...FAB_TEXTAREA, minHeight: 60 }} value={observations} onChange={(e) => setObservations(e.target.value)} />
              </FabField>
            </div>
          </div>

          {overlapCount ? (
            <div className="fab-overlap-box">
              <div style={{ fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={15} /> Chevauchement de planning (non bloquant)
              </div>
              {Object.entries(overlaps).map(([id, list]) => (
                <div key={id} style={{ marginTop: 4 }}>
                  <strong>{staffById.get(id)?.nom || '—'}</strong> : déjà sur{' '}
                  {list.map((p) => `${p.reference} (${fmtDate(p.date_debut_prevue)} → ${fmtDate(p.date_fin_prevue)})`).join(', ')}
                </div>
              ))}
            </div>
          ) : null}

          <div className="fab-section-title" style={{ marginTop: 16 }}>Récapitulatif</div>
          <div className="fab-recap">
            <div><span>Plan</span>{plan ? `${plan.reference} · ${plan.nom}` : '—'}</div>
            <div><span>Projet</span>{project ? project.nom : '—'}</div>
            <div><span>Atelier</span>{atelier ? fabAtelierFullLabel(atelier, machine) : '—'}</div>
            <div><span>Responsable</span>{staffById.get(responsableId)?.nom || 'Non défini'}</div>
            <div><span>Ouvriers</span>{ouvrierIds.length ? ouvrierIds.map((id) => staffById.get(id)?.nom).filter(Boolean).join(', ') : 'Aucun'}</div>
            <div>
              <span>Désignations</span>
              <div>
                {lines.map((l) => (
                  <div key={l.key}>
                    {l.designation || '—'} — {fabFmtQty(l.quantite)} {fabUniteLabel(l.unite, l.unite_autre)} · {fabAtelierFullLabel(l.atelier, l.machine_type)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div style={{ color: 'var(--red)', fontSize: '0.84rem', marginTop: 12 }}>{error}</div> : null}

      <div className="fab-wizard-foot">
        <button type="button" className="btn btn-ghost" onClick={step === 0 ? onClose : () => { setError(''); setStep((s) => s - 1); }}>
          {step === 0 ? 'Annuler' : (<><ChevronLeft size={14} /> Précédent</>)}
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {step > 0 ? (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => submit(true)}>
              Enregistrer en brouillon
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={goNext}>
              Suivant <ChevronRight size={14} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => submit(false)}>
              {saving ? <Loader2 size={14} /> : null} ENREGISTRER ET DÉBUTER
            </button>
          )}
        </div>
      </div>
    </FabModal>
  );
}

function OverlapHint({ list }) {
  if (!list?.length) return null;
  return (
    <div className="fab-overlap-hint">
      <AlertTriangle size={12} /> Déjà sur {list.map((p) => p.reference).join(', ')} sur la même période
    </div>
  );
}
