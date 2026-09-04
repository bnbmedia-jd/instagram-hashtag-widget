#!/bin/bash
# Triggers the feed workflow. Intended to be run on a timer by launchd (see
# com.bnbmedia.igwidget.refresh.plist) on an always-on machine, because GitHub
# throttles frequent cron schedules to hours rather than minutes.
#
# Uses curl + a token file rather than the gh CLI: gh reads its credentials from
# the login keychain, which is often locked on a headless or SSH-only Mac.

REPO="bnbmedia-jd/instagram-hashtag-widget"
WORKFLOW="update-feed.yml"
TOKEN_FILE="${IG_WIDGET_TOKEN_FILE:-$HOME/.config/ig-widget/token}"
LOG="${IG_WIDGET_LOG:-$HOME/.config/ig-widget/refresh.log}"

mkdir -p "$(dirname "$LOG")"

if [ ! -r "$TOKEN_FILE" ]; then
  echo "$(date -u +%FT%TZ) ERROR no token at $TOKEN_FILE" >> "$LOG"
  exit 1
fi

TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")

CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW/dispatches" \
  -d '{"ref":"main"}')

# 204 is success for this endpoint. Anything else is worth seeing in the log.
if [ "$CODE" = "204" ]; then
  echo "$(date -u +%FT%TZ) ok" >> "$LOG"
else
  echo "$(date -u +%FT%TZ) FAILED http=$CODE" >> "$LOG"
fi

# Keep the log from growing without bound over a long event.
if [ "$(wc -l < "$LOG")" -gt 5000 ]; then
  tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
