import { NextRequest, NextResponse } from "next/server";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_PLAYLIST_API = (id: string) =>
  `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`;
const ITUNES_SEARCH = "https://itunes.apple.com/search";

// ---------- Short-link expansion ----------
const SHORT_HOSTS = new Set([
  "spotify.link",
  "www.spotify.link",
  "spoti.fi",
  "link.tospotify.com",
  "spotify.app.link",
]);

async function expandSpotifyUrl(input: string): Promise<string> {
  // Allow native URI straight through
  if (/^spotify:playlist:[a-z0-9]+$/i.test(input)) return input;

  let parsed: URL;
  try { parsed = new URL(input); } catch { return input; }

  const host = parsed.hostname.toLowerCase();
  if (!SHORT_HOSTS.has(host) && !SHORT_HOSTS.has(host.replace(/^www\./, ""))) return input;

  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (res.url) return res.url;

    const html = await res.text().catch(() => "");
    const m =
      html.match(/https?:\/\/open\.spotify\.com\/[^\s"'<>]+/i) ||
      html.match(/content=["'][^"']*url=(https?:\/\/open\.spotify\.com\/[^"']+)/i);
    if (m && m[1]) return m[1];
    if (m && m[0]) return m[0];
    return input;
  } catch {
    return input;
  }
}

/** Try to parse playlist ID from URL path/URI */
function parseIdFromUrlOrUri(input: string) {
  const uri = input.match(/^spotify:playlist:([a-zA-Z0-9]+)/i);
  if (uri) return uri[1];

  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Invalid URL"); }

  // Handles /playlist/{id}, /intl-en/playlist/{id}, /user/.../playlist/{id}, etc.
  const m = url.pathname.match(/\/playlist\/([a-zA-Z0-9]+)/i);
  if (m?.[1]) return m[1];

  throw new Error("Could not parse playlist ID");
}

/** Final safety net: ask oEmbed for the embed HTML and extract the ID */
async function parseIdViaOEmbed(unknownUrl: string) {
  try {
    const o = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(unknownUrl)}`,
      { cache: "no-store", headers: { Accept: "application/json" } }
    );
    if (!o.ok) return null;
    const data = await o.json();
    const html: string = data?.html ?? "";

    // <iframe src="https://open.spotify.com/embed/playlist/{ID}?..."
    const m1 = html.match(/\/embed\/playlist\/([a-zA-Z0-9]+)/i);
    if (m1?.[1]) return m1[1];

    // Or sometimes a URI shows up inside
    const m2 = html.match(/spotify:playlist:([a-zA-Z0-9]+)/i);
    if (m2?.[1]) return m2[1];

    return null;
  } catch {
    return null;
  }
}

// ---------- Spotify ----------
async function getSpotifyAppToken() {
  const id = process.env.SPOTIFY_CLIENT_ID!;
  const secret = process.env.SPOTIFY_CLIENT_SECRET!;
  if (!id || !secret) throw new Error("Missing Spotify env vars");
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to get Spotify token");
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function fetchAllTracks(playlistId: string, token: string) {
  let url = SPOTIFY_PLAYLIST_API(playlistId);
  const items: { title: string; artist: string }[] = [];

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch Spotify tracks");
    const data = await res.json();
    for (const it of data.items ?? []) {
      const track = it?.track;
      if (!track) continue;
      const title = track.name;
      const artist = (track.artists?.map((a: any) => a.name) ?? []).join(", ");
      if (title && artist) items.push({ title, artist });
    }
    url = data.next;
  }
  return items;
}

// ---------- Bandcamp (same as before) ----------
function cleanTrackTitleForSearch(raw: string) {
  let t = raw;
  t = t.replace(/[\(\[][^)\]]*[\)\]]/g, " ");
  t = t.replace(/\s-\s.*$/i, " ");
  t = t.replace(/\b(20\d{2}|19\d{2})\b/g, " ");
  t = t.replace(/\b(remaster(ed)?|remix|live|mono|stereo|edit|version|deluxe|spatial|atmos)\b.*$/i, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
function normalizeTokens(s: string) {
  return s.toLowerCase().replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
}
function similarityScore(title: string, artist: string, url: string) {
  const u = url.toLowerCase();
  const artistMain = artist.split(",")[0];
  const aTokens = normalizeTokens(artistMain);
  const tTokens = normalizeTokens(title);
  let score = 0;
  for (const tok of aTokens) if (u.includes(tok)) score += 2;
  for (const tok of tTokens) if (u.includes(tok)) score += 1;
  if (/remix|mix|cover|tribute|edit|karaoke/.test(u)) score -= 3;
  if (/live|concert/.test(u)) score -= 1;
  if (/\.bandcamp\.com\/track\//.test(u)) score += 2;
  const artistSlug = aTokens.join("-");
  if (artistSlug && u.includes(`${artistSlug}.bandcamp.com`)) score += 3;
  return score;
}
async function searchBandcamp(titleRaw: string, artist: string) {
  const title = cleanTrackTitleForSearch(titleRaw);
  const query = `${artist} ${title}`.trim();
  const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=t`;
  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) return { direct: null as string | null, search: searchUrl };
    const html = await res.text();
    const rx = /https?:\/\/[a-z0-9-]+\.bandcamp\.com\/track\/[a-z0-9-]+/gi;
    const matches = Array.from(new Set(html.match(rx) ?? []));
    if (!matches.length) return { direct: null, search: searchUrl };
    let best = matches[0];
    let bestScore = -999;
    for (const m of matches) {
      const s = similarityScore(title, artist, m);
      if (s > bestScore) { best = m; bestScore = s; }
    }
    if (bestScore >= 6) return { direct: best, search: searchUrl };
    return { direct: null, search: searchUrl };
  } catch {
    return { direct: null, search: searchUrl };
  }
}

