#!/usr/bin/env bash
# Déploie notify-leave-request (requiert: npx supabase login)
set -euo pipefail
cd "$(dirname "$0")/.."
npx supabase@2.101.0 functions deploy notify-leave-request \
  --project-ref npddbwsskaojcawaxygh \
  --use-api
echo "OK — vérifiez Dashboard → Edge Functions → notify-leave-request"
