# BE Festival 2026 — Instagram Wall Runbook

A record of how this app was actually run for the Brain Education Festival
(Body & Brain, Sedona AZ, September 2026), written at wind-down so the next
event can repeat it without rediscovering the same things.

The [README](../README.md) is the reference manual — every option, every
endpoint. This document is the opposite: what we actually chose, why, and in
what order. Read this first, then the README for detail.

---

## 1. What ran, and where

| | |
| --- | --- |
| Live page | https://bnbmedia-jd.github.io/instagram-hashtag-widget/ |
| Staff moderation | `/staff.html` on the same host (unlisted, password-gated) |
| Preview of both layouts | `/preview.html` |
| Repo | https://github.com/bnbmedia-jd/instagram-hashtag-widget |
| Hashtag | `#befestival2026` |
| Embedded on | a separate site, via `embed.js` script tag |

The whole thing is static. GitHub Actions fetches posts, commits
`data/feed.json`, and publishes to GitHub Pages. Nothing runs on a server, so
there is nothing to keep alive or pay for during the year.

## 2. The four content sources

They all merge into one `data/feed.json`, deduplicated by media ID.

1. **Hashtag search** (`recent_media` + `top_media`) — catches attendees you
   can't name in advance. Covers only ~24h, and `top_media` never returns
   Reels, so the feed **accumulates** rather than being replaced each poll.
2. **Own-account media** (`IG_INCLUDE_SELF=true`) — the account the token
   belongs to. This is the only source that returns playable video.
3. **`business_discovery`** on named accounts (`IG_ACCOUNTS`) — no time window,
   returns Reels, but `media_url` is always `null` for video.
4. **Cloudinary guest uploads** — attendees post photos and ≤15s videos from
   the page itself, no Instagram account needed.

At teardown the feed held **40 posts**: 19 from hashtag search, 18 guest
uploads, 3 from the own-account edge. Guest uploads were nearly half the wall —
budget attention accordingly next year.

## 3. Exact configuration used in 2026

**GitHub Actions secrets** (Settings → Secrets and variables → Actions):

| Secret | Notes |
| --- | --- |
| `IG_ACCESS_TOKEN` | long-lived (~60 day) token — see §4 |
| `IG_BUSINESS_ACCOUNT_ID` | must belong to the same account as the token |
| `CLOUDINARY_CLOUD_NAME` | `ap5u4jpl` |
| `CLOUDINARY_API_KEY` | Admin API, read-only use |
| `CLOUDINARY_API_SECRET` | Admin API, read-only use |

**Actions variables:**

| Variable | Value used |
| --- | --- |
| `HASHTAG` | `befestival2026` |
| `IG_SINCE` | `2026-08-25` (cutoff ~10 days before the event) |
| `IG_INCLUDE_SELF` | `true` |
| `IG_ACCOUNTS` | *(empty — see §5.3)* |
| `CLOUDINARY_TAG` | `befestival2026` |

**Cloudinary unsigned presets** (these live in the Cloudinary console, not the
repo — recreate them there):

- `befestival_guest` — images
- `befestival_video` — video, applies `c_limit,w_720,q_auto,vc_auto`

**Embed tag on the host site:**

```html
<div id="ig-hashtag-feed"></div>
<script src="https://bnbmedia-jd.github.io/instagram-hashtag-widget/embed.js"
        data-upload-cloud="ap5u4jpl"
        data-upload-preset="befestival_guest"
        data-terms-url="..." data-privacy-url="..."
        defer></script>
```

The cloud name and preset are public by design — that is what an unsigned
preset is for. The Admin API key/secret stay in Actions secrets.

## 4. Credentials — read this before anything else next year

- **The 2026 token expired 2026-11-03.** It will not work next year. Budget an
  hour to regenerate it before you need it.
- **The working token did not come from Jordan's own Facebook account.**
  Jordan's account only admins the Heroes Nation Page. The token must come from
  the Facebook account that admins the **Body & Brain** Page. Sorting this out
  cost real time in 2026 — start here.
- The token must carry `instagram_basic`, `pages_show_list`, **and**
  `instagram_manage_insights`. Without the third, `business_discovery` fails
  with `(#10) Application does not have permission for this action`.
- Token and `IG_BUSINESS_ACCOUNT_ID` are a pair. Changing one means changing
  the other.
