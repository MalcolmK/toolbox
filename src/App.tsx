import { useEffect, useRef, useState } from "react";
import packageInfo from "../package.json";
import { toolboxEntries } from "./data/tools";
import styles from "./App.module.css";

type Theme = "light" | "dark";
type AppRoute = "toolbox" | "library-merger" | "merge-preview";
const THEME_STORAGE_KEY = "library-merger-theme";

function routeFromHash(): AppRoute {
  if (window.location.hash === "#library-merger") return "library-merger";
  if (window.location.hash === "#merge-preview") return "merge-preview";
  return "toolbox";
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M4 6h15M4 12h11M4 18h15" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m5 5 14 14M19 5 5 19" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32">
      <path d="M16 8.2c-3.8-2.7-8.1-2.7-12-1v18.4c3.9-1.7 8.2-1.7 12 1 3.8-2.7 8.1-2.7 12-1V7.2c-3.9-1.7-8.2-1.7-12 1Zm0 0v18.4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32">
      <path d="M16 5v22M5 16h22" />
    </svg>
  );
}

function ToolboxIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M20 12H5m6 6-6-6 6-6" />
    </svg>
  );
}

function SourceLibraryPanel({ letter }: { letter: "A" | "B" }) {
  const headingId = `sample-library-${letter.toLowerCase()}-heading`;

  return (
    <article className={styles.sourcePanel} aria-labelledby={headingId}>
      <div className={styles.sourcePanelHeader}>
        <h3 className={styles.sourcePanelTitle} id={headingId}>Library {letter}</h3>
        <span className={styles.sampleBadge}>Sample</span>
      </div>
      <span className={styles.sourceBookIcon}>
        <BookIcon />
      </span>
      <p className={styles.sourceLibraryName}>Sample Library {letter}</p>
      <p className={styles.sourceLibraryCaption}>Visual placeholder</p>
    </article>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />
    </svg>
  );
}

