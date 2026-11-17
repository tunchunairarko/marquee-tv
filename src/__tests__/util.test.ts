import { describe, expect, it } from "vitest";
import { cleanName, decodeBase64, formatTime, hash, normalize, yearOf } from "../lib/util";
import { normalizeServer } from "../providers/xtream";

describe("util", () => {
  it("formats durations", () => {
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(NaN)).toBe("0:00");
  });

  it("decodes UTF-8 base64 EPG titles", () => {
    expect(decodeBase64(btoa(String.fromCharCode(...new TextEncoder().encode("Café Ünïcode"))))).toBe("Café Ünïcode");
  });

  it("normalises names for search", () => expect(normalize("  Amélie: The-Film! ")).toBe("amelie the film"));
  it("strips provider prefixes", () => {
    expect(cleanName("UK: BBC One")).toBe("BBC One");
    expect(cleanName("|EN| Sky News")).toBe("Sky News");
    expect(cleanName("Plain")).toBe("Plain");
  });
  it("finds years", () => expect(yearOf(undefined, "Movie (2019)")).toBe("2019"));
  it("hashes deterministically", () => expect(hash("abc")).toBe(hash("abc")));
});

describe("normalizeServer", () => {
  it.each([
    ["provider.tv:8080", "http://provider.tv:8080"],
    ["http://provider.tv:8080/", "http://provider.tv:8080"],
    ["https://p.tv/player_api.php?username=a&password=b", "https://p.tv"],
    ["http://p.tv:80/get.php?username=a", "http://p.tv:80"],
  ])("%s → %s", (input, out) => expect(normalizeServer(input)).toBe(out));
});
