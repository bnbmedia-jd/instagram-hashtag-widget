#!/bin/bash
# Installs the launchd timer that keeps the feed fresh. Run it from anywhere:
#   ./scripts/install-timer.sh
# It works out its own absolute path, so nothing needs editing by hand.
set -euo pipefail

LABEL="com.bnbmedia.igwidget.refresh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/auto-refresh.sh"
TOKEN_FILE="$HOME/.config/ig-widget/token"
LOG="$HOME/.config/ig-widget/refresh.log"

echo "Script:  $SCRIPT"
[ -f "$SCRIPT" ] || { echo "ERROR: auto-refresh.sh not found next to this script."; exit 1; }
chmod +x "$SCRIPT"

if [ ! -r "$TOKEN_FILE" ]; then
  echo "ERROR: no token at $TOKEN_FILE"
  echo "Create it first:"
  echo "  mkdir -p ~/.config/ig-widget"
  echo "  printf '%s' 'github_pat_...' > ~/.config/ig-widget/token"
  echo "  chmod 600 ~/.config/ig-widget/token"
  exit 1
fi

echo "Testing the trigger before installing the timer..."
"$SCRIPT"
if ! tail -1 "$LOG" | grep -q ' ok$'; then
  echo "ERROR: trigger failed. Last log line:"
  tail -1 "$LOG"
  exit 1
fi
echo "  -> $(tail -1 "$LOG")"

mkdir -p "$HOME/Library/LaunchAgents"
{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
  echo '<plist version="1.0">'
  echo '<dict>'
  echo "  <key>Label</key><string>$LABEL</string>"
  echo '  <key>ProgramArguments</key>'
  echo '  <array>'
  echo '    <string>/bin/bash</string>'
  echo "    <string>$SCRIPT</string>"
  echo '  </array>'
  echo '  <key>StartInterval</key><integer>120</integer>'
  echo '  <key>RunAtLoad</key><true/>'
  echo '  <key>StandardErrorPath</key><string>/tmp/igwidget-refresh.err</string>'
  echo '</dict>'
  echo '</plist>'
} > "$PLIST"
echo "Wrote $PLIST"

# `load` is deprecated on newer macOS but still works; fall back to bootstrap.
launchctl unload "$PLIST" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl load "$PLIST" 2>/dev/null || launchctl bootstrap "gui/$(id -u)" "$PLIST"

if launchctl list | grep -q "$LABEL"; then
  echo
  echo "Timer installed and running. It triggers a refresh every 2 minutes."
  echo "Watch it:  tail -f $LOG"
  echo "Stop it:   launchctl unload $PLIST"
else
  echo "ERROR: the timer did not register. Check /tmp/igwidget-refresh.err"
  exit 1
fi
