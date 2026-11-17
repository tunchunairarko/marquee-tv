import { expect, expectPlaying, MOCK, test } from "../support/fixtures";

test.describe("Live TV", () => {
  test.beforeEach(async ({ signedIn: page }) => {
    await page.getByRole("button", { name: "Live TV" }).click();
  });

  test("lists categories with counts and filters channels", async ({ signedIn: page }) => {
    await expect(page.locator(".rail__item", { hasText: "UK | News" })).toContainText("4");
    await page.locator(".rail__item", { hasText: "UK | Sport" }).click();
    await expect(page.locator(".ch-row")).toHaveCount(3);
    await page.getByPlaceholder(/Search 3 channels/).fill("goal");
    await expect(page.locator(".ch-row")).toHaveCount(1);
    await expect(page.locator(".ch-row")).toContainText("Goal Channel");
  });

  test("shows now/next programme guide for the selected channel", async ({ signedIn: page }) => {
    await page.locator(".ch-row", { hasText: "Business Today" }).click();
    await expect(page.locator(".preview__head h2")).toHaveText("Business Today");
    await expect(page.locator(".epg-now h3")).toHaveText("Now on 102");
    await expect(page.locator(".epg-list li").first()).toContainText("Later show 1");
  });

  test("plays a channel, falling back from MPEG-TS to HLS", async ({ signedIn: page, request }) => {
    await request.get(`${MOCK}/__reset`);
    await page.locator(".ch-row", { hasText: "Mock News One" }).dblclick();
    await expect(page.locator(".player")).toBeVisible();
    await expect(page.locator(".player__title")).toHaveText("Mock News One");
    await expectPlaying(page);
    const log: { path: string }[] = await (await request.get(`${MOCK}/__requests`)).json();
    expect(log.some((r) => r.path.endsWith("/100.ts"))).toBeTruthy();
    expect(log.some((r) => r.path.endsWith("/100.m3u8"))).toBeTruthy();
    expect(log.some((r) => r.path.endsWith(".m4s"))).toBeTruthy();
  });

  test("zaps channels with the keyboard and closes with Escape", async ({ signedIn: page }) => {
    await page.locator(".ch-row", { hasText: "Mock News One" }).dblclick();
    await expect(page.locator(".player__title")).toHaveText("Mock News One");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".player__title")).toHaveText("Mock News Two");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".player__title")).toHaveText("Mock News One");
    await page.keyboard.press("Escape");
    await expect(page.locator(".player")).toHaveCount(0);
  });

  test("favourites a channel and lists it under Favourites", async ({ signedIn: page }) => {
    const row = page.locator(".ch-row", { hasText: "Tennis" });
    await page.locator(".rail__item", { hasText: "UK | Sport" }).click();
    await row.hover();
    await row.getByTitle("Add to My List").click();
    await page.locator(".rail__item", { hasText: "Favourites" }).click();
    await expect(page.locator(".ch-row")).toHaveCount(1);
    await expect(page.locator(".ch-row")).toContainText("Tennis Live");
    await page.reload();
    await page.getByRole("button", { name: "Live TV" }).click();
    await expect(page.locator(".rail__item.is-active")).toContainText("Favourites");
  });
});
