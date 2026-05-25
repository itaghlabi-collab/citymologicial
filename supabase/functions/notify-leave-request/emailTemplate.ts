/** Template HTML email CITYMO — nouvelle demande de congé */

function escapeHtml(value: unknown): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pick(leave: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = leave[key];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '—';
}

export function buildLeaveRequestEmailHtml(
  leave: Record<string, unknown>,
  appUrl?: string,
): string {
  const employe = escapeHtml(pick(leave, 'employe_label', 'employe'));
  const type = escapeHtml(pick(leave, 'type'));
  const dateDebut = escapeHtml(pick(leave, 'date_debut', 'dateDebut'));
  const dateFin = escapeHtml(pick(leave, 'date_fin', 'dateFin'));
  const dateRetour = escapeHtml(pick(leave, 'date_retour', 'dateRetour'));
  const jours = escapeHtml(pick(leave, 'jours'));
  const raison = escapeHtml(pick(leave, 'raison'));
  const statut = escapeHtml(pick(leave, 'statut', '_statut') || 'En attente');
  const requestId = escapeHtml(pick(leave, 'id'));

  const ctaBlock = appUrl
    ? `<p style="margin:28px 0 0;text-align:center;">
        <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#C62828;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">
          Ouvrir CITYMO ERP
        </a>
      </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nouvelle demande de congé — CITYMO</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#1F2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#C62828;padding:24px 32px;text-align:center;">
              <div style="font-size:22px;font-weight:800;letter-spacing:0.08em;color:#fff;text-transform:uppercase;">CITYMO</div>
              <div style="font-size:13px;color:#FFCDD2;margin-top:6px;">Plateforme ERP Construction</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:0.03em;">
                Nouvelle demande de congé
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.5;">
                Une demande vient d'être soumise et nécessite votre validation.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
                <tr style="background:#FAFAFA;">
                  <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;width:38%;border-bottom:1px solid #E5E7EB;">Employé</td>
                  <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #E5E7EB;">${employe}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB;">Type de congé</td>
                  <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">${type}</td>
                </tr>
                <tr style="background:#FAFAFA;">
                  <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB;">Date de début</td>
                  <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">${dateDebut}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB;">Date de fin</td>
                  <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">${dateFin}</td>
                </tr>
                <tr style="background:#FAFAFA;">
                  <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB;">Date de retour</td>
                  <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">${dateRetour}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB;">Nombre de jours</td>
                  <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#C62828;border-bottom:1px solid #E5E7EB;">${jours}</td>
                </tr>
                <tr style="background:#FAFAFA;">
                  <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB;">Statut</td>
                  <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">
                    <span style="display:inline-block;background:#FFF3E0;color:#E65100;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">${statut}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;vertical-align:top;">Raison</td>
                  <td style="padding:12px 16px;font-size:14px;color:#374151;line-height:1.5;">${raison}</td>
                </tr>
              </table>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #F3F4F6;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.5;">
                Réf. demande : ${requestId}<br />
                Email automatique CITYMO ERP — ne pas répondre.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildLeaveRequestSubject(leave: Record<string, unknown>): string {
  const employe = pick(leave, 'employe_label', 'employe');
  return `[CITYMO] Nouvelle demande de congé — ${employe}`;
}
