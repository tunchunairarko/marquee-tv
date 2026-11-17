import { expect, test as base, type Locator, type Page } from "@playwright/test";

export const MOCK = "http://127.0.0.1:4599";

export async function loginXtream(page: Page, password = "secret") {
  await page.goto("/");
  await page.getByLabel("Server URL").fill(MOCK);
  await page.getByLabel("Username").fill("demo");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Scroll an element to the middle of the viewport (clear of the fixed nav). */
export async function centre(locator: Locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
}

/** Wake the auto-hiding player controls (a move to the same spot fires no event). */
export async function showControls(page: Page) {
  await page.mouse.move(500, 300);
  await page.mouse.move(640, 420, { steps: 3 });
  await expect(page.locator(".player")).not.toHaveClass(/is-idle/);
}

export async function videoTime(page: Page, selector = "video.player__video") {
  return page.evaluate((sel) => (document.querySelector(sel) as HTMLVideoElement | null)?.currentTime ?? 0, selector);
}

export async function expectPlaying(page: Page, selector = "video.player__video") {
  await expect.poll(() => videoTime(page, selector), { timeout: 20_000, message: "video should advance" }).toBeGreaterThan(0.5);
}

export const test = base.extend<{ signedIn: Page }>({
  signedIn: async ({ page }, use) => {
    await loginXtream(page);
    await expect(page.locator(".hero__title")).toBeVisible();
    await use(page);
  },
});

export { expect };