- The GitHub PAT for the refresh timer and the staff-page credential are
  separate, short-lived things. Both were revoked at teardown; both need
  recreating.

## 5. What we learned the hard way

### 5.1 GitHub's cron is not a cron — this was the biggest problem

The workflow declares `*/5 * * * *`. On a free public repo, GitHub
deprioritises frequent scheduled triggers: **in practice it fired every 3–5
hours.** Posts sat invisible for most of a day.

The fix, and the thing to set up early next year: trigger the workflow from a
machine that is always on. `scripts/auto-refresh.sh` POSTs to the workflow
dispatch endpoint; a launchd agent runs it on a timer.
`scripts/install-timer.sh` sets all of this up in one command.

It uses `curl` and a token file rather than the `gh` CLI on purpose — `gh`
reads credentials from the login keychain, which is locked on a headless or
SSH-only Mac.

**Cadence actually used:**

| Period | Interval | Why |
| --- | --- | --- |
| Sept 4–8 (live) | 2 minutes | posts and guest uploads appear near-instantly |
| Sept 8 (wind-down) | 30 minutes | event over, keep the wall current but quiet |
| after | timer unloaded | see §7 |

At 2 minutes this produced **729 automated commits** in four days. That is
noisy but harmless — the workflow commits with `[skip ci]` and a `concurrency`
group prevents overlapping pushes. Don't be alarmed by the commit count.

### 5.2 Only about a third of Reels play

`business_discovery` returns `media_url: null` for all video — Instagram only
releases video files to the account that owns them. Switching the token to the
featured account's own media edge (`IG_INCLUDE_SELF=true`) fixes this in
principle, but even then only roughly **1 in 3** bodynbrain.us Reels came back
with a playable `media_url` — most likely because Instagram withholds video for
posts using licensed audio.

**No configuration fixes this.** 9 of the final 40 posts had no playable media.
We added a labelled placeholder card rather than showing a broken tile
(commit `3ecd6ae`). Expect the same next year; don't spend a day on it.

The lightbox cannot play the Reel either — Instagram serves
`X-Frame-Options: DENY` on embed URLs. Still plus a hand-off to Instagram is as
close as the platform allows.

### 5.3 Own-account media beats business_discovery

Once the token belonged to bodynbrain.us we set `IG_INCLUDE_SELF=true` and
**emptied `IG_ACCOUNTS`**. The own-media edge is strictly better: playable
video, plus `media_product_type`. Keep `IG_ACCOUNTS` for accounts you *don't*
hold the token for.

### 5.4 Dropping `npm install` from CI

The fetch uses only Node built-ins; `dotenv` is imported in a `try/catch` so
its absence is fine. Removing the install step cut **over four minutes** off
every run — which matters a great deal at a 2-minute trigger interval. Don't
add a dependency to `src/fetchFeed.js` without weighing that.

### 5.5 Moderation is a live, two-person activity

The staff page re-reads Cloudinary directly, so a guest photo can be hidden
before the poll has even folded it into the feed. Hiding appends to
`data/blocked.json` via the GitHub API and dispatches the workflow — the item
leaves the public page in roughly 40 seconds.

Blocklist writes are sha-guarded and retried on a stale sha (`9f991a0`),
because two moderators working at once would otherwise overwrite each other.

**A lesson worth repeating:** when someone asks to remove "the most recent
post" and a newer post has landed in the meantime, *ask which one*. Blocking
both to be safe is not safe — it hides content they wanted up.

### 5.6 The staff page's security model, stated plainly

A static page cannot hold a secret. So the GitHub credential is shipped
**encrypted** in `public/staff-auth.json` (AES-GCM, PBKDF2-SHA256, 600k
iterations) and a shared staff password decrypts it in the browser.

The encrypted blob is public, so the password is the entire barrier and can be
attacked offline. Use a long passphrase, give the credential a short expiry,
revoke it after the event. Appropriate for a weekend festival, not for anything
sensitive.

## 6. Next-year setup, in order

Allow half a day, mostly for credentials.

1. **Regenerate the Instagram token** from the Facebook account that admins the
   Body & Brain Page (§4). Verify it has `instagram_manage_insights`.
2. **Pick the hashtag and set `HASHTAG`.** Note the quota: resolving a hashtag
   name to an ID is capped at **30 unique hashtags per rolling 7 days**. Don't
   experiment freely. The ID is cached in `data/hashtag-id.json` once resolved,
   and polling a cached ID doesn't count.
