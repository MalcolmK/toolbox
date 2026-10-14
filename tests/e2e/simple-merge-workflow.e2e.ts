import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(testDirectory, "../fixtures/jw-library", name);

test("selects two synthetic backups, shows the Simple mode plan, and stays usable across viewport sizes", async ({ page }) => {
  await page.goto("#library-merger");
  await expect(page.getByRole("heading", { name: "JW Library Merger" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Simpel" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Geavanceerd" })).toBeDisabled();

  await page.getByLabel("Kies .jwlibrary-bestand A").setInputFiles(fixture("base.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand B").setInputFiles(fixture("new-note.jwlibrary"));
  await page.getByRole("button", { name: "Controleer en maak mergeplan" }).click();

  await expect(page.getByRole("heading", { name: "Vergelijking en mergeplan" })).toBeVisible();
  await expect(page.getByText("Geldig JW Library-bestand · schema 16")).toHaveCount(2);
  await expect(page.getByText("Controle nodig")).toBeVisible();
  await expect(page.getByText(/De bestandsstap is geblokkeerd/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Naar bestand maken" })).toHaveCount(0);

  await page.getByText(/Alle inhoudelijke verschillen bekijken/).click();
  await expect(page.getByText("Aantekening: Added synthetic note")).toBeVisible();

  for (const viewport of [
    { width: 375, height: 812, columns: 1 },
    { width: 768, height: 1024, columns: 2 },
    { width: 1440, height: 900, columns: 2 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const noHorizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noHorizontalOverflow, `horizontal overflow at ${viewport.width}px`).toBe(true);
    const columnCount = await page.locator("[class*=sourceGrid]").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
    expect(columnCount, `source layout at ${viewport.width}px`).toBe(viewport.columns);
  }
});

test("allows the build stage only when the merge plan has no unresolved choices", async ({ page }) => {
  await page.goto("#library-merger");
  await page.getByLabel("Kies .jwlibrary-bestand A").setInputFiles(fixture("empty-a.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand B").setInputFiles(fixture("empty-b.jwlibrary"));
  await page.getByRole("button", { name: "Controleer en maak mergeplan" }).click();

  await expect(page.getByText("Keuzes afgerond")).toBeVisible();
  await expect(page.getByRole("button", { name: "Naar bestand maken" })).toBeEnabled();
  await page.getByRole("button", { name: "Naar bestand maken" }).click();
  await expect(page.getByRole("heading", { name: "Mergeplan klaar voor de bestandsstap" })).toBeVisible();
  await expect(page.getByText(/er is nu nog geen bestand gemaakt/)).toBeVisible();
});

test("keeps source labels, validation messages, keyboard file selection, and both themes accessible", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("#library-merger");

  const inputA = page.getByLabel("Kies .jwlibrary-bestand A");
  const inputB = page.getByLabel("Kies .jwlibrary-bestand B");
  await expect(inputA).toHaveAttribute("aria-describedby", "library-source-a-status");
  await expect(inputB).toHaveAttribute("aria-describedby", "library-source-b-status");

  await inputA.focus();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Space");
  const chooser = await chooserPromise;
  await chooser.setFiles(fixture("base.jwlibrary"));
  await inputB.setInputFiles(fixture("missing-manifest.jwlibrary"));

  await expect(page.locator("#library-source-a-status")).toHaveAttribute("aria-live", "polite");
  await page.getByRole("button", { name: "Controleer en maak mergeplan" }).click();
  await expect(page.locator("#library-source-b-status")).toContainText(/manifest|bestand/i);
  await expect(page.locator("#library-source-b-status")).toHaveAttribute("role", "status");

  for (const theme of [
    { label: "Use light theme", pressed: "true" },
    { label: "Use dark theme", pressed: "true" },
  ]) {
    await page.setViewportSize({ width: 375, height: 900 });
    const openNavigation = page.getByRole("button", { name: "Open navigation" });
    if (await openNavigation.isVisible()) await openNavigation.click();
    await page.getByRole("button", { name: theme.label }).click();
    await expect(page.getByRole("button", { name: theme.label })).toHaveAttribute("aria-pressed", theme.pressed);
    const closeNavigation = page.getByRole("button", { name: "Close navigation" });
    if (await closeNavigation.isVisible()) await closeNavigation.click();
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { name: "JW Library Merger" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `horizontal overflow in ${theme.label} at ${width}px`).toBe(true);
    }
  }
});
