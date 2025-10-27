"use client";

import { useMemo, useState } from "react";

type Row = {
  title: string;
  artist: string;
  links?: {
    appleStoreCandidates: string[];
    appleWeb?: string | null;
    bandcamp?: string | null;
    bandcampSearch: string;
  } | null;
};

const COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "SE", label: "Sweden" },
  { code: "JP", label: "Japan" },
  { code: "BR", label: "Brazil" },
];

export default function Page() {
  const [url, setUrl] = useState("");
  const [country, setCountry] = useState("GB");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const countryName = useMemo(
    () => COUNTRIES.find((c) => c.code === country)?.label ?? country,
    [country]
  );

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl: url, country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setRows(data.results);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function openApple(candidates: string[] = [], web?: string | null) {
    const tryNext = (i: number) => {
      if (i >= candidates.length) {
        if (web) window.open(web, "_blank", "noopener,noreferrer");
        return;
      }
      const href = candidates[i];
      const timer = setTimeout(() => tryNext(i + 1), 800);
      window.location.assign(href);
      void timer;
    };
    tryNext(0);
  }

  function downloadCSV() {
    const header = [
      "Title",
      "Artist",
      "Country",
      "iTunesStore(1st)",
      "AppleWeb",
      "BandcampDirect",
      "BandcampSearch",
    ].join(",");
    const safe = (s: string) => (s ?? "").toString().replace(/[\r\n,]+/g, " ");
    const lines = rows.map((r) => {
      const firstStore = r.links?.appleStoreCandidates?.[0] ?? "";
      const aWeb = r.links?.appleWeb ?? "";
      const bc = r.links?.bandcamp ?? "";
      const bcSearch = r.links?.bandcampSearch ?? "";
      return [safe(r.title), safe(r.artist), country, firstStore, aWeb, bc, bcSearch].join(",");
    });
    const blob = new Blob([header + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const dl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dl;
    a.download = "playlist_links.csv";
    a.click();
    URL.revokeObjectURL(dl);
  }

  return (
    <main className="min-h-screen pt-20 md:pt-28">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12 space-y-6">
        {/* Header */}
        <header className="space-y-4">
  {/* Make the title link to Instagram */}
  <a
    href="http://instagram.com/speelburg"
    target="_blank"
    rel="noreferrer"
    className="h1-words unstyled-link"
    title="Follow SPEELBURG on Instagram"
  >
    <span>BUY</span>
    <span>YOUR</span>
    <span>PLAYLIST</span>
  </a>

  <div className="header-just space-y-2 text-sm md:text-base opacity-90 leading-relaxed">
    <p>paste your spotify playlist URL below</p>

    {/* byline: centered, same size as line above, 'SPEELBURG' in blue and linked */}
    <p className="no-justify text-sm md:text-base">
  by&nbsp;&nbsp;
  <a
    href="http://instagram.com/speelburg"
    target="_blank"
    rel="noreferrer"
    className="link-blue"
    title="SPEELBURG on Instagram"
  >
    speelburg
  </a>
</p>

  </div>
</header>


{/* Controls panel (peach box with green border and angled shadow) */}
<section className="rounded-2xl p-4 md:p-5 panel-surface psd-shadow">
  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
    {/* URL input */}
    <input
      className="flex-1 rounded-xl px-4 py-3 text-base w-full"
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
      placeholder="paste spotify playlist link here"
      value={url}
      onChange={(e) => setUrl(e.target.value)}
    />

    {/* Country + Generate: stack on mobile, row on sm+ */}
    <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 sm:items-center">
      <select
        className="rounded-xl px-3 py-2 text-sm md:text-base w-full sm:w-auto sm:min-w-[12rem] shrink"
        style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        title="Select your iTunes Store region"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.label}
          </option>
        ))}
      </select>

      <button
        onClick={handleGenerate}
        disabled={loading || !url}
        className="rounded-xl px-5 py-3 text-base disabled:opacity-50 btn-solid w-full sm:w-auto whitespace-nowrap"
      >
        {loading ? "Working..." : "Generate"}
      </button>
    </div>
  </div>

  <div className="mt-2 text-xs opacity-80">
    current store: <span className="font-medium">{countryName}</span>
  </div>
</section>
{/* bottom single link under main box */}
<div className="bottom-bar single">
  <a
    href="https://open.spotify.com/album/3hEiBBpfYIVEUuyftPyqu0?si=ptgMN3ElT8SxZq97nf1URw"
    target="_blank"
    rel="noreferrer"
    title="Listen to Silver Medal Slump by SPEELBURG"
  >
    i made an album called &nbsp;&nbsp;<span className="blue">silver &nbsp; medal &nbsp; slump</span>
  </a>
</div>







        {/* Error */}
        {error && (
          <div
            className="rounded-xl p-3 text-sm"
            style={{
              border: "1px solid var(--border)",
              background: "color-mix(in oklab, var(--panel), #ff0000 10%)",
              color: "var(--foreground)",
            }}
          >
            {error}
          </div>
        )}

        {/* Results list (kept from your existing code) */}
        {!!rows.length && (
          <section className="rounded-2xl overflow-hidden panel-surface psd-shadow">
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="text-sm opacity-80">
                {rows.length} result{rows.length === 1 ? "" : "s"}
              </div>
              <button onClick={downloadCSV} className="rounded-lg px-3 py-2 text-sm btn-outline">
                Download CSV
              </button>
            </div>

            <ul>
              {rows.map((r, i) => (
                <li
                  key={i}
                  className="px-4 py-4"
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div
                        className="text-base md:text-lg font-semibold truncate"
                        title={r.title}
                      >
                        {r.title}
                      </div>
                      <div className="text-sm opacity-90 truncate" title={r.artist}>
                        {r.artist}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-1 sm:mt-0 sm:justify-end">
                      {r.links?.appleStoreCandidates?.length ? (
                        <button
                          className="rounded-lg px-3 py-2 text-sm btn-outline"
                          onClick={() =>
                            openApple(r.links?.appleStoreCandidates, r.links?.appleWeb)
                          }
                          title="Open iTunes Store in the Music/iTunes app"
                        >
                          iTunes Store (buy)
                        </button>
                      ) : (
                        r.links?.appleWeb && (
                          <a
                            className="rounded-lg px-3 py-2 text-sm btn-outline"
                            href={r.links.appleWeb}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Apple (web)
                          </a>
                        )
                      )}

                      {r.links?.bandcamp ? (
                        <a
                          className="rounded-lg px-3 py-2 text-sm btn-outline"
                          href={r.links.bandcamp}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Bandcamp (direct)
                        </a>
                      ) : (
                        r.links?.bandcampSearch && (
                          <a
                            className="rounded-lg px-3 py-2 text-sm btn-outline"
                            href={r.links.bandcampSearch}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Bandcamp (search)
                          </a>
                        )
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
