import { centre, expect, test } from "../support/fixtures";

test("searches across channels, films and series", async ({ signedIn: page }) => {
  await page.keyboard.press("Control+f");
  await expect(page.locator(".search-box input")).toBeFocused();
  await page.keyboard.type("harbour");
  await expect(page.locator(".page__title")).toContainText("harbour");
  await expect(page.locator(".section", { hasText: "Films" }).locator(".poster-card")).toContainText(["Steel Harbour"]);
  await expect(page.locator(".section", { hasText: "Series" }).locator(".poster-card")).toContainText(["Harbour Lights"]);
  await page.locator(".search-box input").press("Escape");
  await expect(page.locator(".hero__title")).toBeVisible();
});

test("adds a film to My List and removes it", async ({ signedIn: page }) => {
  const card = page.locator(".row", { hasText: "New films" }).locator(".poster-card").first();
  await centre(card);
  const title = (await card.locator(".poster-card__title").textContent())!;
  await card.hover();
  await card.getByTitle("Add to My List").click();
  await page.getByRole("button", { name: "My List", exact: true }).click();
  await expect(page.locator(".poster-card")).toHaveCount(1);
  await expect(page.locator(".poster-card")).toContainText(title);
  await page.locator(".poster-card").hover();
  await page.locator(".poster-card").getByTitle("Remove from My List").click();
  await expect(page.getByText("Your list is empty")).toBeVisible();
});

test("settings: shows catalogue stats and manages playlists", async ({ signedIn: page }) => {
  await page.locator(".profile__btn").click();
  await page.getByRole("button", { name: /Settings & playlists/ }).click();
  await expect(page.locator(".stat", { hasText: "Channels" })).toContainText("9");
  await expect(page.locator(".stat", { hasText: "Films" })).toContainText("8");
  await expect(page.locator(".stat", { hasText: "Series" })).toContainText("3");

  await page.getByRole("button", { name: "HLS" }).click();
  await expect(page.getByRole("button", { name: "HLS" })).toHaveClass(/is-active/);

  await page.getByRole("button", { name: "Add playlist" }).first().click();
  await page.locator(".card .segmented button", { hasText: "M3U playlist" }).click();
  await page.getByLabel("Playlist URL or file path").fill("http://127.0.0.1:4599/get.php?username=demo&password=secret");
  await page.getByLabel("Name (optional)").fill("Second");
  await page.locator(".card form").getByRole("button", { name: "Add playlist" }).click();
  await expect(page.locator(".hero__title")).toBeVisible();
  await expect(page.locator(".row", { hasText: "Live now" }).locator(".channel-card")).toHaveCount(4);
  await page.locator(".profile__btn").click();
  await expect(page.locator(".profile__item")).toContainText(["127.0.0.1", "Second"]);
});

test("page transitions keep the nav in sync", async ({ signedIn: page }) => {
  for (const name of ["Live TV", "Movies", "Series", "My List", "Home"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".topnav__links button.is-active")).toHaveText(name);
  }
});
