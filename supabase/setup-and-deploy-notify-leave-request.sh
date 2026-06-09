#!/usr/bin/env bash
# Configure secrets + deploy notify-leave-request (nécessite: npx supabase login)
set -euo pipefail

PROJECT_REF="npddbwsskaojcawaxygh"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SECRETS_FILE="$ROOT/supabase/.secrets.notify-leave-request.env"

echo "=== 1. Vérification Supabase CLI ==="
if ! npx supabase@2.101.0 projects list &>/dev/null; then
  echo "ERREUR: CLI non connectée. Exécutez: npx supabase login"
  exit 1
fi
echo "OK — CLI connectée"

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERREUR: fichier manquant: $SECRETS_FILE"
  exit 1
fi

echo "=== 2. Secrets Supabase ==="
npx supabase@2.101.0 secrets set --env-file "$SECRETS_FILE" --project-ref "$PROJECT_REF"
echo "OK — secrets définis depuis .secrets.notify-leave-request.env"

echo "=== 3. Déploiement notify-leave-request ==="
npx supabase@2.101.0 functions deploy notify-leave-request \
  --project-ref "$PROJECT_REF" \
  --use-api
echo "OK — fonction déployée"

echo "=== 4. Vérification ==="
npx supabase@2.101.0 functions list --project-ref "$PROJECT_REF"

echo ""
echo "Terminé. Logs attendus: FINAL TO = selim.moumni@gmail.com"
