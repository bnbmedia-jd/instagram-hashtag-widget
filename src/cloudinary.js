// Guest photo uploads. Browsers upload straight to Cloudinary using an unsigned
// preset (no backend, no secret in the page); this side enumerates what landed
// there using the Admin API, whose credentials stay in CI secrets.

const API_BASE = "https://api.cloudinary.com/v1_1";

function normalise(resource, resourceType) {
  const meta = resource.context?.custom || {};
  const isVideo = resourceType === "video";
  return {
    // Prefixed so a Cloudinary public_id can never collide with an Instagram
    // media id, and so the blocklist can target uploads distinctly.
    id: `upload-${resource.public_id}`,
    media_type: isVideo ? "VIDEO" : "IMAGE",
    media_url: resource.secure_url,
    // Cloudinary derives a still from any frame; so_0 is the first one.
    thumbnail_url: isVideo
      ? resource.secure_url.replace("/upload/", "/upload/so_0/").replace(/\.[^.]+$/, ".jpg")
      : undefined,
    permalink: resource.secure_url,
    caption: meta.caption || "",
    username: meta.name || "guest",
    timestamp: resource.created_at,
    source: "upload",
  };
}

// Returns every image carrying `tag`, newest first. max_results caps at 500 per
// page, which is well beyond a weekend's worth, but paging is handled anyway so
// a busy event doesn't silently truncate.
export async function fetchUploads({ cloudName, apiKey, apiSecret, tag }) {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const posts = [];

  // Images and video are separate resource types with separate endpoints.
  for (const resourceType of ["image", "video"]) {
    posts.push(...(await fetchType({ cloudName, auth, tag, resourceType })));
  }

  return posts;
}

async function fetchType({ cloudName, auth, tag, resourceType }) {
  const posts = [];
  let cursor = null;

  do {
    const url = new URL(
      `${API_BASE}/${cloudName}/resources/${resourceType}/tags/${encodeURIComponent(tag)}`
    );
    url.searchParams.set("max_results", "500");
    url.searchParams.set("context", "true");
    if (cursor) url.searchParams.set("next_cursor", cursor);

    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    const body = await res.json();

    if (!res.ok) {
      // A type with nothing in it yet reports 404; that is not a failure.
      if (res.status === 404) return posts;
      throw new Error(`Cloudinary error (${resourceType}): ${body?.error?.message || res.statusText}`);
    }

    posts.push(...(body.resources || []).map((r) => normalise(r, resourceType)));
    cursor = body.next_cursor || null;
  } while (cursor);

  return posts;
}
