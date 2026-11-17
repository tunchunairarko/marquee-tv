import { expect, expectPlaying, showControls, test, videoTime } from "../support/fixtures";

test.describe("Films", () => {
  test("browses categories, sorts and opens details", async ({ signedIn: page }) => {
    await page.getByRole("button", { name: "Movies" }).click();
    await page.locator(".chip", { hasText: "Comedy" }).click();
    await expect(page.locator(".browse__head h1")).toHaveText("Comedy");
    await expect(page.locator(".vgrid .poster-card")).toHaveCount(4);
    await page.getByRole("button", { name: "A–Z" }).click();
    await expect(page.locator(".vgrid .poster-card").first()).toContainText("Holiday Mixup");
    await page.locator(".vgrid .poster-card").first().click();
    await expect(page.locator(".details__headline h1")).toHaveText("Holiday Mixup");
    await expect(page.locator(".details__plot")).toHaveText("The plot of Holiday Mixup.");
    await expect(page.locator(".details__side")).toContainText("Jane Doe");
    await expect(page.locator(".similar .poster-card")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal")).toHaveCount(0);
  });

  test("plays, seeks and resumes a film from Continue watching", async ({ signedIn: page }) => {
    await page.getByRole("button", { name: "Movies" }).click();
    await page.locator(".row", { hasText: "Action" }).locator(".poster-card", { hasText: "Night Chase" }).click();
    await page.locator(".details__headline").getByRole("button", { name: "Play", exact: true }).click();
    await expectPlaying(page);
    await expect.poll(() => page.evaluate(() => (document.querySelector("video") as HTMLVideoElement).duration)).toBeGreaterThan(50);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => videoTime(page)).toBeGreaterThan(30);
    await page.keyboard.press("Escape"); // leaves player (not fullscreen)
    await expect(page.locator(".player")).toHaveCount(0);
    await expect(page.locator(".details__headline")).toBeVisible(); // back on the details panel
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal")).toHaveCount(0);

    await page.getByRole("button", { name: "Home" }).click();
    const row = page.locator(".row", { hasText: "Continue watching" });
    await expect(row.locator(".continue-card")).toContainText("Night Chase");
    await row.locator(".continue-card").click();
    await expect.poll(() => videoTime(page)).toBeGreaterThan(29);
  });

  test("player controls: pause, mute, settings menu", async ({ signedIn: page }) => {
    await page.locator(".row", { hasText: "New films" }).locator(".poster-card").first().click();
    await page.locator(".details__headline").getByRole("button", { name: "Play", exact: true }).click();
    await expectPlaying(page);
    await showControls(page);
    await page.getByTitle("Pause (space)").click();
    await expect.poll(() => page.evaluate(() => (document.querySelector("video") as HTMLVideoElement).paused)).toBe(true);
    await page.keyboard.press("m");
    await expect.poll(() => page.evaluate(() => (document.querySelector("video") as HTMLVideoElement).muted)).toBe(true);
    await page.getByTitle("Settings").click();
    await page.locator(".pmenu__opt", { hasText: "1.5×" }).click();
    await expect.poll(() => page.evaluate(() => (document.querySelector("video") as HTMLVideoElement).playbackRate)).toBe(1.5);
  });
});

test.describe("Series", () => {
  test("lists seasons and episodes and plays the next episode", async ({ signedIn: page }) => {
    await page.getByRole("button", { name: "Series", exact: true }).click();
    await page.locator(".poster-card", { hasText: "Harbour Lights" }).first().click();
    await expect(page.locator(".episode")).toHaveCount(3);
    await page.locator(".season-tabs button", { hasText: "Season 2" }).click();
    await expect(page.locator(".episode")).toHaveCount(2);
    await page.locator(".season-tabs button", { hasText: "Season 1" }).click();
    await page.locator(".episode").first().click();
    await expect(page.locator(".player__subtitle").first()).toContainText("S1 · E1");
    await expectPlaying(page);
    await showControls(page);
    await page.getByRole("button", { name: "Next episode" }).click();
    await expect(page.locator(".player__subtitle").first()).toContainText("S1 · E2");
  });
});
