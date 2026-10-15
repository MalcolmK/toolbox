import { expect, test, type Download } from "@playwright/test";
import JSZip from "jszip";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(testDirectory, "../fixtures/jw-library", name);

test("shows a compact comparison status and the POC notice before file creation", async ({ page }) => {
  await page.goto("#library-merger");
  await expect(page.getByRole("radio")).toHaveCount(0);

  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A").setInputFiles(fixture("empty-a.jwlibrary"));
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B").setInputFiles(fixture("empty-b.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();

  await expect(page.getByRole("heading", { name: "Resultaat van de vergelijking" })).toBeVisible();
  await expect(page.getByText("Klaar om bestand te maken")).toBeVisible();
  await expect(page.getByRole("note", { name: "POC-status" })).toContainText("acceptatie in JW Library is niet bevestigd");
  await expect(page.getByRole("button", { name: "Maak mergebestand" })).toBeVisible();

  const extendedDifferences = page.locator("details").filter({ hasText: "Bekijk uitgebreide verschilcijfers" });
  await expect(extendedDifferences).toHaveJSProperty("open", false);
});

test("applies reversible A/B choices per publication and keeps an uncertain identity blocked", async ({ page }) => {
  await page.goto("#library-merger");
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A").setInputFiles(fixture("publication-conflicts-a.jwlibrary"));
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B").setInputFiles(fixture("publication-conflicts-b.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();

  const cards = page.locator("[class*=conflictCard]");
  await expect(cards).toHaveCount(2);
  const firstPublication = cards.filter({ has: page.getByRole("heading", { name: "Publication Alpha", exact: true }) });
  const otherPublication = cards.filter({ has: page.getByRole("heading", { name: "Publication Beta", exact: true }) });
  await expect(firstPublication).toContainText("First publication note");
  await expect(firstPublication).toContainText("Second publication note");
  await expect(otherPublication).toContainText("Other publication note");

  const firstA = firstPublication.getByRole("button", { name: "Gebruik versie A voor deze publicatie" });
  const firstB = firstPublication.getByRole("button", { name: "Gebruik versie B voor deze publicatie" });
  const otherA = otherPublication.getByRole("button", { name: "Gebruik versie A voor deze publicatie" });
  const otherB = otherPublication.getByRole("button", { name: "Gebruik versie B voor deze publicatie" });

  await firstA.click();
  await expect(firstA).toHaveAttribute("aria-pressed", "true");
  await expect(otherA).toHaveAttribute("aria-pressed", "false");
  await firstB.click();
  await expect(firstB).toHaveAttribute("aria-pressed", "true");
  await expect(otherB).toHaveAttribute("aria-pressed", "false");
  await firstA.click();
  await otherB.click();
  await expect(firstA).toHaveAttribute("aria-pressed", "true");
  await expect(otherB).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByText(/\d+ open punten?/)).toBeVisible();
  await expect(page.getByText("Afspeellijstitem").first()).toBeVisible();
  await expect(page.getByText(/Voor deze back-ups is nu geen veilig mergebestand beschikbaar/)).toBeVisible();
  await expect(page.getByRole("button", { name: "3. Maak mergebestand" })).toHaveCount(0);
});

