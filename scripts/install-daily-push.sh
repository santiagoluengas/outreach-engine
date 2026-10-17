#!/bin/bash
# Instala (o reinstala) el push diario de las 19:00.
#
# El script se COPIA a ~/.local/bin en vez de correr desde el repo: launchd no
# logra ejecutar un script guardado dentro de ~/Downloads (sale con código 126).
# Por eso, después de editar scripts/daily-push.sh hay que correr esto de nuevo:
#
#   npm run install-push
#
set -euo pipefail

LABEL="com.santiagoluengas.outreach-engine.daily-push"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="$HOME/.local/bin/outreach-daily-push.sh"

mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents"

cp "$REPO/scripts/daily-push.sh" "$DESTINO"
chmod +x "$DESTINO"
echo "script  -> $DESTINO"

cp "$REPO/scripts/$LABEL.plist" "$HOME/Library/LaunchAgents/$LABEL.plist"
plutil -lint "$HOME/Library/LaunchAgents/$LABEL.plist" >/dev/null
echo "plist   -> ~/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "launchd -> cargado, corre todos los días a las 19:00"
echo
echo "Probarlo ahora:  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "Ver qué hizo:    tail -20 ~/Library/Logs/outreach-engine-daily-push.log"
