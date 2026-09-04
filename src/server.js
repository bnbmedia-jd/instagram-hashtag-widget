import "dotenv/config";
import express from "express";
import cron from "node-cron";
import path from "node:path";
import { fetchFeed } from "./fetchFeed.js";

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const PUBLIC_DIR = path.join(import.meta.dirname, "..", "public");

const app = express();
app.use(express.static(PUBLIC_DIR));
app.use("/data", express.static(DATA_DIR));

app.post("/api/refresh", async (_req, res) => {
  try {
    const { posts, added } = await fetchFeed();
    res.json({ ok: true, count: posts.length, added });
  } catch (err) {
    console.error("Manual refresh failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function runFetch() {
  try {
    const { posts, added, fromApi, fromAccounts, fromUploads, accountErrors } = await fetchFeed();
    console.log(
      `[${new Date().toISOString()}] #${process.env.HASHTAG}: ${fromApi} via hashtag, ` +
        `${fromAccounts} via accounts, ${fromUploads} via uploads, ${added} new, ${posts.length} total`
    );
    for (const err of accountErrors) console.warn(`  account fetch failed — ${err}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Fetch failed:`, err.message);
  }
}

// Every 15 minutes.
cron.schedule("*/15 * * * *", runFetch);

app.listen(PORT, () => {
  console.log(`Widget server running at http://localhost:${PORT}`);
  runFetch(); // populate data/feed.json on startup instead of waiting 15 min
});
