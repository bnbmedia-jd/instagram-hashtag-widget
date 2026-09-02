import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveHashtagId, fetchHashtagMedia, fetchAccountMedia } from "./instagram.js";

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
  const results = await Promise.allSettled(
    ACCOUNTS.map((name) =>
      fetchAccountMedia(IG_BUSINESS_ACCOUNT_ID, IG_ACCESS_TOKEN, name)
    )
  );
  results.forEach((result, i) => {
    if (result.status === "fulfilled") discovered.push(...result.value);
    else accountErrors.push(`@${ACCOUNTS[i]}: ${result.reason.message}`);
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

  const posts = [...byId.values()]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, MAX_POSTS);

  const added = posts.length - previous.length;

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    FEED_FILE,
    JSON.stringify({ hashtag: HASHTAG, updatedAt: new Date().toISOString(), posts }, null, 2)
  );

  return {
    posts,
    added,
    fromApi: new Set([...top, ...recent].map((p) => p.id)).size,
    fromAccounts: new Set(discovered.map((p) => p.id)).size,
    accountErrors,
  };
}

// Allow `npm run fetch` to run this directly, once, outside the server.
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchFeed()
    .then(({ posts, added, fromApi, fromAccounts, accountErrors }) => {
      console.log(
        `#${HASHTAG}: ${fromApi} via hashtag, ${fromAccounts} via accounts, ` +
          `${added} new, ${posts.length} total in feed`
      );
      for (const err of accountErrors) console.warn(`  account fetch failed — ${err}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
