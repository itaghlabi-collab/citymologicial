/**
 * projectPlanningExport.js — Export CSV (Excel) planning
 */

function escCsv(val) {
  const s = String(val ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportPlanningTasksCsv(projet, tasks = []) {
  const headers = ['WBS', 'Tâche', 'Lot', 'Début', 'Fin', 'Durée (j)', 'Avancement %', 'Statut', 'Responsable', 'Couleur', 'Notes'];
  const lines = [headers.map(escCsv).join(';')];
  tasks.forEach((t, i) => {
    lines.push([
      i + 1,
      t.nom,
      t.lot,
      t.date_debut,
      t.date_fin,
      t.duree_jours,
      t.avancement,
      t.statut,
      t.responsable,
      t.couleur || '',
      t.notes,
    ].map(escCsv).join(';'));
  });
  downloadBlob(`planning-taches-${projet.ref || projet.id || 'projet'}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
}

export function exportPlanningResourcesCsv(projet, resources = []) {
  const headers = ['Ressource', 'Email', 'Type', 'Taux MAD/h', 'Heures prévues', 'Coût total MAD', 'Tâche liée'];
  const lines = [headers.map(escCsv).join(';')];
  resources.forEach((r) => {
    lines.push([
      r.nom,
      r.email,
      r.type_ressource,
      r.taux_horaire,
      r.heures_prevues,
      r.cout_total,
      r.task_id,
    ].map(escCsv).join(';'));
  });
  downloadBlob(`planning-ressources-${projet.ref || projet.id || 'projet'}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
}

export function exportPlanningMilestonesCsv(projet, milestones = []) {
  const headers = ['Jalon', 'Date', 'Statut', 'Notes'];
  const lines = [headers.map(escCsv).join(';')];
  milestones.forEach((m) => {
    lines.push([m.nom, m.date_jalon, m.statut, m.notes].map(escCsv).join(';'));
  });
  downloadBlob(`planning-jalons-${projet.ref || projet.id || 'projet'}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
}
