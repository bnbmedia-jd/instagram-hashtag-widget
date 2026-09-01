const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

const MEDIA_FIELDS =
  "id,caption,media_type,media_url,permalink,timestamp,username,like_count,comments_count";

async function graphGet(path, params) {
  const url = new URL(`${GRAPH_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url);
  const body = await res.json();

  if (!res.ok) {
    const message = body?.error?.message || res.statusText;
    throw new Error(`Instagram API error (${path}): ${message}`);
  }

  return body;
}

// Resolves a hashtag name to its numeric ID. Do this once per hashtag and
// cache the result — repeated lookups count against the 30-unique-hashtags
// per 7-day quota, but re-fetching media for an ID you already have does not.
export async function resolveHashtagId(hashtag, businessAccountId, accessToken) {
  const data = await graphGet("ig_hashtag_search", {
    user_id: businessAccountId,
    q: hashtag,
    access_token: accessToken,
  });

  const id = data?.data?.[0]?.id;
  if (!id) {
    throw new Error(`No hashtag ID returned for #${hashtag}`);
  }
  return id;
}

// edge is either "recent_media" or "top_media".
export async function fetchHashtagMedia(hashtagId, businessAccountId, accessToken, edge) {
  const data = await graphGet(`${hashtagId}/${edge}`, {
    user_id: businessAccountId,
    fields: MEDIA_FIELDS,
    access_token: accessToken,
  });

  return data?.data || [];
}
