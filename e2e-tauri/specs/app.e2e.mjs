import { browser, $, expect } from "@wdio/globals";

const MOCK = "http://127.0.0.1:4599";

const requests = async () => (await fetch(`${MOCK}/__requests`)).json();
const reset = () => fetch(`${MOCK}/__reset`);

/** First element matching `selector` whose textContent includes `text`. */
async function byText(selector, text) {
  const find = () =>
    browser.execute(
      (sel, t) => [...document.querySelectorAll(sel)].find((e) => (e.textContent ?? "").includes(t)) ?? null,
      selector,
      text,
    );
  await browser.waitUntil(async () => !!(await find()), { timeoutMsg: `no ${selector} containing "${text}"` });
  return $(await find());
}

async function videoTime() {
  return browser.execute(() => document.querySelector("video.player__video")?.currentTime ?? 0);
}

async function expectPlaying(min = 0.5) {
  await browser.waitUntil(async () => (await videoTime()) > min, {
    timeout: 45_000,
    timeoutMsg: "video never started playing",
  });
}

async function closePlayer() {
  await browser.keys("Escape");
  await $(".player").waitForExist({ reverse: true });
}

describe("Simple IPTV desktop app", () => {
  it("launches on the sign-in screen", async () => {
    await expect($(".onboarding__brand h1")).toHaveText("Simple IPTV");
    expect(await browser.getTitle()).toBe("Simple IPTV Player");
  });

  it("rejects wrong credentials", async () => {
    await $('input[placeholder^="http://provider"]').setValue(MOCK);
    await $('input[autocomplete="username"]').setValue("demo");
    await $('input[type="password"]').setValue("nope");
    await (await byText("button", "Sign in")).click();
    await expect($(".form-error")).toHaveText(expect.stringContaining("Login failed"));
  });

  it("signs in through the Rust proxy", async () => {
    await reset();
    await $('input[type="password"]').clearValue();
    await $('input[type="password"]').setValue("secret");
    await (await byText("button", "Sign in")).click();
    await $(".hero__title").waitForDisplayed({ timeout: 30_000 });

    const log = await requests();
    const api = log.filter((r) => r.path === "/player_api.php");
    expect(api.length).toBeGreaterThanOrEqual(7); // auth + 3 category lists + 3 stream lists
    // The proxy's User-Agent proves requests went through Rust rather than the WebView.
    expect(api.every((r) => r.ua.startsWith("VLC/"))).toBe(true);
  });

  it("shows live channels with the programme guide", async () => {
    await (await byText(".topnav__links button", "Live TV")).click();
    await (await byText(".ch-row", "Business Today")).click();
    await expect($(".preview__head h2")).toHaveText("Business Today");
    await expect($(".epg-now h3")).toHaveText("Now on 102");
  });

  it("plays a live channel (TS → HLS fallback, segments via the proxy)", async () => {
    await reset();
    await (await byText(".ch-row", "Mock News One")).doubleClick();
    await $(".player").waitForDisplayed();
    await expectPlaying();
    const log = await requests();
    expect(log.some((r) => r.path.endsWith("/100.ts"))).toBe(true);
    expect(log.some((r) => r.path.endsWith(".m4s") && r.ua.startsWith("VLC/"))).toBe(true);
  });

  it("zaps to the next channel with the arrow keys", async () => {
    await browser.keys("ArrowDown");
    await expect($(".player__title")).toHaveText("Mock News Two");
    await expectPlaying();
    await closePlayer();
  });

  it("plays and seeks a film (HTTP Range through the proxy)", async () => {
    await (await byText(".topnav__links button", "Movies")).click();
    await (await byText(".poster-card", "Night Chase")).click();
    await (await byText(".details__headline button", "Play")).click();
    await expectPlaying();
    await browser.execute(() => {
      document.querySelector("video.player__video").currentTime = 40;
    });
    await browser.waitUntil(async () => (await videoTime()) > 40.2, {
      timeout: 30_000,
      timeoutMsg: "seek did not resume playback",
    });
    await closePlayer();
    await browser.keys("Escape");
  });

  it("restores the session after a reload", async () => {
    await browser.pause(500); // let IndexedDB commit
    await browser.execute(() => location.reload());
    await $(".hero__title").waitForDisplayed({ timeout: 30_000 });
    await byText(".row__head h2", "Continue watching");
  });
});
