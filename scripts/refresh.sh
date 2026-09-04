#!/usr/bin/env bash
# Force an immediate poll + redeploy instead of waiting for the 15-minute cron.
# Usage: ./scripts/refresh.sh [--watch]
set -euo pipefail

REPO="bnbmedia-jd/instagram-hashtag-widget"
WORKFLOW="update-feed.yml"

command -v gh >/dev/null || { echo "gh CLI not found: https://cli.github.com"; exit 1; }

gh workflow run "$WORKFLOW" --repo "$REPO"
echo "Triggered. The feed usually updates within ~90 seconds."

if [ "${1:-}" = "--watch" ]; then
  echo "Waiting for the run to finish..."
  # Give GitHub a moment to register the new run before polling for it.
  for _ in 1 2 3 4 5; do
    sleep 2
    ID=$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --limit 1 --json databaseId --jq '.[0].databaseId')
    [ -n "$ID" ] && break
  done
  until [ "$(gh run list --repo "$REPO" --limit 1 --json status --jq '.[0].status')" = "completed" ]; do
    sleep 10
  done
  gh run list --repo "$REPO" --limit 1
  echo
  echo "Live feed now:"
  curl -s "https://bnbmedia-jd.github.io/instagram-hashtag-widget/data/feed.json" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"  {len(d['posts'])} posts, updated {d['updatedAt']}\")"
fi