async function inspectDownloadedJwLibrary(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("De browserdownload kon niet worden gelezen.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const archive = await JSZip.loadAsync(Buffer.concat(chunks), { checkCRC32: true });
  const manifestText = await archive.file("manifest.json")?.async("string");
  expect(manifestText).toBeTruthy();
  const manifest = JSON.parse(manifestText ?? "{}") as { userDataBackup?: { databaseName?: string; hash?: string } };
  const databaseName = manifest.userDataBackup?.databaseName;
  expect(databaseName).toBeTruthy();
  expect(await archive.file(databaseName ?? "")?.async("uint8array")).toBeTruthy();
  expect(manifest.userDataBackup?.hash).toBeTruthy();
  return { entryNames: Object.keys(archive.files).filter((name) => !archive.files[name]?.dir), manifest };
}

async function selectedSourceDigests(page: import("@playwright/test").Page) {
  return page.locator('input[type="file"]').evaluateAll(async (inputs) => Promise.all(
    inputs.flatMap((input) => Array.from((input as HTMLInputElement).files ?? [])).map(async (file) => {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      return `${file.name}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }),
  ));
}

test("selects two synthetic backups, shows the Simple mode plan, and stays usable across viewport sizes", async ({ page }) => {
  await page.goto("#library-merger");
  await expect(page.getByRole("heading", { name: "Back-ups samenvoegen" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);

  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A").setInputFiles(fixture("base.jwlibrary"));
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B").setInputFiles(fixture("new-note.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();

  await expect(page.getByRole("heading", { name: "Resultaat van de vergelijking" })).toBeVisible();
  await expect(page.getByText("Geldig JW Library-bestand.")).toHaveCount(2);
  await expect(page.getByRole("note", { name: "POC-status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "3. Maak mergebestand" })).toHaveCount(0);

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

test("keeps Advanced Mode and three-way base selection out of the Simple Mode interface", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("#toolbox");
  const mergerTool = page.locator("main").getByRole("link", { name: /JW Library Merger/ });
  await expect(mergerTool).toBeVisible();
  await mergerTool.click();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A")).toBeVisible();
  await expect(page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B")).toBeVisible();
  await expect(page.getByLabel(/basisversie/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Geavanceerd/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Advanced|Geavanceerd/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Open navigation" }).click();
  const toolsNavigation = page.getByRole("navigation", { name: "Tools" });
  await expect(toolsNavigation.getByRole("link", { name: "JW Library Merger" })).toBeVisible();
  await expect(toolsNavigation.getByRole("link", { name: /Advanced|Geavanceerd/i })).toHaveCount(0);
  await expect(toolsNavigation.getByText(/Advanced Mode|Geavanceerd/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(page.getByRole("heading", { name: "Back-ups samenvoegen" })).toBeVisible();
});

test("keeps the output blocked by uncertain publication identities after all displayed choices are made", async ({ page }) => {
  await page.goto("#library-merger");
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A").setInputFiles(fixture("publication-conflicts-a.jwlibrary"));
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B").setInputFiles(fixture("publication-conflicts-b.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();

  const cards = page.locator("[class*=conflictCard]");
  await expect(cards).toHaveCount(2);
  const alpha = cards.filter({ has: page.getByRole("heading", { name: "Publication Alpha", exact: true }) });
  const beta = cards.filter({ has: page.getByRole("heading", { name: "Publication Beta", exact: true }) });
  await expect(page.getByRole("button", { name: "3. Maak mergebestand" })).toHaveCount(0);
  await alpha.getByRole("button", { name: "Gebruik versie A voor deze publicatie" }).click();
  await beta.getByRole("button", { name: "Gebruik versie B voor deze publicatie" }).click();
  await expect(alpha.getByRole("button", { name: "Gebruik versie A voor deze publicatie" })).toHaveAttribute("aria-pressed", "true");
  await expect(beta.getByRole("button", { name: "Gebruik versie B voor deze publicatie" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Publicatie- of mediaplek/).first()).toBeVisible();
  await expect(page.getByText(/Voor deze back-ups is nu geen veilig mergebestand beschikbaar/)).toBeVisible();
  await expect(page.getByRole("button", { name: "3. Maak mergebestand" })).toHaveCount(0);
});

test("builds and downloads a Simple-mode POC .jwlibrary with an explicit acceptance warning", async ({ page }) => {
  const requestBodies: string[] = [];
  page.on("request", (request) => {
    const body = request.postData();
    if (body) requestBodies.push(body);
  });
  await page.goto("#library-merger");
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A").setInputFiles(fixture("empty-a.jwlibrary"));
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B").setInputFiles(fixture("empty-b.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();

  await expect(page.getByText("Klaar om bestand te maken")).toBeVisible();
  await expect(page.getByRole("note", { name: "POC-status" })).toBeVisible();
  const sourceDigestsBefore = await selectedSourceDigests(page);
  await page.getByRole("button", { name: "3. Maak mergebestand" }).click();
  const pocNotice = page.getByRole("note", { name: "POC-waarschuwing" });
  await expect(pocNotice).toBeVisible();
  await expect(pocNotice).toContainText(/JW Library heeft deze back-up nog niet geaccepteerd/i);
  const downloadButton = page.getByRole("button", { name: /Download POC-bestand · JWLibrary-Merged-.*\.jwlibrary/ });
  await expect(downloadButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^JWLibrary-Merged-\d{4}-\d{2}-\d{2}\.jwlibrary$/);
  const inspected = await inspectDownloadedJwLibrary(download);
  expect(inspected.entryNames).toContain("manifest.json");
  expect(inspected.entryNames).toContain(inspected.manifest.userDataBackup?.databaseName);
  expect(inspected.entryNames).toContain("default_thumbnail.png");
  expect(await selectedSourceDigests(page)).toEqual(sourceDigestsBefore);
  await expect(page.getByText(/Je mergebestand wordt gedownload: JWLibrary-Merged-/)).toBeVisible();
  expect(requestBodies).toEqual([]);
});

test("handles invalid input, restarting, replacing a backup, and comparing again", async ({ page }) => {
  await page.goto("#library-merger");
  const inputA = page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A");
  const inputB = page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B");
  await inputA.setInputFiles(fixture("empty-a.jwlibrary"));
  await inputB.setInputFiles(fixture("missing-manifest.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();
  await expect(page.locator("#library-source-b-status")).toContainText(/manifest|bestand/i);
  await expect(page.getByRole("heading", { name: "Resultaat van de vergelijking" })).toHaveCount(0);

  await expect(inputB).toBeEnabled();
  await inputB.setInputFiles(fixture("empty-b.jwlibrary"));
  await expect(page.locator("#library-source-b-status")).toContainText("Geselecteerd, nog niet gecontroleerd.");
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();
  await expect(page.getByRole("heading", { name: "Resultaat van de vergelijking" })).toBeVisible();
  await page.getByRole("button", { name: "Opnieuw beginnen" }).click();
  await expect(page.getByRole("heading", { name: "Resultaat van de vergelijking" })).toHaveCount(0);
  await expect(inputA).toBeVisible();
  await expect(page.getByRole("button", { name: "Vergelijk back-ups" })).toBeEnabled();
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();
  await expect(page.getByRole("heading", { name: "Resultaat van de vergelijking" })).toBeVisible();

  await page.getByRole("button", { name: "3. Maak mergebestand" }).click();
  const downloadButton = page.getByRole("button", { name: /Download POC-bestand · JWLibrary-Merged-.*\.jwlibrary/ });
  await expect(downloadButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  await downloadPromise;
  await expect(page.getByText(/Je mergebestand wordt gedownload:/)).toBeVisible();

  await inputB.setInputFiles(fixture("empty-a.jwlibrary"));
  await expect(page.getByRole("heading", { name: "Resultaat van de vergelijking" })).toHaveCount(0);
  await expect(page.getByText(/Je mergebestand wordt gedownload:/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Mergebestand maken" })).toHaveCount(0);
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();
  await expect(page.getByRole("heading", { name: "Resultaat van de vergelijking" })).toBeVisible();
});

test("keeps source labels, validation messages, keyboard file selection, and both themes accessible", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("#library-merger");

  const inputA = page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A");
  const inputB = page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B");
  await expect(inputA).toHaveAttribute("aria-describedby", "library-source-a-status");
  await expect(inputB).toHaveAttribute("aria-describedby", "library-source-b-status");

  await inputA.focus();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Space");
  const chooser = await chooserPromise;
  await chooser.setFiles(fixture("base.jwlibrary"));
  await inputB.setInputFiles(fixture("missing-manifest.jwlibrary"));

  await expect(page.locator("#library-source-a-status")).toHaveAttribute("aria-live", "polite");
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();
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
      await expect(page.getByRole("heading", { name: "Back-ups samenvoegen" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `horizontal overflow in ${theme.label} at ${width}px`).toBe(true);
    }
  }
});

test("supports keyboard conflict choices, announces updated status, and keeps conflict layouts readable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("#library-merger");
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up A").setInputFiles(fixture("publication-conflicts-a.jwlibrary"));
  await page.getByLabel("Kies een .jwlibrary-bestand voor Back-up B").setInputFiles(fixture("publication-conflicts-b.jwlibrary"));
  await page.getByRole("button", { name: "Vergelijk back-ups" }).click();

  const cards = page.locator("[class*=conflictCard]");
  await expect(cards).toHaveCount(2);
  const alpha = cards.filter({ has: page.getByRole("heading", { name: "Publication Alpha", exact: true }) });
  const chooseA = alpha.getByRole("button", { name: "Gebruik versie A voor deze publicatie" });
  const chooseB = alpha.getByRole("button", { name: "Gebruik versie B voor deze publicatie" });
  const liveSummary = page.getByRole("status").filter({ hasText: "Vergelijking afgerond" });
  await expect(liveSummary).toHaveAttribute("aria-live", "polite");
  await expect(liveSummary).toContainText("2 keuzes nodig");

  // Use real keyboard navigation and activation, then verify a visible focus ring.
  await page.getByRole("button", { name: "Vergelijk back-ups" }).focus();
  for (let tab = 0; tab < 40 && !(await chooseA.evaluate((element) => element === document.activeElement)); tab += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(chooseA).toBeFocused();
  const focusStyle = await chooseA.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, offset: style.outlineOffset };
  });
  expect(focusStyle).toEqual({ outlineStyle: "solid", outlineWidth: "3px", offset: "3px" });
  await page.keyboard.press("Enter");
  await expect(chooseA).toHaveAttribute("aria-pressed", "true");
  await expect(liveSummary).toContainText("1 keuze nodig");

  for (const viewport of [
    { width: 375, height: 900, columns: 1 },
    { width: 768, height: 1024, columns: 2 },
    { width: 1440, height: 900, columns: 2 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `horizontal overflow at ${viewport.width}px`).toBe(true);
    const sourceColumns = await alpha.locator("[class*=conflictSources]").first().evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
    expect(sourceColumns, `conflict comparison columns at ${viewport.width}px`).toBe(viewport.columns);
    const cardWidth = await alpha.evaluate((element) => element.getBoundingClientRect().width);
    const actionWidths = await alpha.locator("[class*=conflictActions] button").evaluateAll((buttons) =>
      buttons.map((button) => (button as HTMLElement).getBoundingClientRect().width),
    );
    expect(actionWidths).toHaveLength(2);
    expect(actionWidths.every((width) => width > 0 && width <= cardWidth),
      `A/B controls fit within conflict card at ${viewport.width}px`).toBe(true);
    await expect(chooseA).toBeVisible();
    await expect(chooseB).toBeVisible();
  }

  // Confirm the semantic foreground/background styles resolve in both themes.
  for (const theme of ["light", "dark"] as const) {
    const openNavigation = page.getByRole("button", { name: "Open navigation" });
    if (await openNavigation.isVisible()) await openNavigation.click();
    await page.getByRole("button", { name: theme === "light" ? "Use light theme" : "Use dark theme" }).click();
    const themeStyles = await alpha.evaluate((element) => {
      const card = getComputedStyle(element);
      const heading = getComputedStyle(element.querySelector("h4")!);
      const decision = getComputedStyle(element.querySelector("button[aria-pressed='true']")!);
      const canvasColor = getComputedStyle(document.documentElement).getPropertyValue("--color-canvas").trim();
      const parseColor = (value: string) => {
        const [r = 0, g = 0, b = 0, alpha = 1] = value.match(/[\d.]+/g)?.map(Number) ?? [];
        return { r, g, b, alpha };
      };
      const composite = (foreground: string, background: string) => {
        const fg = parseColor(foreground);
        const bg = parseColor(background);
        const alpha = fg.alpha + bg.alpha * (1 - fg.alpha);
        return `rgb(${[fg.r, fg.g, fg.b].map((channel, index) => {
          const under = [bg.r, bg.g, bg.b][index] ?? 0;
          return Math.round((channel * fg.alpha + under * bg.alpha * (1 - fg.alpha)) / alpha);
        }).join(" ")})`;
      };
      const luminance = (value: string) => {
        const channels = parseColor(value);
        const linear = [channels.r, channels.g, channels.b].map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
      };
      const contrast = (foreground: string, background: string) => {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
      };
      const cardSurface = composite(card.backgroundColor, canvasColor);
      const selectedSurface = composite(decision.backgroundColor, cardSurface);
      return {
        cardBackground: card.backgroundColor,
        headingColor: heading.color,
        selectedBackground: decision.backgroundColor,
        selectedText: decision.color,
        focusColor: decision.outlineColor,
        headingContrast: contrast(heading.color, cardSurface),
        selectedTextContrast: contrast(decision.color, selectedSurface),
        focusContrast: contrast(decision.outlineColor, selectedSurface),
      };
    });
    expect(themeStyles.headingContrast, `heading contrast in ${theme} theme`).toBeGreaterThanOrEqual(4.5);
    expect(themeStyles.selectedTextContrast, `selected A/B text contrast in ${theme} theme`).toBeGreaterThanOrEqual(4.5);
    expect(themeStyles.focusContrast, `focus ring contrast in ${theme} theme`).toBeGreaterThanOrEqual(3);
  }
});