3. **Delete `data/hashtag-id.json`'s stale entry** (2026's was
   `18619580047006404` for `befestival2026`) — it re-resolves automatically when
   `HASHTAG` changes, so this is only a tidiness step.
4. **Set `IG_SINCE`** to ~10 days before the event, so the feed doesn't pull in
   the account's back catalogue.
5. **Empty `data/feed.json`'s posts array and `data/blocked.json`** to start
   clean.
6. **Recreate the Cloudinary presets** (`befestival_guest`, `befestival_video`)
   and set `CLOUDINARY_TAG` to the new event tag. Update `data-upload-tag` on
   the embed if the tag changes.
7. **Regenerate the staff credential**: `node scripts/make-staff-auth.mjs`,
   commit `public/staff-auth.json`. Credential needs Contents: Read and write
   plus Actions: Read and write, nothing else.
8. **Set up the always-on Mac timer** — do this *before* the event, not during:

   ```bash
   mkdir -p ~/.config/ig-widget
   printf '%s' 'github_pat_...' > ~/.config/ig-widget/token
   chmod 600 ~/.config/ig-widget/token
   git clone https://github.com/bnbmedia-jd/instagram-hashtag-widget.git
   cd instagram-hashtag-widget
   ./scripts/install-timer.sh
   ```

   The installer tests the trigger before installing the timer, so a bad token
   fails immediately rather than silently.
9. **Set the interval for the event.** The committed default is now 1800s (30
   min). For a live event, set it to 120s — edit `StartInterval` in
   `scripts/install-timer.sh` before running it, or change the live agent:

   ```bash
   P=~/Library/LaunchAgents/com.bnbmedia.igwidget.refresh.plist
   /usr/libexec/PlistBuddy -c "Set :StartInterval 120" "$P"
   launchctl unload "$P" 2>/dev/null; launchctl load "$P"
   ```
10. **Update the embed** on the host site with the new cloud/preset/terms URLs.
11. **Test the whole path**: post to the hashtag, upload a guest photo, hide it
    from the staff page, confirm it leaves the live page.

## 7. Wind-down checklist

Done at the end of 2026; repeat next year.

1. Drop the timer to 30 minutes (`StartInterval 1800`) — traffic tails off but
   people still look at the wall for a few days.
2. Then unload it entirely:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.bnbmedia.igwidget.refresh.plist
   rm ~/.config/ig-widget/token
   ```
   The `*/5` GitHub cron keeps limping along every few hours, which is fine for
   a dormant wall. Comment out the `schedule:` block in
   `.github/workflows/update-feed.yml` to stop it completely.
3. **Revoke credentials**: the GitHub PAT used by the timer, the staff-page
   credential, and the Instagram token if it isn't used elsewhere.
4. Bulk-delete the Cloudinary folder for the event tag if you don't want to
   keep guest photos. Hiding a photo never deleted it — the file stays at its
   URL, just unreferenced.
5. Leave `data/feed.json` in place. The wall keeps rendering the final state
   forever with no moving parts, which is a nice archive.

## 8. Costs and limits

- **GitHub Actions**: free on a public repo, so 729 workflow runs cost nothing.
  On a private repo this would have been expensive.
- **Cloudinary**: free tier was never close to a limit — browser-side downscale
  to 1600px JPEG keeps a 3MB phone photo around 300KB, and the video preset
  caps stored video at 720p.
- **Instagram Graph API**: ~200 calls/hour per user. Even at a 2-minute poll
  with three sources we stayed well inside it.
- **Hashtag ID resolution**: 30 unique hashtags per rolling 7 days. The only
  quota we could realistically have hit.

## 9. Timeline of the 2026 build

| Date | What happened |
| --- | --- |
| Sept 1 | Feed accumulation, manual posts, Actions poller, embeddable widget, `business_discovery`, `IG_SINCE`, lightbox |
| Sept 3 | Switched token to bodynbrain.us's own media; dropped `npm install` from CI; added the blocklist |
| Sept 4 | Cloudinary guest uploads; the external launchd timer and its installer; staff moderation page behind a shared password; consent wording; mobile layout fixes |
| Sept 5 | Event live. Placeholder card for media-less posts. 445 feed commits in one day |
| Sept 8 | Wind-down: refresh interval 2 min → 30 min |

774 commits total, 729 of them automated feed updates.
