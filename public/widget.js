const REFRESH_MS = 15 * 60 * 1000;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, secondsInUnit] of units) {
    const value = Math.floor(seconds / secondsInUnit);
    if (value >= 1) return `${value} ${name}${value > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

function renderPost(post) {
  const isVideo = post.media_type === "VIDEO";
  const mediaTag = isVideo
    ? `<video src="${post.media_url}" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()"></video>`
    : `<img src="${post.media_type === "CAROUSEL_ALBUM" ? post.media_url : post.media_url}" alt="" loading="lazy" />`;

  return `
    <a class="post" href="${post.permalink}" target="_blank" rel="noopener noreferrer">
      ${mediaTag}
      <div class="caption">${escapeHtml(post.caption)}</div>
      <div class="meta">@${escapeHtml(post.username || "unknown")} · ${timeAgo(post.timestamp)}</div>
    </a>
  `;
}

async function loadFeed() {
  const grid = document.getElementById("feed-grid");
  const titleEl = document.getElementById("feed-title");
  const updatedEl = document.getElementById("feed-updated");

  try {
    const res = await fetch(`data/feed.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Feed not available yet (${res.status})`);
    const { hashtag, updatedAt, posts } = await res.json();

    titleEl.textContent = `#${hashtag}`;
    updatedEl.textContent = `Updated ${timeAgo(updatedAt)}`;

    grid.innerHTML = posts.length
      ? posts.map(renderPost).join("")
      : `<p class="empty">No posts found for this hashtag yet.</p>`;
  } catch (err) {
    grid.innerHTML = `<p class="empty">Feed hasn't loaded yet — check back shortly.</p>`;
    console.warn(err.message);
  }
}

loadFeed();
setInterval(loadFeed, REFRESH_MS);
