#!/usr/bin/env bash
# Vérifie que le dépôt est prêt pour parité Vercel / Supabase Production
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; ERR=1; }

ERR=0
echo "=== CITYMO — Production readiness ==="
echo ""

# Migrations
MIG_COUNT=$(find supabase/migrations -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')
if [ "$MIG_COUNT" -ge 36 ]; then
  ok "Migrations SQL : $MIG_COUNT fichiers"
else
  warn "Migrations SQL : $MIG_COUNT (attendu ≥ 37 avec finance/ged)"
fi

for f in AUDIT_SCHEMA_CITYMO.sql RUN_FULL_RESTORE_CITYMO.sql RESTORE_SYNC.md MIGRATION_AUDIT_REPORT.md; do
  if [ -f "supabase/$f" ]; then ok "supabase/$f"; else fail "Manquant : supabase/$f"; fi
done

# Services Supabase critiques
MODULES=(
  "src/services/rh/employees.js"
  "src/services/rh/workers.js"
  "src/services/crm/clients.js"
  "src/services/logistique/vehicles.js"
  "src/services/projects/projects.js"
  "src/services/finance/chargeCategories.js"
  "src/services/achats/suppliers.js"
  "api/ocr/moroccan-cin.js"
)

for p in "${MODULES[@]}"; do
  if [ -f "$p" ]; then ok "$p"; else fail "Manquant : $p"; fi
done

# .env local (optionnel)
if [ -f .env ]; then
  if grep -q 'VITE_SUPABASE_URL' .env 2>/dev/null; then
    URL=$(grep '^VITE_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"' | tr -d ' ')
    if echo "$URL" | grep -q 'npddbwsskaojcawaxygh'; then
      ok ".env → bon projet Supabase"
    else
      warn ".env VITE_SUPABASE_URL ≠ npddbwsskaojcawaxygh ($URL)"
    fi
  else
    warn ".env sans VITE_SUPABASE_URL"
  fi
else
  warn "Pas de .env local (normal en CI) — configurer Vercel"
fi

# Build
if command -v npm >/dev/null 2>&1; then
  echo ""
  echo "Build frontend..."
  if npm run build >/tmp/citymo-build.log 2>&1; then
    ok "npm run build"
  else
    fail "npm run build — voir /tmp/citymo-build.log"
    tail -20 /tmp/citymo-build.log
  fi
fi

echo ""
if [ "${ERR:-0}" -eq 0 ]; then
  echo -e "${GREEN}Prêt côté code. Exécuter AUDIT + RESTORE sur Supabase Production.${NC}"
else
  echo -e "${RED}Corrections requises avant déploiement.${NC}"
  exit 1
fi
