import { useEffect, useRef, useState } from "react";
import packageInfo from "../package.json";
import { toolboxEntries } from "./data/tools";
import { LibraryMergerPage } from "./tools/jw-library-merger/components/LibraryMergerPage";
import styles from "./App.module.css";

type Theme = "light" | "dark";
type AppRoute = "toolbox" | "library-merger";
const THEME_STORAGE_KEY = "library-merger-theme";

function routeFromHash(): AppRoute {
  if (window.location.hash === "#library-merger") return "library-merger";
  return "toolbox";
}

function MenuToggleIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? styles.menuIconOpen : styles.menuIconClosed}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path className={styles.menuIconLineTop} d="M5 7h14" />
      <path className={styles.menuIconLineMiddle} d="M5 12h14" />
      <path className={styles.menuIconLineBottom} d="M5 17h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.5 15.5 4.2 4.2" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
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

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M20 12H5m6 6-6-6 6-6" />
    </svg>
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
  const [toolSearch, setToolSearch] = useState("");
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const toolSearchRef = useRef<HTMLInputElement>(null);
  const routeHeadingRef = useRef<HTMLHeadingElement>(null);
  const placeholderDialogRef = useRef<HTMLDialogElement>(null);
  const previousOpenRef = useRef(navigationOpen);
  const previousRouteRef = useRef(route);
  const [placeholderDialogOpen, setPlaceholderDialogOpen] = useState(false);
  const normalizedToolSearch = toolSearch.trim().toLowerCase();
  const filteredToolboxEntries = toolboxEntries.filter((entry) =>
    entry.name.toLowerCase().includes(normalizedToolSearch),
  );

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
      menuButtonRef.current?.focus();
      previousOpenRef.current = navigationOpen;
    }
  }, [navigationOpen]);

  useEffect(() => {
    if (previousRouteRef.current !== route) {
      if (route === "toolbox") {
        toolSearchRef.current?.focus({ preventScroll: true });
      } else {
        routeHeadingRef.current?.focus({ preventScroll: true });
      }
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
    if (!isCompact || !navigationOpen || event.key !== "Tab") return;

    const drawer = event.currentTarget.querySelector<HTMLElement>("#primary-navigation");
    if (!drawer || !menuButtonRef.current) return;

    const drawerFocusable = drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = menuButtonRef.current;
    const last = drawerFocusable.item(drawerFocusable.length - 1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (event.shiftKey && document.activeElement === drawerFocusable.item(0)) {
      event.preventDefault();
      first.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="app-shell" onKeyDown={keepFocusInDrawer}>
      <div className="app-background" aria-hidden="true">
        <span className="app-orbit app-orbit--upper" />
        <span className="app-orbit app-orbit--lower" />
      </div>

      {navigationOpen && isCompact && (
        <div className={styles.mobileScrim} aria-hidden="true" onClick={closeNavigation} />
      )}

      <button
        ref={menuButtonRef}
        className={`${styles.menuButton} ${navigationOpen ? styles.menuButtonOpen : styles.menuButtonClosed}`}
        type="button"
        aria-label={navigationOpen ? "Close navigation" : "Open navigation"}
        aria-controls="primary-navigation"
        aria-expanded={navigationOpen}
        onClick={() => setNavigationOpen((open) => !open)}
      >
        <MenuToggleIcon open={navigationOpen} />
      </button>

      <aside
        id="primary-navigation"
        className={`${styles.drawer} ${navigationOpen ? styles.drawerOpen : styles.drawerClosed}`}
        aria-label="Primary navigation"
        aria-hidden={!navigationOpen}
        inert={!navigationOpen}
      >
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
            aria-current={route === "library-merger" ? "page" : undefined}
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
        className={`main-content ${navigationOpen ? "main-content--drawer-open" : "main-content--drawer-closed"} ${route === "toolbox" ? "" : "main-content--subpage"}`}
        inert={navigationOpen && isCompact}
      >
        {route !== "toolbox" && !navigationOpen && (
          <a className={styles.subpageBackLink} href="#toolbox" onClick={closeNavigation}>
            <ArrowLeftIcon />
            <span>Back to Toolbox</span>
          </a>
        )}

        {route === "toolbox" ? (
          <>
            <header className={styles.header}>
              <h1 className={styles.visuallyHidden}>Toolbox</h1>
              <label className={styles.searchField}>
                <SearchIcon />
                <span className={styles.visuallyHidden}>Search apps</span>
                <input
                  ref={toolSearchRef}
                  className={styles.searchInput}
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Search apps…"
                  value={toolSearch}
                  onChange={(event) => setToolSearch(event.currentTarget.value)}
                />
                {toolSearch.length > 0 && (
                  <button
                    className={styles.clearSearchButton}
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setToolSearch("");
                      toolSearchRef.current?.focus();
                    }}
                  >
                    <ClearIcon />
                  </button>
                )}
              </label>
            </header>

            <section className={styles.workSurface} aria-label="Available tools">
              {filteredToolboxEntries.length > 0 ? (
                <ul className={styles.toolList}>
                  {filteredToolboxEntries.map((entry) => (
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
              ) : (
                <p className={styles.emptySearchState} role="status">
                  No apps found.
                </p>
              )}
            </section>
          </>
        ) : (
          <LibraryMergerPage
            surfaceClassName={`${styles.workSurface} ${styles.workflowSurface}`}
            headingRef={route === "library-merger" ? routeHeadingRef : undefined}
          />
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
