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
