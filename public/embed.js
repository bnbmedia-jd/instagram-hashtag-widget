/**
 * Embeddable Instagram hashtag feed.
 *
 *   <div id="ig-hashtag-feed"></div>
 *   <script src="https://bnbmedia-jd.github.io/instagram-hashtag-widget/embed.js" defer></script>
 *
 * Options go on the script tag: data-target, data-limit, data-columns,
 * data-header ("true"/"false"), data-feed (override the feed URL).
 */
(function () {
  "use strict";

  const script = document.currentScript;
  // Resolve everything against wherever this script is hosted, so relative
  // media paths (manual posts under /manual/) still work on a third-party page.
  const BASE = new URL(".", script.src);
  const FEED_URL = script.dataset.feed || new URL("data/feed.json", BASE).href;
  const TARGET_ID = script.dataset.target || "ig-hashtag-feed";
  const LIMIT = parseInt(script.dataset.limit || "0", 10) || Infinity;
  const COLUMNS = script.dataset.columns || "";
  const LAYOUT = script.dataset.layout === "row" ? "row" : "grid";
  const CARD_WIDTH = script.dataset.cardWidth || "240px";
  const LIGHTBOX = script.dataset.lightbox !== "false";
  // Guest uploads. Both values are public by design — an unsigned preset is
  // what lets the browser upload with no backend and no secret on the page.
  const UPLOAD_CLOUD = script.dataset.uploadCloud || "";
  const UPLOAD_PRESET = script.dataset.uploadPreset || "";
  const UPLOAD_TAG = script.dataset.uploadTag || "befestival2026";
  const UPLOADS_ON = Boolean(UPLOAD_CLOUD && UPLOAD_PRESET);
  // Cloudinary's public list endpoint needs no credentials, so uploads can be
  // read straight from the browser and appear without waiting for the poll.
  // The scheduled feed still carries them too; ids dedupe the overlap.
  const UPLOAD_LIST_URL = UPLOAD_CLOUD
    ? `https://res.cloudinary.com/${UPLOAD_CLOUD}/image/list/${UPLOAD_TAG}.json`
    : "";
  // Blocked posts must be honoured here as well, or a removed image would come
  // straight back for anyone loading the page.
  const BLOCKED_URL = FEED_URL.replace(/feed\.json.*$/, "blocked.json");
  const MAX_EDGE = 1600;      // downscale before upload
  const JPEG_QUALITY = 0.82;
  const SHOW_HEADER = script.dataset.header !== "false";
  // Short by default: the feed is a small static JSON on a CDN, and a stale
  // open tab is the biggest source of perceived lag after posting.
  const REFRESH_MS = Math.max(parseInt(script.dataset.refresh || "60", 10), 15) * 1000;

  const CSS = `
.ighw{--ighw-gap:12px;--ighw-radius:10px;--ighw-fg:inherit;--ighw-muted:#6b6b6b;
  --ighw-card:#f5f5f5;--ighw-border:#e3e3e3;
  font-family:inherit;color:var(--ighw-fg);}
@media (prefers-color-scheme:dark){.ighw{--ighw-muted:#a0a0a0;--ighw-card:#1e1e1e;--ighw-border:#2c2c2c;}}
.ighw *{box-sizing:border-box;}
.ighw-head{display:flex;align-items:baseline;gap:.6em;margin:0 0 var(--ighw-gap);flex-wrap:wrap;}
.ighw-title{font-size:1.15em;font-weight:600;margin:0;}
.ighw-updated{font-size:.8em;color:var(--ighw-muted);margin:0;}
.ighw-grid{display:grid;gap:var(--ighw-gap);
  grid-template-columns:repeat(auto-fill,minmax(220px,1fr));}
.ighw-post{display:block;text-decoration:none;color:inherit;background:var(--ighw-card);
  border:1px solid var(--ighw-border);border-radius:var(--ighw-radius);overflow:hidden;
  transition:transform .15s ease;}
.ighw-post:hover{transform:translateY(-2px);}
.ighw-media{position:relative;aspect-ratio:1/1;background:var(--ighw-border);}
.ighw-media img,.ighw-media video{width:100%;height:100%;object-fit:cover;display:block;}
.ighw-add{display:block;width:100%;padding:16px;margin:0 0 var(--ighw-gap);
  font:inherit;font-size:1.02em;font-weight:600;color:#fff;background:#0095f6;
  border:0;border-radius:var(--ighw-radius);cursor:pointer;text-align:center;}
.ighw-add:hover{filter:brightness(1.06);}
.ighw-add:disabled{opacity:.6;cursor:default;}
.ighw-add-note{font-size:.8em;color:var(--ighw-muted);margin:-6px 0 var(--ighw-gap);text-align:center;}
.ighw-lb{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;
  justify-content:center;background:rgba(0,0,0,.82);padding:4vh 4vw;}
.ighw-lb[hidden]{display:none;}
.ighw-lb-card{background:#fff;color:#111;border-radius:12px;overflow:hidden;
  max-width:940px;width:100%;max-height:92vh;display:flex;box-shadow:0 20px 60px rgba(0,0,0,.4);}
@media (prefers-color-scheme:dark){.ighw-lb-card{background:#1a1a1a;color:#eee;}}
.ighw-lb-media{flex:1 1 55%;background:#000;display:flex;align-items:center;justify-content:center;min-width:0;}
.ighw-lb-media img,.ighw-lb-media video{width:100%;height:100%;max-height:92vh;object-fit:contain;display:block;}
.ighw-lb-side{flex:1 1 45%;padding:22px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;min-width:0;}
.ighw-lb-user{font-weight:600;font-size:.95em;margin:0;}
.ighw-lb-time{font-size:.8em;opacity:.65;margin:0;}
.ighw-lb-caption{font-size:.9em;line-height:1.55;margin:0;white-space:pre-wrap;word-wrap:break-word;}
.ighw-lb-stats{font-size:.82em;opacity:.7;margin:0;}
.ighw-lb-open{display:inline-block;margin-top:auto;padding:10px 16px;border-radius:8px;
  background:#0095f6;color:#fff;text-decoration:none;font-size:.88em;font-weight:600;
  text-align:center;border:0;cursor:pointer;}
.ighw-lb-x{position:absolute;top:14px;right:18px;background:none;border:0;color:#fff;
  font-size:30px;line-height:1;cursor:pointer;padding:4px 10px;}
.ighw-lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);
  border:0;color:#fff;font-size:26px;cursor:pointer;padding:12px 16px;border-radius:8px;}
.ighw-lb-nav:disabled{opacity:.25;cursor:default;}
.ighw-lb-prev{left:12px;} .ighw-lb-next{right:12px;}
@media (max-width:760px){
  .ighw-lb-card{flex-direction:column;}
  .ighw-lb-media{max-height:45vh;}
  .ighw-lb-media img,.ighw-lb-media video{max-height:45vh;}
  .ighw-lb-nav{display:none;}
}
.ighw-nomedia{background:linear-gradient(135deg,var(--ighw-card),var(--ighw-border));}
.ighw-badge{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.65);color:#fff;
  font-size:.7em;padding:2px 6px;border-radius:4px;line-height:1.4;}
.ighw-body{padding:10px 12px 12px;}
.ighw-cap{font-size:.85em;line-height:1.45;margin:0 0 6px;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.ighw-meta{font-size:.75em;color:var(--ighw-muted);margin:0;}
.ighw-empty{color:var(--ighw-muted);font-size:.9em;padding:1.5em 0;text-align:center;grid-column:1/-1;}

/* Single-row carousel. Native scroll with snap points, so touch and trackpad
   work without JS; the arrows exist for mouse users on desktop. */
.ighw-rail{position:relative;}
.ighw-grid.ighw-row{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;
  scroll-behavior:smooth;padding-bottom:6px;-webkit-overflow-scrolling:touch;
  scrollbar-width:thin;}
.ighw-grid.ighw-row::-webkit-scrollbar{height:6px;}
.ighw-grid.ighw-row::-webkit-scrollbar-thumb{background:var(--ighw-border);border-radius:3px;}
.ighw-row .ighw-post{flex:0 0 var(--ighw-card-w,240px);scroll-snap-align:start;}
.ighw-row .ighw-empty{flex:1 1 auto;}
.ighw-nav{position:absolute;top:calc(50% - 18px);width:36px;height:36px;border-radius:50%;
  border:1px solid var(--ighw-border);background:rgba(255,255,255,.92);color:#222;
  cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;
  justify-content:center;padding:0;z-index:2;transition:opacity .15s ease;}
@media (prefers-color-scheme:dark){.ighw-nav{background:rgba(30,30,30,.92);color:#eee;}}
.ighw-nav:disabled{opacity:0;pointer-events:none;}
.ighw-nav-prev{left:-14px;}
.ighw-nav-next{right:-14px;}
@media (max-width:600px){.ighw-nav{display:none;}}
`;

  function injectStyles() {
    if (document.getElementById("ighw-styles")) return;
    const el = document.createElement("style");
    el.id = "ighw-styles";
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // Text nodes and attribute values are both built via the DOM rather than
  // string interpolation, so captions can't inject markup into the host page.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function timeAgo(iso) {
    const seconds = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (!isFinite(seconds)) return "";
    const units = [["year",31536000],["month",2592000],["day",86400],["hour",3600],["minute",60]];
    for (const [name, per] of units) {
      const v = Math.floor(seconds / per);
      if (v >= 1) return v + " " + name + (v > 1 ? "s" : "") + " ago";
    }
    return "just now";
  }

  function resolveUrl(url) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    // Manual entries are relative to the widget, not to the host page's origin.
    // Strip any leading slash so they resolve under a project-site subpath
    // (e.g. /instagram-hashtag-widget/) rather than the domain root.
    return new URL(url.replace(/^\/+/, ""), BASE).href;
  }

  // business_discovery omits media_url for video from accounts we don't own —
  // only a thumbnail comes back — so the still is what we can always render,
  // and the video file is a bonus when it happens to be present.
  function mediaFor(post) {
    return {
      video: post.media_type === "VIDEO" ? resolveUrl(post.media_url) : null,
      still: resolveUrl(post.thumbnail_url || post.media_url),
    };
  }

  function renderPost(post, posts, index) {
    const link = el("a", "ighw-post");
    link.href = post.permalink || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (LIGHTBOX) {
      // Left-click opens the lightbox; modified clicks keep normal link
      // behaviour so "open in new tab" still works.
      link.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openLightbox(posts, index);
      });
    }

    const wrap = el("div", "ighw-media");
    const { video, still } = mediaFor(post);
    if (video && !post.manual) {
      const v = el("video");
      v.src = video;
      if (still) v.poster = still;
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "metadata";
      wrap.addEventListener("mouseenter", () => v.play().catch(() => {}));
      wrap.addEventListener("mouseleave", () => v.pause());
      wrap.appendChild(v);
    } else if (still) {
      const img = el("img");
      img.src = still;
      img.alt = "";
      img.loading = "lazy";
      // A dead CDN link shouldn't leave a broken-image icon in the layout.
      img.addEventListener("error", () => { img.remove(); wrap.classList.add("ighw-nomedia"); });
      wrap.appendChild(img);
    } else {
      wrap.classList.add("ighw-nomedia");
    }
    if (post.media_type === "CAROUSEL_ALBUM") wrap.appendChild(el("span", "ighw-badge", "◫"));
    if (post.media_type === "VIDEO") wrap.appendChild(el("span", "ighw-badge", "▶"));
    link.appendChild(wrap);

    const body = el("div", "ighw-body");
    if (post.caption) body.appendChild(el("p", "ighw-cap", post.caption));
    const bits = [];
    if (post.username) bits.push("@" + post.username);
    if (post.timestamp) bits.push(timeAgo(post.timestamp));
    body.appendChild(el("p", "ighw-meta", bits.join(" · ")));
    link.appendChild(body);

    return link;
  }

  async function fetchJson(url) {
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(url + " -> " + res.status);
    return res.json();
  }

  function uploadToPost(resource) {
    const url =
      `https://res.cloudinary.com/${UPLOAD_CLOUD}/image/upload/` +
      `v${resource.version}/${resource.public_id}.${resource.format}`;
    const meta = resource.context?.custom || {};
    return {
      id: `upload-${resource.public_id}`,
      media_type: "IMAGE",
      media_url: url,
      permalink: url,
      caption: meta.caption || "",
      username: meta.name || "guest",
      timestamp: resource.created_at,
      source: "upload",
    };
  }

  // Both extra sources are optional: a failure in either leaves the scheduled
  // feed rendering exactly as before.
  async function fetchLiveUploads() {
    if (!UPLOAD_LIST_URL) return [];
    try {
      const data = await fetchJson(UPLOAD_LIST_URL);
      return (data.resources || []).map(uploadToPost);
    } catch (err) {
      if (window.console) console.warn("[ig-hashtag-widget] uploads:", err.message);
      return [];
    }
  }

  async function fetchBlocked() {
    try {
      const data = await fetchJson(BLOCKED_URL);
      return {
        ids: new Set(data.ids || []),
        codes: (data.shortcodes || []).filter(Boolean),
      };
    } catch {
      return { ids: new Set(), codes: [] };
    }
  }

  async function load(root) {
    const grid = root.querySelector(".ighw-grid");
    try {
      const [data, liveUploads, blocked] = await Promise.all([
        fetchJson(FEED_URL),
        fetchLiveUploads(),
        fetchBlocked(),
      ]);

      // Feed first, live uploads second: a just-uploaded photo wins over the
      // copy the poll has already stored, and identical ids collapse.
      const byId = new Map();
      for (const post of data.posts || []) byId.set(post.id, post);
      for (const post of liveUploads) byId.set(post.id, { ...byId.get(post.id), ...post });

      const posts = [...byId.values()]
        .filter(
          (post) =>
            !blocked.ids.has(post.id) &&
            !blocked.codes.some((code) => (post.permalink || "").includes(code))
        )
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, LIMIT);

      if (SHOW_HEADER) {
        const t = root.querySelector(".ighw-title");
        const u = root.querySelector(".ighw-updated");
        if (t) t.textContent = "#" + (data.hashtag || "");
        if (u) u.textContent = data.updatedAt ? "Updated " + timeAgo(data.updatedAt) : "";
      }

      grid.textContent = "";
      if (!posts.length) {
        grid.appendChild(el("p", "ighw-empty", "No posts yet."));
        return;
      }
      const frag = document.createDocumentFragment();
      posts.forEach((p, i) => frag.appendChild(renderPost(p, posts, i)));
      grid.appendChild(frag);
      if (grid.ighwSync) setTimeout(grid.ighwSync, 50);
    } catch (err) {
      grid.textContent = "";
      grid.appendChild(el("p", "ighw-empty", "Feed unavailable."));
      if (window.console) console.warn("[ig-hashtag-widget]", err.message);
    }
  }

  // Instagram sends X-Frame-Options: DENY on its embed URLs, and the API
  // withholds media_url for video from accounts we don't own, so the post
  // itself cannot be played in-page. The lightbox shows the still at size with
  // the full caption, and hands off to Instagram in a popup window.
  let lb = null;
  let lbPosts = [];
  let lbIndex = 0;
  let lastFocus = null;

  function buildLightbox() {
    const overlay = el("div", "ighw-lb");
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Post detail");

    const close = el("button", "ighw-lb-x", "\u00D7");
    close.type = "button";
    close.setAttribute("aria-label", "Close");

    const prev = el("button", "ighw-lb-nav ighw-lb-prev", "\u2039");
    const next = el("button", "ighw-lb-nav ighw-lb-next", "\u203A");
    prev.type = next.type = "button";
    prev.setAttribute("aria-label", "Previous post");
    next.setAttribute("aria-label", "Next post");

    const card = el("div", "ighw-lb-card");
    const media = el("div", "ighw-lb-media");
    const side = el("div", "ighw-lb-side");
    const user = el("p", "ighw-lb-user", "");
    const time = el("p", "ighw-lb-time", "");
    const caption = el("p", "ighw-lb-caption", "");
    const stats = el("p", "ighw-lb-stats", "");
    const open = el("a", "ighw-lb-open", "View on Instagram");
    open.rel = "noopener noreferrer";
    side.append(user, time, caption, stats, open);
    card.append(media, side);
    overlay.append(close, prev, card, next);

    close.addEventListener("click", closeLightbox);
    prev.addEventListener("click", () => showAt(lbIndex - 1));
    next.addEventListener("click", () => showAt(lbIndex + 1));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeLightbox(); });

    // Open Instagram in a sized popup so the host page is never navigated away.
    open.addEventListener("click", (e) => {
      e.preventDefault();
      const w = window.open(open.href, "ighw_instagram",
        "width=480,height=880,scrollbars=yes,resizable=yes");
      if (!w) window.open(open.href, "_blank", "noopener");
    });

    document.body.appendChild(overlay);
    lb = { overlay, media, user, time, caption, stats, open, prev, next };
    return lb;
  }

  function showAt(i) {
    if (i < 0 || i >= lbPosts.length) return;
    lbIndex = i;
    const post = lbPosts[i];
    const { still } = mediaFor(post);

    lb.media.textContent = "";
    const { video } = mediaFor(post);
    if (video && !post.manual) {
      // Only available for accounts the token owns; otherwise we fall back to
      // the still and hand off to Instagram.
      const v = el("video");
      v.src = video;
      if (still) v.poster = still;
      v.controls = true;
      v.autoplay = true;
      v.loop = true;
      v.playsInline = true;
      v.muted = true;
      lb.media.appendChild(v);
    } else if (still) {
      const img = el("img");
      img.src = still;
      img.alt = "";
      lb.media.appendChild(img);
    }
    lb.user.textContent = post.username ? "@" + post.username : "";
    lb.time.textContent = post.timestamp ? timeAgo(post.timestamp) : "";
    lb.caption.textContent = post.caption || "";
    const stats = [];
    if (typeof post.like_count === "number") stats.push(post.like_count + " likes");
    if (typeof post.comments_count === "number") stats.push(post.comments_count + " comments");
    lb.stats.textContent = stats.join(" \u00B7 ");
    lb.open.href = post.permalink || "#";
    lb.prev.disabled = i === 0;
    lb.next.disabled = i === lbPosts.length - 1;
  }

  function onKey(e) {
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") showAt(lbIndex - 1);
    else if (e.key === "ArrowRight") showAt(lbIndex + 1);
  }

  function openLightbox(posts, i) {
    if (!lb) buildLightbox();
    lbPosts = posts;
    lastFocus = document.activeElement;
    lb.overlay.hidden = false;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    showAt(i);
    lb.open.focus();
  }

  function closeLightbox() {
    if (!lb) return;
    const playing = lb.media.querySelector("video");
    if (playing) playing.pause();
    lb.overlay.hidden = true;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Wraps the row in a positioned container with arrow buttons, and keeps the
  // buttons disabled at each end of the scroll range.
  function buildRail(grid) {
    const rail = el("div", "ighw-rail");
    const prev = el("button", "ighw-nav ighw-nav-prev", "\u2039");
    const next = el("button", "ighw-nav ighw-nav-next", "\u203A");
    prev.type = next.type = "button";
    prev.setAttribute("aria-label", "Previous posts");
    next.setAttribute("aria-label", "Next posts");

    const step = () => Math.max(grid.clientWidth * 0.8, 200);
    prev.addEventListener("click", () => grid.scrollBy({ left: -step(), behavior: "smooth" }));
    next.addEventListener("click", () => grid.scrollBy({ left: step(), behavior: "smooth" }));

    const sync = () => {
      const max = grid.scrollWidth - grid.clientWidth;
      prev.disabled = grid.scrollLeft <= 2;
      next.disabled = grid.scrollLeft >= max - 2;
    };
    grid.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    // Re-check once content has been inserted and laid out.
    setTimeout(sync, 50);
    grid.ighwSync = sync;

    rail.appendChild(prev);
    rail.appendChild(grid);
    rail.appendChild(next);
    return rail;
  }

  // Phone photos are many megabytes; downscaling in the browser keeps uploads
  // quick on venue wifi and well inside a free storage tier.
  async function shrink(file) {
    if (!/^image\//.test(file.type)) throw new Error("That file is not an image.");
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return file; // unsupported codec (HEIC on some browsers) — send as-is
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_000_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
    return blob || file;
  }

  async function uploadPhoto(file, name) {
    const body = new FormData();
    body.append("file", await shrink(file));
    body.append("upload_preset", UPLOAD_PRESET);
    body.append("tags", UPLOAD_TAG);
    if (name) body.append("context", `name=${name.replace(/[|=]/g, " ").slice(0, 60)}`);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${UPLOAD_CLOUD}/image/upload`, {
      method: "POST",
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "Upload failed");
    return data;
  }

  function buildUploader(root) {
    const button = el("button", "ighw-add", "\uD83D\uDCF7  Add your photo");
    button.type = "button";
    const note = el("p", "ighw-add-note", "");

    const input = el("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;

    button.addEventListener("click", () => input.click());

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;

      const name = (window.prompt("Your name? (optional)") || "").trim();
      button.disabled = true;
      button.textContent = "Uploading\u2026";
      note.textContent = "";
      try {
        await uploadPhoto(file, name);
        button.textContent = "\u2713  Thanks! Your photo is on its way";
        note.textContent = "It appears on the wall within a few minutes.";
      } catch (err) {
        button.textContent = "\uD83D\uDCF7  Add your photo";
        note.textContent = err.message || "Upload failed — please try again.";
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = "\uD83D\uDCF7  Add your photo";
        }, 4000);
      }
    });

    root.append(button, note, input);
  }

  function init() {
    injectStyles();

    let host = document.getElementById(TARGET_ID);
    if (!host) {
      // No container supplied — render where the script tag sits.
      host = el("div");
      host.id = TARGET_ID;
      script.parentNode.insertBefore(host, script.nextSibling);
    }

    const root = el("div", "ighw");
    if (UPLOADS_ON) buildUploader(root);
    if (SHOW_HEADER) {
      const head = el("div", "ighw-head");
      head.appendChild(el("h2", "ighw-title", ""));
      head.appendChild(el("p", "ighw-updated", ""));
      root.appendChild(head);
    }
    const grid = el("div", "ighw-grid");
    if (LAYOUT === "row") {
      grid.classList.add("ighw-row");
      grid.style.setProperty("--ighw-card-w", CARD_WIDTH);
      root.appendChild(buildRail(grid));
    } else {
      if (COLUMNS) grid.style.gridTemplateColumns = "repeat(" + COLUMNS + ",1fr)";
      root.appendChild(grid);
    }
    host.appendChild(root);

    load(root);
    setInterval(() => load(root), REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