// ---------- Apple / iTunes (same as before) ----------
function buildITunesStoreCandidates(trackId?: number, collectionId?: number) {
  const c: string[] = [];
  if (trackId && collectionId) {
    c.push(`itms://itunes.apple.com/WebObjects/MZStore.woa/wa/viewAlbum?i=${trackId}&id=${collectionId}&uo=4&app=itunes`);
    c.push(`itms://itunes.apple.com/album/id${collectionId}?i=${trackId}&uo=4&app=itunes`);
    c.push(`itms://itunes.apple.com/WebObjects/MZStore.woa/wa/viewSong?i=${trackId}&uo=4&app=itunes`);
  } else if (collectionId) {
    c.push(`itms://itunes.apple.com/album/id${collectionId}?uo=4&app=itunes`);
  }
  return c;
}
async function searchITunesLinks(title: string, artist: string, country: string) {
  const cleanTitle = cleanTrackTitleForSearch(title);
  const term = `${cleanTitle} ${artist}`;
  const params = new URLSearchParams({
    term, media: "music", entity: "song", limit: "5", country: country || "US",
  });
  const res = await fetch(`${ITUNES_SEARCH}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) return { storeCandidates: [] as string[], web: null as string | null };
  const data = await res.json();
  let best: any = null;
  for (const r of data.results ?? []) {
    const a = (r.artistName || "").toLowerCase();
    const t = (r.trackName || "").toLowerCase();
    if (a.includes(artist.toLowerCase()) && t.includes(cleanTitle.toLowerCase())) { best = r; break; }
    if (!best) best = r;
  }
  if (!best) return { storeCandidates: [], web: null };
  const trackId: number | undefined = best.trackId;
  const collectionId: number | undefined = best.collectionId;
  const web: string | null = best.trackViewUrl || best.collectionViewUrl || null;
  const storeCandidates = buildITunesStoreCandidates(trackId, collectionId);
  return { storeCandidates, web };
}

// ---------- Handler ----------
export async function POST(req: NextRequest) {
  try {
    const { playlistUrl, country } = await req.json();
    if (!playlistUrl) return NextResponse.json({ error: "playlistUrl required" }, { status: 400 });

    // 1) Try to expand short link
    const expanded = await expandSpotifyUrl(playlistUrl);

    // 2) Try to parse directly
    let playlistId: string | null = null;
    try { playlistId = parseIdFromUrlOrUri(expanded); } catch { /* fall through */ }

    // 3) Fallback to oEmbed if still unknown
    if (!playlistId) {
      const viaOEmbed = await parseIdViaOEmbed(expanded || playlistUrl);
      if (viaOEmbed) playlistId = viaOEmbed;
    }
    if (!playlistId) throw new Error("Could not parse playlist ID");

    const { access_token } = await getSpotifyAppToken();
    const tracks = await fetchAllTracks(playlistId, access_token);
    const storeCountry = (country || "US").toUpperCase();

    const results = await Promise.all(
      tracks.map(async (t) => {
        const apple = await searchITunesLinks(t.title, t.artist, storeCountry);
        const bc = await searchBandcamp(t.title, t.artist);
        return {
          title: t.title,
          artist: t.artist,
          links: {
            appleStoreCandidates: apple.storeCandidates,
            appleWeb: apple.web || null,
            bandcamp: bc.direct || null,
            bandcampSearch: bc.search,
          },
        };
      })
    );

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
