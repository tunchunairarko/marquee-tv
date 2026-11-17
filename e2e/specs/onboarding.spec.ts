import { expect, loginXtream, MOCK, test } from "../support/fixtures";

test("shows the sign-in screen on first launch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marquee" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xtream Codes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "M3U playlist" })).toBeVisible();
});

test("rejects bad credentials", async ({ page }) => {
  await loginXtream(page, "wrong");
  await expect(page.locator(".form-error")).toContainText("Login failed");
  await expect(page.locator(".topnav")).toHaveCount(0);
});

test("signs in to an Xtream server and loads the catalogue", async ({ page }) => {
  await loginXtream(page);
  await expect(page.locator(".hero__title")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Live now/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /New films/ })).toBeVisible();
  await expect(page.locator(".channel-card")).toHaveCount(4); // first live category
});

test("accepts a full player_api.php URL as the server", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Server URL").fill(`${MOCK}/player_api.php?username=x`);
  await page.getByLabel("Username").fill("demo");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".hero__title")).toBeVisible();
});

test("adds an M3U playlist and groups it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "M3U playlist" }).click();
  await page.getByLabel("Playlist URL or file path").fill(`${MOCK}/get.php?username=demo&password=secret&type=m3u_plus`);
  await page.getByRole("button", { name: "Add playlist" }).click();
  await expect(page.locator(".topnav")).toBeVisible();
  await page.getByRole("button", { name: "Live TV" }).click();
  await expect(page.locator(".rail__item", { hasText: "UK | Sport" })).toBeVisible();
  await page.getByRole("button", { name: "Series", exact: true }).click();
  await page.locator(".poster-card", { hasText: "Harbour Lights" }).first().click();
  await expect(page.locator(".season-tabs button")).toHaveCount(2);
});

test("demo mode works without a provider", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /demo content/ }).click();
  await expect(page.locator(".hero__title")).toBeVisible();
});

test("state persists across restarts", async ({ page }) => {
  await loginXtream(page);
  await expect(page.locator(".hero__title")).toBeVisible();
  await page.reload();
  await expect(page.locator(".hero__title")).toBeVisible();
  await expect(page.getByLabel("Server URL")).toHaveCount(0);
});
