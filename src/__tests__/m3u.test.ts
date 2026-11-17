import { describe, expect, it } from "vitest";
import { parseM3u } from "../lib/m3u";

describe("parseM3u", () => {
  const src = `#EXTM3U url-tvg="http://epg.example/guide.xml"
#EXTINF:-1 tvg-id="bbc1" tvg-logo="http://l/1.png" group-title="UK, Entertainment",BBC One HD
http://x/live/u/p/1.ts
#EXTINF:-1 group-title="Films",A Film (2020)
http://x/movie/u/p/2.mkv
#EXTINF:-1,No Group
#EXTGRP:Fallback Group
http://x/stream
http://x/bare-url.mp4
`;
  const pl = parseM3u(src);

  it("reads the EPG url", () => expect(pl.epgUrl).toBe("http://epg.example/guide.xml"));

  it("parses attributes including commas inside quotes", () => {
    expect(pl.entries[0]).toMatchObject({ name: "BBC One HD", group: "UK, Entertainment", tvgId: "bbc1", logo: "http://l/1.png", kind: "live" });
  });

  it("classifies VOD by path", () => {
    expect(pl.entries[1].kind).toBe("movie");
    expect(pl.entries[3].kind).toBe("movie");
  });

  it("falls back to #EXTGRP and to the URL as a name", () => {
    expect(pl.entries[2]).toMatchObject({ name: "No Group", group: "Fallback Group" });
    expect(pl.entries[3]).toMatchObject({ name: "http://x/bare-url.mp4", group: "Uncategorised" });
  });
});
