# Instagram Hashtag Widget

Polls the Instagram Graph API's Hashtag Search endpoint every 15 minutes and
serves the results as a static grid you can embed on a website.

Uses **Standard Access** only — no Meta App Review required, since it queries
public hashtag data using an Instagram Business/Creator account you control.

## One-time Meta/Instagram setup

1. Make sure you have an Instagram **Business or Creator** account, linked to
   a Facebook Page. This account is just your API credential — the posts
   returned by hashtag search come from any public account, not just this one.
2. Create an app at [developers.facebook.com](https://developers.facebook.com/apps),
   add the "Instagram Graph API" product.
3. Under App Roles, add yourself (the Facebook account tied to the Page above)
   as an **Instagram Tester**, and accept the tester invite from your
   Instagram app settings (Instagram app > Settings > Apps and Websites >
   Tester Invites).
4. Use the Graph API Explorer (or an OAuth flow) to generate a User Access
   Token with `instagram_basic` and `pages_show_list` permissions, for the
   Page connected to your IG account. Exchange it for a **long-lived token**
   (~60 days) via:
   ```
   GET /oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app-id}
     &client_secret={app-secret}
     &fb_exchange_token={short-lived-token}
   ```
5. Find your Instagram Business Account ID:
   ```
   GET /me/accounts?access_token={token}
   GET /{page-id}?fields=instagram_business_account&access_token={token}
   ```

Long-lived tokens expire after ~60 days — you'll need to refresh
`IG_ACCESS_TOKEN` in `.env` periodically (or automate the refresh call).

## Project setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```
IG_ACCESS_TOKEN=...
IG_BUSINESS_ACCOUNT_ID=...
HASHTAG=yourhashtag
PORT=3000
```

Run it:

```bash
npm start
```

Visit `http://localhost:3000`. The server fetches immediately on startup,
then every 15 minutes via cron (`src/server.js`). Results are cached to
`data/feed.json` and served statically — the browser widget re-reads that
file every 15 minutes too, so it never calls Instagram directly.

To trigger a manual refresh without waiting: `POST /api/refresh`.

## Following specific accounts (business_discovery)

Hashtag search only exposes a narrow window — roughly the last day for
`recent_media`, and `top_media` never returns Reels. That's fine for catching
attendees you can't name in advance, but unreliable for accounts you care about
specifically.

`business_discovery` queries a named public Business/Creator account directly:
no time window, no hashtag quota, and Reels are returned normally. Set
`IG_ACCOUNTS` to a comma-separated list of usernames:

```
IG_ACCOUNTS=bodynbrain.us,anotheraccount
```

Their posts are merged into the same accumulating feed and deduplicated by
media ID, so a post that appears via both the hashtag and an account is stored
once.

Set `IG_SINCE` to drop posts published before a given date (UTC), which is
useful when you only care about an event window rather than an account's whole
back catalogue:

```
IG_SINCE=2026-08-25
```

The cutoff applies to the entire feed, including posts already accumulated, so
lowering it will not bring old posts back unless the API still returns them.
Entries in `manual-posts.json` are exempt.

**This requires `instagram_manage_insights` on your token** in addition to
`instagram_basic` and `pages_show_list`. It's Standard Access — no App Review —
but a token generated without it fails with `(#10) Application does not have
permission for this action`. Account fetches are settled independently, so a
missing permission or a renamed account is logged and skipped rather than
failing the run.

Only Business/Creator accounts are discoverable; personal accounts return
nothing.

## Embedding on another site

The feed is served with `Access-Control-Allow-Origin: *`, so it can be embedded
cross-origin with a script tag. Drop this anywhere in your page:

```html
<div id="ig-hashtag-feed"></div>
<script src="https://bnbmedia-jd.github.io/instagram-hashtag-widget/embed.js" defer></script>
```

The script injects its own scoped styles (all classes are prefixed `ighw-`),
renders a responsive grid, and re-fetches every 15 minutes.

Options go on the script tag:

| Attribute | Default | Effect |
| --- | --- | --- |
| `data-target` | `ig-hashtag-feed` | ID of the container to render into. If it doesn't exist, the widget renders where the script tag sits. |
| `data-layout` | `grid` | `grid` for a full gallery, `row` for a single horizontally-scrolling row. |
| `data-limit` | all | Maximum number of posts to show. |
| `data-columns` | auto | Fixed column count (grid layout only). Omit for a responsive grid. |
| `data-card-width` | `240px` | Card width in row layout. |
| `data-header` | `true` | Set `false` to hide the hashtag title and "updated" line. |
| `data-feed` | this repo's feed | Override the feed JSON URL. |

### Single row

```html
<div id="ig-feed-row"></div>
<script src="https://bnbmedia-jd.github.io/instagram-hashtag-widget/embed.js"
        data-target="ig-feed-row" data-layout="row" data-limit="12" defer></script>
```

Scrolls horizontally with snap points. Touch and trackpad scrolling work
natively; arrow buttons appear for mouse users on screens wider than 600px and
hide themselves at each end of the range.

### Full gallery

```html
<div id="ig-feed-gallery"></div>
<script src="https://bnbmedia-jd.github.io/instagram-hashtag-widget/embed.js"
        data-target="ig-feed-gallery" defer></script>
```

Both can live on the same page — give each its own container and
`data-target`.

Example — six posts, three columns, no header:

```html
<div id="ig-hashtag-feed"></div>
<script src="https://bnbmedia-jd.github.io/instagram-hashtag-widget/embed.js"
        data-limit="6" data-columns="3" data-header="false" defer></script>
```

Restyle it by overriding the CSS variables on `.ighw`:

```css
.ighw { --ighw-gap: 20px; --ighw-radius: 0; --ighw-card: #fff; }
```

If you'd rather not run third-party JavaScript, an iframe works too, though it
won't inherit your page's styling:

```html
<iframe src="https://bnbmedia-jd.github.io/instagram-hashtag-widget/"
        style="width:100%;height:800px;border:0"></iframe>
```

## Notes and limits

- `ig_hashtag_search` (resolving a hashtag name to its ID) is capped at **30
  unique hashtags per rolling 7 days** per business account — but that lookup
  only happens once per hashtag; the ID is cached in `data/hashtag-id.json`.
  Polling `recent_media`/`top_media` for an ID you already have doesn't count
  against that quota.
- Hashtag Search returns **public posts only**, and isn't a full historical
  archive — `recent_media` covers roughly the last week, `top_media` returns
  the ~30 top-ranked posts.
- General Graph API rate limit is ~200 calls/hour per user — a 15-minute poll
  (4 calls/hour) is well within that.

## Deploying

For production, replace the `node-cron` schedule with your host's native
scheduler so the fetch keeps running even if the process restarts:
- **Vercel**: a Vercel Cron Job hitting a serverless function version of
  `fetchFeed`, writing to a KV/blob store instead of the local filesystem.
- **Any VPS**: keep `src/server.js` running under `pm2` or `systemd`.
- **GitHub Actions**: a scheduled workflow (`on: schedule`) running
  `npm run fetch` every 15 minutes and committing/publishing `data/feed.json`.
