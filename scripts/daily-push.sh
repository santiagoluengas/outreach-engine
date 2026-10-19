#!/bin/bash
# Sube a GitHub el trabajo real pendiente de este repo. Lo corre launchd cada día
# a las 19:00 de Bogotá (17:00 en hora del sistema, que está en Los Ángeles) (ver scripts/com.santiagoluengas.outreach-engine.daily-push.plist).
#
# Si no hay nada que subir, no hace nada: nunca genera commits vacíos.
#
#   Log:  ~/Library/Logs/outreach-engine-daily-push.log
#   Ver:  tail -20 ~/Library/Logs/outreach-engine-daily-push.log

set -uo pipefail

# launchd arranca con un PATH mínimo: git y gh viven en Homebrew.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="/Users/santiagoluengas/Downloads/Claude Code/outreach-engine"
LOG="$HOME/Library/Logs/outreach-engine-daily-push.log"

mkdir -p "$(dirname "$LOG")"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

cd "$REPO" 2>/dev/null || { log "ERROR: no existe el repo en $REPO"; exit 1; }

rama="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || { log "ERROR: no es un repo git"; exit 1; }

# Sin red o sin credenciales no hay nada que hacer; mañana se reintenta solo.
if ! git ls-remote --exit-code origin >/dev/null 2>&1; then
  log "sin acceso a origin (red o credenciales): no se hace nada"
  exit 0
fi

# --- 1. Cambios sin commitear -> commit wip -------------------------------
if [ -n "$(git status --porcelain)" ]; then
  git add -A

  # Red de seguridad: el script commitea a ciegas, así que si algo con pinta de
  # secreto se coló fuera del .gitignore, se aborta antes de subirlo a GitHub.
  sospechosos="$(git diff --cached --name-only | grep -iE '(^|/)\.env($|\.)|\.(pem|key|p12|pfx)$|secret|credential|service-account|client_secret' || true)"
  if [ -n "$sospechosos" ]; then
    git reset -q
    log "ABORTADO: archivos con pinta de secreto en el commit. Revisalos a mano:"
    printf '%s\n' "$sospechosos" | sed 's/^/                       /' >> "$LOG"
    exit 1
  fi

  # Fecha de Bogotá, no del sistema: el Mac está en America/Los_Angeles y de noche
  # ya es el día siguiente en Colombia, lo que dejaría el wip sellado un día antes.
  if git commit -q -m "wip: $(TZ=America/Bogota date '+%Y-%m-%d')"; then
    log "commit wip creado en $rama"
  else
    log "ERROR: falló el commit"
    exit 1
  fi
else
  log "nada sin commitear"
fi

# --- 2. Commits locales sin pushear -> push -------------------------------
pendientes="$(git rev-list --count '@{upstream}..HEAD' 2>/dev/null || echo 0)"
if [ "$pendientes" -gt 0 ]; then
  if git push -q origin "$rama" 2>/dev/null; then
    log "push OK: $pendientes commit(s) -> origin/$rama"
  else
    log "ERROR: falló el push de $pendientes commit(s)"
    exit 1
  fi
else
  log "nada que pushear: al día con origin/$rama"
fi
