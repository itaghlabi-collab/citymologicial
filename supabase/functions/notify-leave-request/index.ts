/**
 * Edge Function: notify-leave-request
 * Envoie un email Resend au Super Admin à chaque nouvelle demande de congé.
 *
 * Secrets Supabase (Dashboard → Edge Functions → Secrets) :
 *   RESEND_API_KEY      — obligatoire pour envoi réel
 *   LEAVE_NOTIFY_TO     — destinataire unique (secret Supabase, ex. selim.moumni@gmail.com)
 *   LEAVE_NOTIFY_FROM   — défaut CITYMO Congés <onboarding@resend.dev>
 *   LEAVE_APP_URL       — lien CTA optionnel (ex. https://app.citymo.ma)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  buildLeaveRequestEmailHtml,
  buildLeaveRequestSubject,
} from './emailTemplate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_FROM = 'CITYMO Congés <onboarding@resend.dev>';

interface NotifyPayload {
  leave?: Record<string, unknown>;
  /** @deprecated ignoré — destinataire = secret LEAVE_NOTIFY_TO uniquement */
  notifyTo?: string;
}

async function verifyAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, error: 'Authorization header missing' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { user: null, error: error?.message || 'Unauthorized' };
  }
  return { user, error: null };
}

async function sendViaResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  const bodyText = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    parsed = { raw: bodyText };
  }

  console.log('[notify-leave-request] Resend response', {
    status: res.status,
    ok: res.ok,
    body: bodyText.slice(0, 500),
  });

  if (!res.ok) {
    throw new Error(`Resend HTTP ${res.status}: ${bodyText}`);
  }

  return parsed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const startedAt = Date.now();

  try {
    const { user, error: authError } = await verifyAuthenticatedUser(req);
    if (!user) {
      console.warn('[notify-leave-request] auth failed', authError);
      return new Response(
        JSON.stringify({ ok: false, error: authError || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: NotifyPayload = await req.json();
    const leave = body.leave ?? {};

    const leaveNotifyToRaw = Deno.env.get('LEAVE_NOTIFY_TO');
    console.log('[notify-leave-request] LEAVE_NOTIFY_TO raw =', JSON.stringify(leaveNotifyToRaw));

    if (body.notifyTo) {
      console.warn(
        '[notify-leave-request] IGNORED frontend notifyTo =',
        JSON.stringify(body.notifyTo),
      );
    } else {
      console.log('[notify-leave-request] frontend notifyTo = absent (OK)');
    }

    if (!leave || typeof leave !== 'object') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Payload leave requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const to = (leaveNotifyToRaw ?? '').trim();
    const from = Deno.env.get('LEAVE_NOTIFY_FROM') || DEFAULT_FROM;
    const appUrl = Deno.env.get('LEAVE_APP_URL') || '';
    const resendKey = Deno.env.get('RESEND_API_KEY');

    console.log('FINAL TO =', to);
    console.log('[notify-leave-request] RESEND_API_KEY present =', Boolean(resendKey));
    console.log('[notify-leave-request] LEAVE_NOTIFY_FROM =', JSON.stringify(from));

    if (!to) {
      console.error('[notify-leave-request] LEAVE_NOTIFY_TO secret missing');
      return new Response(
        JSON.stringify({ ok: false, error: 'LEAVE_NOTIFY_TO non configuré' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('[notify-leave-request] sending to:', to);

    const subject = buildLeaveRequestSubject(leave);
    const html = buildLeaveRequestEmailHtml(leave, appUrl || undefined);

    const logContext = {
      leaveId: leave.id,
      employe: leave.employe_label || leave.employe,
      to,
      requestedBy: user.email,
    };

    if (!resendKey) {
      console.log('[notify-leave-request] RESEND_API_KEY absent — simulation', logContext);
      return new Response(
        JSON.stringify({ ok: true, simulated: true, to, subject }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const resendData = await sendViaResend({ apiKey: resendKey, from, to, subject, html });

    console.log('[notify-leave-request] email sent', {
      ...logContext,
      resendId: (resendData as { id?: string }).id,
      durationMs: Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        to,
        subject,
        resendId: (resendData as { id?: string }).id ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notify-leave-request] error', { message, durationMs: Date.now() - startedAt });
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
