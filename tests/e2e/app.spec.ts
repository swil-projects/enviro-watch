import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("textbox", { name: "Username" }).fill("e2e");
  await page.getByRole("textbox", { name: "Password" }).fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("rejects bad credentials", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username" }).fill("e2e");
  await page.getByRole("textbox", { name: "Password" }).fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

test("overview shows demo banner, KPIs, provider status and current conditions", async ({ page }) => {
  await expect(page.getByText(/DEMO MODE/)).toBeVisible();
  await expect(page.getByText("Providers connected")).toBeVisible();
  for (const name of ["Obscape", "LI-COR Cloud", "Ecowitt"]) await expect(page.getByRole("main").getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current conditions" })).toBeVisible();
  await expect(page.getByText("Temperature").first()).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("station inventory → station detail with normalized observations", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Stations & Devices" }).click();
  await expect(page.getByRole("heading", { name: "Unified inventory" })).toBeVisible();
  await page.getByLabel("Search stations").last().fill("Rooftop");
  await page.getByRole("link", { name: "Demo Ecowitt — Rooftop Weather" }).click();
  await expect(page.getByRole("heading", { name: "Demo Ecowitt — Rooftop Weather" })).toBeVisible();
  // °F from the provider is shown in °C, original unit preserved in the mapping table.
  const mapping = page.getByRole("table").filter({ hasText: "Provider field" });
  await expect(mapping.getByRole("row", { name: /outdoor\.temperature/ })).toContainText("°C");
  await expect(mapping.getByRole("row", { name: /outdoor\.temperature/ })).toContainText("°F");
});

test("historical data: switch measurement and range", async ({ page }) => {
  await page.goto("/historical");
  const panel = page.getByRole("main");
  await panel.getByLabel("Station / device").selectOption({ label: "Demo LI-COR logger — Agro Station — LI-COR Cloud" });
  await panel.getByLabel("Measurement").selectOption({ label: "Relative humidity" });
  await panel.getByRole("radio", { name: "24H" }).click();
  await expect(page.getByRole("table", { name: /Relative humidity statistics/ })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("cross-provider analytics compares compatible series", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Cross-station comparison" })).toBeVisible();
  const stats = page.getByRole("table", { name: /statistics/ });
  await expect(stats).toContainText("LI-COR Cloud");
  await expect(stats).toContainText("Ecowitt");
});

test("data explorer exports CSV", async ({ page }) => {
  await page.goto("/explorer");
  await expect(page.getByRole("heading", { name: "Observations" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^observations_.*\.csv$/);
});

test("integration health shows each provider panel", async ({ page }) => {
  await page.goto("/integrations");
  for (const name of ["Obscape", "LI-COR Cloud", "Ecowitt"]) await expect(page.getByRole("main").getByText(name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/serving synthetic demo data/).first()).toBeVisible();
});

test("alerts page shows the offline demo station alert", async ({ page }) => {
  await page.goto("/alerts");
  await expect(page.getByText("Station not reporting for 2 hours").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Active alerts/ })).toBeVisible();
});

test("manual refresh is rate limited server-side", async ({ page }) => {
  const r1 = await page.request.post("/api/refresh");
  const r2 = await page.request.post("/api/refresh");
  expect([200, 429]).toContain(r1.status());
  expect(r2.status()).toBe(429);
});

test("API requires authentication", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/api/stations")).status()).toBe(401);
});

test("analytics insights follow filters and export the displayed analysis", async ({ page }) => {
  await page.goto("/analytics");
  const insights = page.getByRole("region", { name: "Series insights" });
  await expect(insights.getByText("Observed trend")).toBeVisible();
  await expect(insights.getByText("Typical range · P10–P90")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    insights.getByRole("button", { name: "Export analysis" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^analysis_air_temperature_/);
  await page.getByRole("combobox", { name: "Measurement", exact: true }).first().selectOption("wind_direction");
  await expect(page.getByRole("table", { name: /Wind direction statistics/ })).toBeVisible();
  await expect(insights.getByText("Latest observed value")).toBeVisible();
  await expect(insights.getByText("Trend fitting is available", { exact: false })).toBeVisible();
});

test("history errors offer recovery and mobile analytics fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/analytics/timeseries?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "History temporarily unavailable" } }) }));
  await page.goto("/analytics");
  await expect(page.getByText("Could not load history", { exact: true })).toBeVisible();
  await page.unroute("**/api/analytics/timeseries?**");
  await page.getByRole("button", { name: "Retry history" }).click();
  await expect(page.getByRole("region", { name: "Series insights" })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("future-only history windows are rejected", async ({ page }) => {
  const start = new Date(Date.now() + 86_400_000).toISOString();
  const end = new Date(Date.now() + 172_800_000).toISOString();
  const response = await page.request.get(`/api/analytics/timeseries?metric=air_temperature&range=custom&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  expect(response.status()).toBe(400);
});
