# Design Brief

This document describes the visual and interaction direction for the first version of the web toolbox. It is a design brief, not a final brand specification. The attached light and dark theme screenshots are the most recent visual references and add concrete layout details to the earlier direction below.

## Product purpose

Create a calm, responsive browser-based toolbox that can host several small tools, starting with **JW Library Merger**. The toolbox should work on Windows, macOS, iPhone, and iPad in current browsers. The home screen is a compact tool launcher, not a marketing page.

## Visual reference and hierarchy

Use the attached `Dark theme.png` and `Light theme.png` as the current composition references. Both show the navigation drawer open so its contents and relationship to the home screen are visible. The target composition includes:

1. A full-window, softly illuminated abstract background with large overlapping curved forms.
2. A translucent left navigation drawer with a close control, the JW Library Merger navigation item, a divider, theme controls, and version text.
3. A wide, rounded, translucent header in the main area, with a hamburger control, vertical divider, and the page title **Toolbox**.
4. A centered glass work surface containing three large tool cards in the desktop reference: **JW Library Merger** and two **New Tool** placeholders.
5. A cyan/teal accent used for the active tool and selected theme, with restrained glow and focus effects.

The images use Dutch placeholder labels, but the open-source project and all product-facing copy must be in English. Use **New Tool** in the prototype. Keep cards to an icon and short tool name; do not add explanatory descriptions.

## Home screen

- Keep the tool launcher compact and visually centered in the available main area.
- The first card is JW Library Merger, represented by a simple open-book icon.
- Include two clearly labelled New Tool placeholder cards in the design prototype to match the reference composition. They are demonstrative placeholders, not promises of shipped tools. Make this count easy to change later.
- Tool cards are full-card links/buttons, not just clickable icons or labels.
- Give hover, keyboard focus, pressed/selected, and disabled/placeholder states coherent treatments. Do not make touch use depend on hover.
- On narrow screens, reflow cards and work surface without horizontal scrolling or clipped text.

## Header and navigation drawer

- The main header contains an accessible hamburger button, a thin separator, and the current page title. The screenshot shows **Toolbox** on the home screen.
- Activating the hamburger opens a left-side drawer. The screenshots show the drawer open; the page should also have a useful closed state.
- The drawer contains a close button, navigation to JW Library Merger (and future tools when they exist), then a lower section with the theme setting and current version.
- Close the drawer using its close button, the Escape key, a navigation choice, and (if implemented) an outside click. On mobile, keep it within the viewport and ensure its controls are reachable.
- When open, provide appropriate focus handling and expose the drawer's open/closed state accessibly.

## Theme direction

Provide light and dark themes with matching structure, spacing, component sizes, and interaction behavior. Change theme materials, contrast, background illumination, and surface colors only.

- **Dark:** deep navy/graphite background; softly layered cool blue glass; restrained cyan accent; readable light text.
- **Light:** pale blue/white illuminated background; translucent light surfaces; dark blue-gray text; the same cyan accent.
- The cyan accent is a design exploration, not a final brand choice. Define it centrally so it can be changed without restructuring components.
- The selected theme control should be clear in both themes. Do not communicate selection by color alone.
- Respect an explicit user theme choice between visits. When no choice exists, the system preference may be used as the initial theme.
- Make the interface usable when `backdrop-filter` or other decorative effects are unavailable; glass blur must not be required for contrast or content separation.

## Background, glass, and motion

- Treat the screenshots' abstract orbital curves, blurred light points, and soft glow as decorative background art. Keep them behind all content and prevent them from reducing text contrast.
- Prefer a locally bundled, optimized static background asset or CSS/SVG shapes. Do not fetch background assets from a remote service at runtime.
- Use translucent layers, fine borders, and restrained shadows to separate the drawer, header, work surface, and cards.
- Keep blur and glow subtle enough to preserve text clarity and avoid excessive GPU work on mobile devices.
- Use short, restrained transitions. Respect `prefers-reduced-motion` and make the drawer usable without animation.

## Responsive behavior

The visual reference is a wide desktop composition. Treat it as a proportion and hierarchy reference, not a pixel-locked layout.

- **Phone:** use a comfortable drawer width that fits the viewport; cards stack or use a compact grid; maintain touch-sized controls and readable spacing.
- **Tablet:** allow two or more card columns when each card remains comfortably readable; avoid an oversized drawer.
- **Desktop:** retain the left drawer, broad header, and centered glass work surface with three cards in one row where space permits.
- Define breakpoints from content constraints and verify narrow, medium, and wide viewports.
- Prevent horizontal scrolling, obscured controls, clipped labels, and layout jumps when the drawer opens or the theme changes.

## Accessibility

- Use semantic navigation, headings, buttons, and links with useful accessible names.
- Ensure all navigation and theme controls work with a keyboard and show a clear focus indicator.
- Use an appropriate drawer pattern, including focus behavior, Escape handling, and announced state.
- Maintain readable text and control contrast over translucent surfaces in both themes.
- Use visible non-color cues for selected, focused, pressed, and disabled states.
- Respect reduced-motion preferences and provide sufficiently large touch targets.

## Technical and scope constraints

- Preferred stack: TypeScript, React, and Vite; deployment target: static GitHub Pages.
- Keep the accent, theme, spacing, typography, border, and motion values in shared design tokens.
- Keep visual components suitable for later independent tools; do not couple each tool's future logic to the home-screen layout.
- Process files on-device in a future functional phase. Do not upload user files or add a backend, accounts, or a database.
- The current design phase may provide clickable navigation and simulated interface states, but it does not implement JSON/ZIP reading, validation, merging, or downloads.

## Open design decisions

- Final accent color and brand identity.
- Final icon family and icons for future tools.
- Whether the two New Tool placeholders remain in the first public release.
- Exact card dimensions, breakpoints, drawer behavior on small screens, and background implementation.
- Final theme color values, blur strength, shadow softness, and motion timings.

