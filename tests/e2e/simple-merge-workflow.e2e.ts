import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(testDirectory, "../fixtures/jw-library", name);

test("selects two synthetic backups, shows the Simple mode plan, and stays usable across viewport sizes", async ({ page }) => {
  await page.goto("#library-merger");
  await expect(page.getByRole("heading", { name: "JW Library Merger" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Simpel" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Geavanceerd" })).toBeEnabled();

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

test("compares an optional base against A and B without treating it as an output source", async ({ page }) => {
  await page.goto("#library-merger");
  await page.getByRole("radio", { name: "Geavanceerd" }).check();
  await expect(page.getByLabel("Kies .jwlibrary-bestand als basisversie", { exact: true })).toBeVisible();

  await page.getByLabel("Kies .jwlibrary-bestand als basisversie", { exact: true }).setInputFiles(fixture("base.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand A", { exact: true }).setInputFiles(fixture("modified-note-newer.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand B", { exact: true }).setInputFiles(fixture("base.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk wijzigingen" }).click();

  await expect(page.getByRole("heading", { name: "Driewegvergelijking" })).toBeVisible();
  await expect(page.getByText("Basisversie gebruikt")).toBeVisible();
  await expect(page.getByText("Wijziging alleen in A").first()).toBeVisible();
  await expect(page.getByText(/Basisversie: base\.jwlibrary/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Naar bestand maken" })).toHaveCount(0);
  await expect(page.getByText(/De basisversie is alleen gebruikt om wijzigingen te herkennen/)).toBeVisible();
});

test("reviews conflicts one at a time with source values, timestamps, and reversible choices", async ({ page }) => {
  await page.goto("#library-merger");
  await page.getByRole("radio", { name: "Geavanceerd" }).check();
  await page.getByLabel("Kies .jwlibrary-bestand als basisversie", { exact: true }).setInputFiles(fixture("base.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand A", { exact: true }).setInputFiles(fixture("conflict-source-a.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand B", { exact: true }).setInputFiles(fixture("conflict-source-b.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk wijzigingen" }).click();

  const review = page.getByRole("region", { name: "Conflicten beoordelen" });
  await expect(review.getByText(/Item 1 van/)).toBeVisible();
  await expect(review.getByRole("region", { name: "Bron A" })).toBeVisible();
  await expect(review.getByRole("region", { name: "Bron B" })).toBeVisible();
  await expect(review.getByRole("region", { name: "Basis" })).toBeVisible();
  await expect(review.getByText(/Archief aangemaakt/).first()).toBeVisible();
  await expect(review.getByText(/Synthetic note/).first()).toBeVisible();
  await expect(review.getByRole("button", { name: "Vorig conflict" })).toBeDisabled();

  await review.getByRole("group", { name: "Keuze voor dit conflict" }).getByRole("button", { name: "Behoud A" }).click();
  await expect(review.getByText("Voorlopige keuze: Behoud A")).toBeVisible();
  await expect(review.getByRole("group", { name: "Keuze voor dit conflict" }).getByRole("button", { name: "Behoud A" })).toHaveAttribute("aria-pressed", "true");
  const next = review.getByRole("button", { name: "Volgend conflict" });
  if (await next.isEnabled()) {
    await next.click();
    await expect(review.getByText(/Item 2 van/)).toBeVisible();
    await expect(review.getByRole("button", { name: "Vorig conflict" })).toBeEnabled();
    await review.getByRole("button", { name: "Vorig conflict" }).click();
    await expect(review.getByText(/Item 1 van/)).toBeVisible();
    await review.getByRole("group", { name: "Keuze voor dit conflict" }).getByRole("button", { name: "Behoud B" }).click();
    await expect(review.getByText("Voorlopige keuze: Behoud B")).toBeVisible();
    await expect(review.getByRole("group", { name: "Keuze voor dit conflict" }).getByRole("button", { name: "Behoud B" })).toHaveAttribute("aria-pressed", "true");
  }
});

test("compares note blocks by default, supports line choices, both variants, and explicit manual text", async ({ page }) => {
  await page.goto("#library-merger");
  await page.getByRole("radio", { name: "Geavanceerd" }).check();
  await page.getByLabel("Kies .jwlibrary-bestand als basisversie", { exact: true }).setInputFiles(fixture("base.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand A", { exact: true }).setInputFiles(fixture("conflict-source-a.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand B", { exact: true }).setInputFiles(fixture("conflict-source-b.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk wijzigingen" }).click();

  const review = page.getByRole("region", { name: "Conflicten beoordelen" });
  await expect(review.getByRole("heading", { name: "Aantekening · Conflict" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resterende keuzes beoordelen" })).toBeDisabled();
  const textReview = review.getByRole("region", { name: "Aantekeningstekst samenvoegen" });
  await expect(textReview.getByRole("button", { name: "Blokken" })).toHaveAttribute("aria-pressed", "true");
  await expect(textReview.getByText(/overlappende tekstblokken gekozen/)).toBeVisible();
  await expect(textReview.getByText(/Conflicting edit from source A/).first()).toBeVisible();

  await expect(textReview.getByRole("button", { name: "Neem beide fragmenten op" })).toBeDisabled();
  await expect(textReview.getByText(/geen bestaand regeleinde tussen de twee tekstwaarden/)).toBeVisible();
  await textReview.getByRole("button", { name: "Behoud A" }).click();
  await expect(textReview.getByText("Informatie die deze keuze buiten het blok laat")).toBeVisible();
  await expect(page.getByRole("region", { name: "Voorlopig informatieverlies" }).getByText(/Behoud A; dit tekstfragment wordt niet meegenomen/)).toBeVisible();
  await textReview.getByRole("button", { name: "Regels" }).click();
  await expect(textReview.getByRole("button", { name: "Regels" })).toHaveAttribute("aria-pressed", "true");
  await textReview.getByRole("button", { name: "Bewerk tekst zelf" }).click();
  const manualEditor = textReview.getByRole("textbox", { name: "Handmatig samengestelde tekst" });
  await manualEditor.fill("Zelf gekozen tekst ☀️\nlaatste regel");
  await expect(textReview.locator("[class*=textSelectionPreview]")).toContainText("Zelf gekozen tekst ☀️");
  await expect(page.getByRole("region", { name: "Voorlopig informatieverlies" }).getByText(/Handmatige tekst vervangt de bronfragmenten/)).toBeVisible();
  for (let index = 0; index < 20; index += 1) {
    const nextItem = review.getByRole("button", { name: "Volgend conflict" });
    if (!(await nextItem.isEnabled())) break;
    await nextItem.click();
    const wholeRecordChoice = review.getByRole("group", { name: "Keuze voor dit conflict" });
    if (await wholeRecordChoice.count()) await wholeRecordChoice.getByRole("button", { name: "Behoud A" }).click();
  }
  for (let index = 0; index < 20; index += 1) {
    const previousItem = review.getByRole("button", { name: "Vorig conflict" });
    if (!(await previousItem.isEnabled())) break;
    await previousItem.click();
  }
  await expect(textReview.getByRole("textbox", { name: "Handmatig samengestelde tekst" })).toHaveValue("Zelf gekozen tekst ☀️\nlaatste regel");
  await expect(page.getByRole("button", { name: "Besluiten afronden" })).toBeEnabled();
  await page.getByRole("button", { name: "Besluiten afronden" }).click();
  await expect(page.getByText(/Alle vereiste beslissingen zijn ingevuld/)).toBeVisible();
  await expect(review.getByRole("button", { name: "Naar bestand maken" })).toHaveCount(0);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `horizontal overflow in note review at ${width}px`).toBe(true);
  }
});

test("runs the local build stage for a resolved plan and keeps download blocked without a verified manifest", async ({ page }) => {
  const requestBodies: string[] = [];
  page.on("request", (request) => {
    const body = request.postData();
    if (body) requestBodies.push(body);
  });
  await page.goto("#library-merger");
  await page.getByLabel("Kies .jwlibrary-bestand A").setInputFiles(fixture("empty-a.jwlibrary"));
  await page.getByLabel("Kies .jwlibrary-bestand B").setInputFiles(fixture("empty-b.jwlibrary"));
  await page.getByRole("button", { name: "Controleer en maak mergeplan" }).click();

  await expect(page.getByText("Keuzes afgerond")).toBeVisible();
  await expect(page.getByRole("button", { name: "Naar bestand maken" })).toBeEnabled();
  await page.getByRole("button", { name: "Naar bestand maken" }).click();
  await expect(page.getByRole("heading", { name: "Back-up opbouwen en controleren" })).toBeVisible();
  await page.getByRole("button", { name: "Bestand maken en controleren" }).click();
  await expect(page.getByText(/Download geblokkeerd/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download niet beschikbaar" })).toBeDisabled();
  await expect(page.locator("a[download]")).toHaveCount(0);
  await expect(page.getByText(/hash-regel.*niet geverifieerd/i)).toBeVisible();
  expect(requestBodies).toEqual([]);
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
