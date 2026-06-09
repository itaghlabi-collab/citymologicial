/**
 * ocrAudit.js — Rapport d'audit OCR CIN (diagnostic, pas de modification workflow scan).
 */
import { pickMindeeValue } from './cinOcr';

function snapMindeeFields(fields) {
  if (!fields || typeof fields !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    const val = pickMindeeValue(v);
    if (val) out[k] = val.length > 200 ? val.slice(0, 200) + '…' : val;
  }
  return out;
}

function inferRootCause(ctx) {
  if (ctx.mindee_config_blocked) {
    return {
      category: 'config',
      reason: ctx.config_error || 'MINDEE_MODEL_ID manquant (clé md_*) — aucun appel HTTP Mindee.',
    };
  }
  if (!ctx.mindee_http_called) {
    return {
      category: 'config',
      reason: ctx.backend_errors?.[0] || 'Mindee non appelé (clé absente, provider désactivé ou erreur avant fetch).',
    };
  }
  if (!ctx.mindee_recto_ok) {
    return {
      category: 'api',
      reason: ctx.backend_errors?.join(' | ') || 'Appel Mindee recto sans champs extraits.',
    };
  }
  if (ctx.verso_required && !ctx.mindee_verso_ok) {
    return {
      category: 'api',
      reason: 'Verso envoyé mais Mindee verso sans champs — adresse/MRZ via Tesseract (moins fiable).',
    };
  }
  if (ctx.provider_final === 'tesseract') {
    return {
      category: 'fallback',
      reason: 'Fallback Tesseract actif malgré configuration Mindee.',
    };
  }
  if (ctx.mapping_mismatch) {
    return {
      category: 'mapping',
      reason: 'Mindee a répondu mais le mapping final diffère des champs bruts (given_names / address).',
    };
  }
  return { category: 'unknown', reason: 'Audit incomplet — activer citymo_ocr_debug=1 et rescanner.' };
}

/**
 * Construit le rapport d'audit complet affiché en console et dans scanCIN._ocr_audit.
 */