function App() {
  const [route, setRoute] = useState<AppRoute>(routeFromHash);
  const [isCompact, setIsCompact] = useState(() =>
    window.matchMedia("(max-width: 960px)").matches,
  );
  const [navigationOpen, setNavigationOpen] = useState(() =>
    !window.matchMedia("(max-width: 960px)").matches,
  );
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pageTitleRef = useRef<HTMLHeadingElement>(null);
  const placeholderDialogRef = useRef<HTMLDialogElement>(null);
  const previousOpenRef = useRef(navigationOpen);
  const previousRouteRef = useRef(route);
  const [placeholderDialogOpen, setPlaceholderDialogOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 960px)");
    const updateMode = () => setIsCompact(mediaQuery.matches);
    updateMode();
    mediaQuery.addEventListener("change", updateMode);
    return () => mediaQuery.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    const updateRoute = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const chooseTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Keep the current session usable when storage is blocked.
    }
  };

  useEffect(() => {
    if (previousOpenRef.current !== navigationOpen) {
      (navigationOpen ? closeButtonRef.current : menuButtonRef.current)?.focus();
      previousOpenRef.current = navigationOpen;
    }
  }, [navigationOpen]);

  useEffect(() => {
    if (previousRouteRef.current !== route) {
      pageTitleRef.current?.focus({ preventScroll: true });
      previousRouteRef.current = route;
    }
  }, [route]);

  useEffect(() => {
    const dialog = placeholderDialogRef.current;
    if (!dialog) return;

    if (placeholderDialogOpen && !dialog.open) {
      dialog.showModal();
    } else if (!placeholderDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [placeholderDialogOpen]);

  useEffect(() => {
    if (!navigationOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigationOpen]);

  const closeNavigation = () => setNavigationOpen(false);
  const isMergerRoute = route !== "toolbox";

  const keepFocusInDrawer = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!isCompact || event.key !== "Tab") return;

    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable.item(0);
    const last = focusable.item(focusable.length - 1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="app-shell">
      <div className="app-background" aria-hidden="true">
        <span className="app-orbit app-orbit--upper" />
        <span className="app-orbit app-orbit--lower" />
      </div>

      {navigationOpen && isCompact && (
        <div className={styles.mobileScrim} aria-hidden="true" onClick={closeNavigation} />
      )}

      <aside
        id="primary-navigation"
        className={`${styles.drawer} ${navigationOpen ? styles.drawerOpen : styles.drawerClosed}`}
        aria-label="Primary navigation"
        aria-hidden={!navigationOpen}
        aria-modal={isCompact ? true : undefined}
        role={isCompact ? "dialog" : undefined}
        inert={!navigationOpen}
        onKeyDown={keepFocusInDrawer}
      >
        <button
          ref={closeButtonRef}
          className={styles.closeButton}
          type="button"
          aria-label="Close navigation"
          onClick={closeNavigation}
        >
          <CloseIcon />
        </button>
        <nav aria-label="Tools">
          {isMergerRoute && (
            <a
              className={styles.toolboxNavigation}
              href="#toolbox"
              onClick={closeNavigation}
            >
              <ToolboxIcon />
              <span>Toolbox</span>
            </a>
          )}
          <a
            className={styles.toolNavigation}
            href="#library-merger"
            aria-current={
              route === "library-merger"
                ? "page"
                : route === "merge-preview"
                  ? "location"
                  : undefined
            }
            onClick={closeNavigation}
          >
            <span className={styles.bookIcon}>
              <BookIcon />
            </span>
            <span>JW Library Merger</span>
          </a>
        </nav>

        <div className={styles.drawerDivider} aria-hidden="true" />

        <section className={styles.drawerUtilities} aria-labelledby="theme-heading">
          <h2 className={styles.themeHeading} id="theme-heading">Theme</h2>
          <div className={styles.themeOptions} role="group" aria-labelledby="theme-heading">
            <button
              className={styles.themeButton}
              type="button"
              aria-label="Use light theme"
              aria-pressed={theme === "light"}
              onClick={() => chooseTheme("light")}
            >
              <SunIcon />
              <span className={styles.themeButtonLabel}>Light</span>
            </button>
            <span className={styles.themeDivider} aria-hidden="true" />
            <button
              className={styles.themeButton}
              type="button"
              aria-label="Use dark theme"
              aria-pressed={theme === "dark"}
              onClick={() => chooseTheme("dark")}
            >
              <MoonIcon />
              <span className={styles.themeButtonLabel}>Dark</span>
            </button>
          </div>
        </section>

        <footer className={styles.drawerFooter}>v{packageInfo.version}</footer>
      </aside>

      <main
        id={route === "toolbox" ? "toolbox" : route}
        className={`main-content ${navigationOpen ? "main-content--drawer-open" : "main-content--drawer-closed"}`}
        inert={navigationOpen && isCompact}
      >
        <header className={styles.header}>
          <button
            ref={menuButtonRef}
            className={styles.menuButton}
            type="button"
            aria-label={navigationOpen ? "Close navigation" : "Open navigation"}
            aria-controls="primary-navigation"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen((open) => !open)}
          >
            <MenuIcon />
          </button>
          <span className={styles.headerDivider} aria-hidden="true" />
          <h1 className={styles.pageTitle} ref={pageTitleRef} tabIndex={-1}>
            {route === "toolbox" ? "Toolbox" : "JW Library Merger"}
          </h1>
        </header>

        {route === "toolbox" ? (
          <section className={styles.workSurface} aria-label="Available tools">
            <ul className={styles.toolList}>
              {toolboxEntries.map((entry) => (
                <li className={styles.toolItem} key={entry.id}>
                  {entry.kind === "tool" ? (
                    <a className={`${styles.toolCard} ${styles.toolCardCurrent}`} href={entry.href}>
                      <span className={styles.toolCardIcon}>
                        <BookIcon />
                      </span>
                      <span className={styles.toolCardLabel}>{entry.name}</span>
                      <span className={styles.visuallyHidden}>Featured tool</span>
                    </a>
                  ) : (
                    <button
                      className={styles.toolCard}
                      type="button"
                      onClick={() => setPlaceholderDialogOpen(true)}
                    >
                      <span className={styles.toolCardIcon}>
                        <PlusIcon />
                      </span>
                      <span className={styles.toolCardLabel}>{entry.name}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : route === "library-merger" ? (
          <section
            className={`${styles.workSurface} ${styles.workflowSurface}`}
            aria-labelledby="workflow-heading"
          >
            <div className={styles.workflowHeading}>
              <h2 className={styles.sectionTitle} id="workflow-heading">Source libraries</h2>
              <p className={styles.sectionIntro}>Review the two sample sources before opening the preview.</p>
            </div>
            <div className={styles.sourcePair} role="group" aria-label="Sample source libraries">
              <SourceLibraryPanel letter="A" />
              <span className={styles.mergeConnector} aria-hidden="true"><ArrowRightIcon /></span>
              <SourceLibraryPanel letter="B" />
            </div>
            <div className={styles.workflowActions}>
              <button
                className={styles.primaryAction}
                type="button"
                onClick={() => {
                  closeNavigation();
                  window.location.hash = "merge-preview";
                }}
              >
                Preview Merge
              </button>
              <a className={styles.secondaryAction} href="#toolbox" onClick={closeNavigation}>
                <ArrowLeftIcon />
                <span>Back to Toolbox</span>
              </a>
            </div>
            <p className={styles.prototypeNote}>Design prototype. Sample content only; no files are selected or processed.</p>
          </section>
        ) : (
          <section
            className={`${styles.workSurface} ${styles.workflowSurface} ${styles.previewSurface}`}
            aria-labelledby="preview-heading"
          >
            <div className={styles.prototypeNotice} role="status">
              <strong>Prototype preview</strong>
              <span>Sample content only. No files have been processed.</span>
            </div>
            <div className={styles.workflowHeading}>
              <h2 className={styles.sectionTitle} id="preview-heading">Merge preview</h2>
              <p className={styles.sectionIntro}>Illustrative view of a combined library.</p>
            </div>
            <div
              className={styles.previewFlow}
              role="group"
              aria-label="Illustrative preview sources and result"
            >
              <span className={styles.previewSource}>Sample Library A</span>
              <span className={styles.mergeConnector} aria-hidden="true"><ArrowRightIcon /></span>
              <span className={styles.previewSource}>Sample Library B</span>
              <span className={styles.mergeConnector} aria-hidden="true"><ArrowRightIcon /></span>
              <div className={styles.previewResult}>
                <span className={styles.previewResultIcon}><BookIcon /></span>
                <span>
                  <strong>Combined library</strong>
                  <small>Illustrative result</small>
                </span>
              </div>
            </div>
            <div className={styles.workflowActions}>
              <a className={styles.primaryAction} href="#library-merger" onClick={closeNavigation}>
                <ArrowLeftIcon />
                <span>Back to edit</span>
              </a>
              <a className={styles.secondaryAction} href="#toolbox" onClick={closeNavigation}>
                <ToolboxIcon />
                <span>Return to Toolbox</span>
              </a>
            </div>
          </section>
        )}
      </main>

      <dialog
        ref={placeholderDialogRef}
        className={styles.placeholderDialog}
        aria-labelledby="placeholder-dialog-title"
        onClose={() => setPlaceholderDialogOpen(false)}
      >
        <h2 className={styles.dialogTitle} id="placeholder-dialog-title">Coming soon</h2>
        <p className={styles.dialogCopy}>This entry is a placeholder.</p>
        <button
          className={styles.dialogCloseButton}
          type="button"
          onClick={() => setPlaceholderDialogOpen(false)}
        >
          Close
        </button>
      </dialog>
    </div>
  );
}

export default App;
