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
  const SHOW_HEADER = script.dataset.header !== "false";
  const REFRESH_MS = 15 * 60 * 1000;

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

  function renderPost(post) {
    const link = el("a", "ighw-post");
    link.href = post.permalink || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

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

  async function load(root) {
    const grid = root.querySelector(".ighw-grid");
    try {
      const res = await fetch(FEED_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("feed " + res.status);
      const data = await res.json();
      const posts = (data.posts || []).slice(0, LIMIT);

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
      posts.forEach((p) => frag.appendChild(renderPost(p)));
      grid.appendChild(frag);
      if (grid.ighwSync) setTimeout(grid.ighwSync, 50);
    } catch (err) {
      grid.textContent = "";
      grid.appendChild(el("p", "ighw-empty", "Feed unavailable."));
      if (window.console) console.warn("[ig-hashtag-widget]", err.message);
    }
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