export function buildOcrAuditReport(ctx) {
  const mindeeReallyUsed = Boolean(
    ctx.mindee_recto_ok
    && (ctx.provider_final === 'mindee' || ctx.provider_final === 'mindee_partial'),
  );
  const mindeePartial = Boolean(ctx.mindee_recto_ok && ctx.provider_final === 'mindee_partial');

  const mindeeSnapRecto = snapMindeeFields(ctx.mindee_raw_recto);
  const mindeeSnapVerso = snapMindeeFields(ctx.mindee_raw_verso);

  const mappingMismatch = (() => {
    if (!mindeeSnapRecto) return false;
    const g = mindeeSnapRecto.given_names || mindeeSnapRecto.given_name || mindeeSnapRecto.first_name || '';
    const p = ctx.final_form?.prenom || '';
    if (g && p && g.trim().toUpperCase() !== p.trim().toUpperCase()
      && !g.toUpperCase().includes(p.toUpperCase())
      && !p.toUpperCase().includes(g.split(/\s+/)[0]?.toUpperCase() || '')) {
      return true;
    }
    const addr = mindeeSnapVerso?.address || mindeeSnapVerso?.street || '';
    const fa = ctx.final_form?.adresse || '';
    if (addr && fa && !fa.toUpperCase().includes(String(addr).slice(0, 8).toUpperCase())) return true;
    return false;
  })();

  const root = inferRootCause({ ...ctx, mapping_mismatch: mappingMismatch });

  const report = {
    generated_at: new Date().toISOString(),
    verdict: {
      mindee_really_used: mindeeReallyUsed,
      mindee_partial: mindeePartial,
      provider_final: ctx.provider_final || 'unknown',
      root_cause_category: root.category,
      root_cause: root.reason,
    },
    vercel_runtime: {
      note: 'Variables lues côté serveur Vercel uniquement (pas accessibles au navigateur).',
      OCR_PROVIDER: ctx.diagnostics?.OCR_PROVIDER || null,
      key_type: ctx.diagnostics?.key_type || null,
      has_MINDEE_MODEL_ID: ctx.diagnostics?.has_MINDEE_MODEL_ID ?? null,
      mindee_api_key: ctx.diagnostics?.mindee_api_key || null,
      model_id_required: ctx.diagnostics?.model_id_required ?? null,
      api_version: ctx.diagnostics?.api_version || null,
    },
    endpoint: {
      client_post: ctx.client_api_endpoint || null,
      client_method: 'POST',
      client_headers: { 'Content-Type': 'application/json' },
      client_body: 'JSON { recto?: dataUrl, verso?: dataUrl }',
      mindee_endpoint: ctx.diagnostics?.endpoint_used || ctx.diagnostics?.endpoint || null,
      mindee_method: 'POST (multipart/form-data v1 | FormData v2 enqueue)',
      mindee_http_called: Boolean(ctx.mindee_http_called),
    },
    images: {
      recto: {
        ...ctx.image_stats_recto,
        sent_to_mindee: Boolean(ctx.mindee_payload_recto_kb),
        mindee_payload_approx_kb: ctx.mindee_payload_recto_kb || null,
        ocr_source: ctx.ocr_image_source_recto || 'fullDataUrl|dataUrl|file',
        preview_is_cropped: ctx.preview_cropped_recto ?? null,
      },
      verso: {
        ...ctx.image_stats_verso,
        sent_to_mindee: Boolean(ctx.mindee_payload_verso_kb),
        mindee_payload_approx_kb: ctx.mindee_payload_verso_kb || null,
        ocr_source: ctx.ocr_image_source_verso || null,
        preview_is_cropped: ctx.preview_cropped_verso ?? null,
        mrz_expected: true,
      },
    },
    mindee: {
      recto_ok: Boolean(ctx.mindee_recto_ok),
      verso_ok: Boolean(ctx.mindee_verso_ok),
      raw_field_keys_recto: ctx.mindee_raw_recto ? Object.keys(ctx.mindee_raw_recto) : [],
      raw_field_keys_verso: ctx.mindee_raw_verso ? Object.keys(ctx.mindee_raw_verso) : [],
      raw_values_recto: mindeeSnapRecto,
      raw_values_verso: mindeeSnapVerso,
      side_errors: ctx.backend_errors || [],
    },
    ocr_text: {
      tesseract_recto: (ctx.tesseract_text_recto || '').slice(0, 500),
      tesseract_verso: (ctx.tesseract_text_verso || '').slice(0, 500),
      mrz_mindee_recto: ctx.mrz_recto || '',
      mrz_mindee_verso: ctx.mrz_verso || '',
    },
    parsing_pipeline: {
      recto_mapped: ctx.mapped_recto || null,
      verso_mapped: ctx.mapped_verso || null,
      merged: ctx.mapped_merged || null,
      final_form: ctx.final_form || null,
      recto_side_source: ctx.recto_side_source || null,
      verso_side_source: ctx.verso_side_source || null,
      prenom_source: ctx.prenom_resolution_source || null,
      adresse_source: ctx.adresse_resolution_source || null,
    },
    tesseract: {
      used: ctx.provider_final === 'tesseract' || ctx.recto_side_source?.includes('tesseract') || ctx.verso_side_source?.includes('tesseract'),
      explicit_fallback: ctx.provider_final === 'tesseract',
      message: ctx.provider_final === 'tesseract' ? 'Mindee non utilisé — fallback Tesseract.' : null,
    },
    localhost_vs_vercel: {
      client_api_base: ctx.client_api_base || null,
      hint: import.meta.env?.DEV
        ? 'Dev : /api via proxy Vite → Express local ou vercel dev. Comparer diagnostics.endpoint et mindee_http_called.'
        : 'Prod : same-origin /api/ocr/moroccan-cin sur Vercel. Variables MINDEE_* uniquement sur Vercel Functions.',
    },
    checklist: {
      faut_il_MINDEE_MODEL_ID: ctx.diagnostics?.key_type === 'md_v2'
        ? 'OUI — obligatoire avec clé md_*'
        : (ctx.diagnostics?.key_type === 'legacy_v1' ? 'NON — clé re_* utilise International ID v1' : 'N/A — clé absente'),
      actions: [],
    },
  };

  if (ctx.diagnostics?.model_id_required) {
    report.checklist.actions.push('Vercel → ajouter MINDEE_MODEL_ID (UUID modèle Mindee International ID)');
    report.checklist.actions.push('Ou remplacer MINDEE_API_KEY par une clé re_* (v1)');
  }
  if (!ctx.mindee_recto_ok) {
    report.checklist.actions.push('Vérifier logs Vercel Functions : [OCR CIN] Mindee config serveur');
  }
  if (ctx.verso_required && !ctx.mindee_verso_ok) {
    report.checklist.actions.push('Verso requis : confirmer MRZ visible sur image pleine cadre envoyée à Mindee');
  }

  return report;
}

export function logOcrAuditReport(report) {
  console.info('[OCR CIN] ═══ AUDIT REPORT ═══');
  console.info('[OCR CIN] verdict', report.verdict);
  console.info('[OCR CIN] vercel_runtime', report.vercel_runtime);
  console.info('[OCR CIN] endpoint', report.endpoint);
  console.info('[OCR CIN] images', report.images);
  console.info('[OCR CIN] mindee', report.mindee);
  console.info('[OCR CIN] parsing_pipeline', report.parsing_pipeline);
  console.info('[OCR CIN] tesseract', report.tesseract);
  console.info('[OCR CIN] checklist', report.checklist);
  console.info('[OCR CIN] ═══ END AUDIT ═══');
}
