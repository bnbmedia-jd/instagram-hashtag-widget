import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  resolveHashtagId,
  fetchHashtagMedia,
  fetchAccountMedia,
  fetchOwnMedia,
} from "./instagram.js";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const HASHTAG_ID_FILE = path.join(DATA_DIR, "hashtag-id.json");
const FEED_FILE = path.join(DATA_DIR, "feed.json");
const MANUAL_FILE = path.join(DATA_DIR, "manual-posts.json");

// Hashtag search only exposes a narrow window: recent_media covers roughly the
// last day, and top_media excludes Reels entirely. Posts therefore vanish from
// the API long before the event is over, so the feed accumulates rather than
// being replaced on each poll.
const MAX_POSTS = 500;

const { IG_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID, HASHTAG } = process.env;

// Comma-separated Business/Creator usernames to follow via business_discovery,
// which has no ~24h window and returns Reels. Hashtag search catches people we
// can't name in advance; this catches the accounts we can.
const ACCOUNTS = (process.env.IG_ACCOUNTS || "")
  .split(",")
  .map((name) => name.trim().replace(/^@/, ""))
  .filter(Boolean);

// When the token belongs to the account we want to feature, its own media edge
// returns playable video URLs that business_discovery withholds. Set this once
// IG_ACCESS_TOKEN is issued for that account.
const INCLUDE_SELF = /^(1|true|yes)$/i.test(process.env.IG_INCLUDE_SELF || "");

// Optional cutoff (e.g. "2026-08-25"). Posts published before it are dropped
// from the feed, including ones already accumulated. Bare dates are read as
// UTC midnight. Hand-curated entries in manual-posts.json are exempt.
const SINCE = (() => {
  const raw = (process.env.IG_SINCE || "").trim();
  if (!raw) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  if (isNaN(date)) {
    console.warn(`Ignoring unparseable IG_SINCE value: ${raw}`);
    return null;
  }
  return date;
})();

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf-8"));
  } catch {
    return fallback;
  }
}

async function getCachedHashtagId(hashtag) {
  const cached = await readJson(HASHTAG_ID_FILE, null);
  if (cached?.hashtag === hashtag && cached.id) {
    return cached.id;
  }

  const id = await resolveHashtagId(hashtag, IG_BUSINESS_ACCOUNT_ID, IG_ACCESS_TOKEN);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(HASHTAG_ID_FILE, JSON.stringify({ hashtag, id }, null, 2));
  return id;
}

export async function fetchFeed() {
  if (!IG_ACCESS_TOKEN || !IG_BUSINESS_ACCOUNT_ID || !HASHTAG) {
    throw new Error(
      "Missing IG_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID, or HASHTAG — check your .env file."
    );
  }

  const hashtagId = await getCachedHashtagId(HASHTAG);

  const [recent, top] = await Promise.all([
    fetchHashtagMedia(hashtagId, IG_BUSINESS_ACCOUNT_ID, IG_ACCESS_TOKEN, "recent_media"),
    fetchHashtagMedia(hashtagId, IG_BUSINESS_ACCOUNT_ID, IG_ACCESS_TOKEN, "top_media"),
  ]);

  // One bad account (renamed, switched to personal, missing permission) must
  // not lose the whole run, so each is settled independently.
  const discovered = [];
  const accountErrors = [];
  const sources = ACCOUNTS.map((name) => ({
    label: `@${name}`,
    run: () => fetchAccountMedia(IG_BUSINESS_ACCOUNT_ID, IG_ACCESS_TOKEN, name),
  }));
  if (INCLUDE_SELF) {
    sources.push({
      label: "own account",
      run: () => fetchOwnMedia(IG_BUSINESS_ACCOUNT_ID, IG_ACCESS_TOKEN),
    });
  }
  const results = await Promise.allSettled(sources.map((source) => source.run()));
  results.forEach((result, i) => {
    if (result.status === "fulfilled") discovered.push(...result.value);
    else accountErrors.push(`${sources[i].label}: ${result.reason.message}`);
  });

  const previous = (await readJson(FEED_FILE, {}))?.posts ?? [];
  const manual = (await readJson(MANUAL_FILE, []))?.posts ?? [];

  // Later writes win: fresh API results refresh the like/comment counts on
  // posts we already had, and hand-curated entries override both.
  const byId = new Map();
  for (const post of previous) byId.set(post.id, post);
  for (const post of [...top, ...recent, ...discovered]) {
    byId.set(post.id, { ...byId.get(post.id), ...post });
  }
  for (const post of manual) byId.set(post.id, { ...post, manual: true });

  const all = [...byId.values()].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  const kept = SINCE
    ? all.filter((post) => post.manual || new Date(post.timestamp) >= SINCE)
    : all;
  const posts = kept.slice(0, MAX_POSTS);
  const excluded = all.length - kept.length;

  const previousIds = new Set(previous.map((post) => post.id));
  const added = posts.filter((post) => !previousIds.has(post.id)).length;

  // Only bump updatedAt when the posts actually changed. Rewriting it on every
  // poll would make the file differ every run, which under the GitHub Actions
  // setup means a commit every 15 minutes forever.
  const changed = JSON.stringify(posts) !== JSON.stringify(previous);
  const previousUpdatedAt = (await readJson(FEED_FILE, {}))?.updatedAt;
  const updatedAt = changed || !previousUpdatedAt
    ? new Date().toISOString()
    : previousUpdatedAt;

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FEED_FILE, JSON.stringify({ hashtag: HASHTAG, updatedAt, posts }, null, 2));

  return {
    posts,
    added,
    fromApi: new Set([...top, ...recent].map((p) => p.id)).size,
    fromAccounts: new Set(discovered.map((p) => p.id)).size,
    accountErrors,
    changed,
    excluded,
  };
}

// Allow `npm run fetch` to run this directly, once, outside the server.
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchFeed()
    .then(({ posts, added, fromApi, fromAccounts, accountErrors, excluded }) => {
      console.log(
        `#${HASHTAG}: ${fromApi} via hashtag, ${fromAccounts} via accounts, ` +
          `${added} new, ${posts.length} total in feed` +
          (excluded ? ` (${excluded} before cutoff excluded)` : "")
      );
      for (const err of accountErrors) console.warn(`  account fetch failed — ${err}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
