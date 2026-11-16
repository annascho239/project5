# Specification — Current Direction

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

## Goal and intended experience

Phase 2 proves **Inner Orbit** as a browser-based memory wallpaper maker for iPhone. A User names a memory, finds where it happened, enters its local date and approximate time, chooses Calm or Energized, and receives a full-screen map of the real constellations above that location at that moment. The same composition exports as a static iPhone 15 Pro wallpaper.

The result is an astronomical interpretation, not a photograph. It does not recreate weather, terrain, buildings, light pollution, or exact naked-eye visibility.

## Phase 3 addition: constellation launcher (planned; not yet built)

A player aims and launches a ball from the bottom of a portrait board. The ball moves at constant speed with no gravity, bounces off the side walls, the top, and the pegs, and bounces off the stars too. A launch ends when the ball leaves the bottom, after 8 bounces, or after 20 seconds. A ball touching a constellation's star lights it once. When every star is lit the constellation is filled and the player sees catalog facts. The score is the number of launches; fewer is better.

Acceptance checks (to be tested as built):

1. Each level is a real constellation from the vendored catalog (about 5–9 stars), drawn in its real relative arrangement, with every star inside the board and large enough to hit.
2. Bumper pegs are visibly distinct from stars, are placed deterministically, and never overlap a star.
3. The same level, aim, and launch always produce the same path and result.
4. Lighting a star is idempotent; the level is won only when every star is lit (never a level with no stars); each launch increments the count exactly once; a launch is spent after 8 bounces.
5. The facts shown on winning come only from catalog data (name, IAU abbreviation, Latin and genitive names, star count).
6. The game works by touch and by keyboard (arrow keys to aim, Space to launch); stars lit, launch count, and results are available as text; a reduced-motion option shows a launch's outcome without animation.
7. The game makes no network request and stores no personal data.
8. Mood choices from the wallpaper maker do not apply to the game.

This changes the pitch's wallpaper-maker framing; see `plan.md` for the approval boundary.

## Phase 3 stage B: Explore constellations (planned; not yet built)

After the memory form resolves a place and moment, the **Explore constellations** action lists the constellations above the horizon at that moment. Each card says whether it is fully in view or partly above the horizon, and offers **Play** (only when playable) and **Learn**. Completed constellations are drawn brighter on the downloadable wallpaper.

Acceptance checks (to be tested as built):

1. A constellation is listed when at least one of its stars is above the horizon; it is *fully in view* only when all are. Chicago at 9:00 PM on January 1, 2025 lists Orion and Cassiopeia and never lists Crux; Sydney at the same local time lists Crux and never Cassiopeia.
2. The altitude and compass direction computed for a star agree with d3-celestial's own sky, which draws the wallpaper, so the list and the wallpaper never disagree. (Verified in `tests/sky-engine.html` for seven place-and-time cases and four browser time zones.) The sky library must be given the browser's current UTC offset as its `timezone`, never the place's; otherwise it draws the wrong time of night.
3. A constellation is playable only if it has 12 stars or fewer, its stars are at least 32 board units apart, and some aim reaches every star. Unplayable constellations are still listed, with Learn only and a stated reason.
4. Learn facts come only from the vendored catalog or are computed from it for the chosen place and moment.
5. Changing the place, date, or time changes the list, and the list is the same for the same inputs.
6. The wallpaper highlights exactly the constellations the player completed in that session.
7. No memory text appears in a URL, storage, or any request; only the place search text leaves the browser.

## Current behavior and acceptance checks

### Memory and place

- Required inputs are memory title, selected place, date, local time, and mood.
- Place search runs only after an explicit action and sends only the place-search text to Open-Meteo.
- Results include region/country context. Typed text alone is not a resolved location; the User must select a result.
- Selection stores display name, latitude, longitude, and IANA time zone in browser memory.
- Editing place text after selection invalidates that selection.
- Errors identify the unresolved field without clearing other valid input.

Acceptance checks:

1. `Chicago` offers a selectable Chicago, Illinois result with `America/Chicago`.
2. Similarly named places can be distinguished and selected deliberately by touch or keyboard.
3. No request includes memory title, date, time, mood, or image.

### Time and astronomy

- Date/time is interpreted in the selected place's IANA zone, not the phone's current zone.
- Nonexistent daylight-saving times are rejected; duplicated fall-back times require an earlier/later choice.
- A valid place-time produces a sky centered on the observer's zenith, enlarged to cover the whole wallpaper. The horizon itself falls outside the frame, so the wallpaper shows the upper part of the sky above the horizon, not the sky nearest it.
- The map shows catalog stars, conventional constellation lines, and rank-1 constellation names that fall in view.

Acceptance checks:

1. The same local input at distant locations produces different maps.
2. Changing time by several hours changes sky orientation while retaining memory and mood.
3. A known DST gap cannot silently become a different time.
4. Adjacent text states the selected place, local date/time, zone, and that the map represents the sky above the horizon, cropped to the screen.

### Mood and composition

- Calm and Energized are mutually exclusive presets.
- Mood changes palette, glow, contrast, and decorative intensity only.
- Mood never changes star coordinates, horizon, constellation lines/names, place, or time.
- Wallpaper text includes the memory title, selected place, and local date/time.
- The sky is full-bleed decoration. Essential text (title, place, date/time) stays within the provisional safe region (10% side margins, below 30% of the height, above 90%) and sits on a dark fade so it stays readable over the stars.

### Preview and export

- Preview and export use the same resolved astronomy state and composition rules.
- Preview preserves the iPhone 15 Pro portrait ratio without stretching.
- Export validates, creates one temporary 1179 × 2556 Canvas, and produces a named PNG with `toBlob()`.
- Failures preserve form state and allow retry. Temporary full-resolution resources and blob URLs are released.

Acceptance checks:

1. The PNG is nonempty and exactly 1179 × 2556.
2. Preview and PNG contain matching constellation geometry, metadata, and mood.
3. Five consecutive iPhone Safari exports complete without a crash or persistent freeze.
4. The Developer can save the PNG to Photos and use it as a Lock Screen with essential content visible.

### Privacy and accessibility

- Disclose the Open-Meteo request and show Open-Meteo/GeoNames attribution.
- Other memory data remains in browser memory; no account, analytics, persistent storage, or application backend.
- Use semantic controls, logical focus order, visible focus, and text status/error messages.
- Canvas has fallback or adjacent result text. Meaning does not depend only on pixels or color.

## Current architecture

```text
semantic form
    ├── explicit place search ──► Open-Meteo ──► coordinates + IANA zone
    └── title + date + local time + mood
                         │
                  validation + Luxon
                         │
                  resolved instant/state
                         │
        d3-celestial sky + shared wallpaper composition
                         │
                  ┌──────┴──────┐
                  ▼             ▼
             preview Canvas   1179×2556 Canvas ──► PNG
```

One state object owns `memoryTitle`, `placeQuery`, selected `place`, `localDate`, `localTime`, DST disambiguation, `mood`, resolved UTC `instant`, and interface status. Astronomical positions derive from coordinates and instant; they are never invented or edited as free points.

Responsibilities:

- `wallpaper.html` (was `index.html` until Nov 16, 2026): semantic form, privacy disclosure, search results, Canvas fallback, summary, status, credits, and export action. `index.html` is now a landing page that links to the game and to this page.
- `styles.css`: layout, safe composition, focus/error states, and visual system.
- `app.js`: state, validation, explicit network request, result selection, time conversion, astronomy configuration, preview/export orchestration, and cleanup.
- Local vendor/data files: pinned d3-celestial, D3 v3, Luxon, magnitude-6 stars, constellation lines/names, licenses, and credits. No runtime CDN dependency.

First prove that d3-celestial can redraw the same sky at preview and export-map resolution. If its global Canvas model makes that unreliable, stop and review evidence with the Developer before choosing a custom renderer or another library.

## Approved decisions

- **November 9, 2026 — Replace invented personal stars with a real all-sky map.** This better connects the artifact to a specific memory, but changes the approved pitch and requires milestone disclosure.
- **Use d3-celestial for the Phase 2 proof.** It is the smallest evaluated option combining the needed catalog, observer transform, horizon, constellations, and Canvas output.
- **Use explicit Open-Meteo search.** It resolves coordinates and time zone in one response while limiting disclosure and requests.
- **Use Luxon for place-local time.** Native parsing can apply the wrong device zone; Temporal is not a dependable iPhone baseline.
- **November 9, 2026 — Fill the whole screen with the sky.** The Developer preferred a full-bleed sky to a circle. The sky disc is scaled to cover the screen diagonal (horizon off-screen) and the text sits on a bottom fade. This trades away the visible horizon edge and the sky nearest the horizon. The sky canvas is built at a device pixel ratio of 1 because d3-celestial otherwise multiplies it by the ratio, which would exceed Safari's canvas limit on a 3× iPhone.
- **Keep mood as styling only** and keep static 1179 × 2556 output.
- **November 9, 2026 — Name only rank-1 constellations on the wallpaper.** Comparing exported PNGs at phone size showed ranks 1–2 and all names collide near the center and clip at the disc edge. Stars, lines, and the horizon are unaffected; the rule is `LABELS.ranksShown` in `app.js`.

---

# Archived Specification — Generated-Star Prototype

The specification below is retained as a record of the superseded prototype. Where it conflicts with the current direction above, the current direction governs.

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

Purpose: Keep a concise, testable description of what the project should do now and how the system is structured to do it.

## Working agreement

Developer: Approve the intended behavior and the system's structure, test directly, understand each part well enough to explain it in your own words, and update this file whenever either changes.

Agent: Read the project documents and inspect the project. Turn the Developer's decisions into acceptance checks without inventing product choices or freezing details that still need testing. Propose structures suited to the project's scope, with their trade-offs, in plain language. Keep the architecture consistent with the actual project and point out where they have drifted apart. Do not restructure the project without the Developer's approval.

When you begin this step, start a fresh chat so its transcript stays clean. For example:

`Read the project documents, inspect the project, and help me specify what the next version should do.`

## Intended experience

Phase 2 proves the core of **Inner Orbit** as a browser-based iPhone wallpaper maker. A User can describe one to five meaningful people, places, or memories as stars, choose either a Calm or Energized mood, see the constellation update, and export the same composition as a static iPhone 15 Pro wallpaper.

The prototype should already feel understandable and personal, but Phase 2 prioritizes a reliable end-to-end result over final visual polish. It does not need accounts, saved galleries, desktop output, external images, or animated wallpaper export. Personal labels remain in the current browser session and are not sent to a server.

## Behavior and acceptance checks

### Star input

Approved behavior:

- The form starts with at least one editable star and allows a maximum of five.
- Each star has a short text label and one category: Person, Place, or Memory.
- A User can add and remove stars without reloading the page. The interface prevents a sixth star and does not allow all star inputs to be removed.
- A blank or whitespace-only label is invalid. Export is blocked until every visible star is valid, and the form identifies what needs correction in text.
- Editing a valid star updates the preview without changing the other entered labels or categories.

Acceptance checks:

1. One valid star produces a visible constellation; five valid stars produce five visible primary stars.
2. Adding a sixth star is not possible, and removing the only remaining star is not possible.
3. Blank labels block export and produce a clear message associated with the relevant input.
4. Category controls have programmatic labels and can be operated by touch and keyboard.

The maximum label length remains provisional. Before Phase 2 sign-off, test representative 12-, 20-, and 30-character labels, then the Developer will choose and record a limit that remains legible in the exported safe region.

### Mood presets

Approved behavior:

- The User chooses one of two mutually exclusive presets: **Calm** or **Energized**.
- The presets create visibly different atmospheres through at least color and visual intensity; the difference cannot depend on motion alone.
- Changing mood changes the atmosphere but does not move or relabel the primary constellation stars.

Acceptance checks:

1. Calm and Energized are distinguishable in both preview and export.
2. Switching between them preserves all star data and normalized star positions.
3. Each mood's textual name remains available outside the Canvas, so color is not the only indicator.

The exact palettes, glow strength, and background details are provisional visual mappings to test. Calm should read as softer and lower-energy; Energized should read as brighter and higher-energy while remaining legible.

### Preview

Approved behavior:

- The preview uses the same state and render function as export.
- It maintains the iPhone 15 Pro portrait aspect ratio as its container changes size and never stretches the artwork.
- It updates after valid input and mood changes without a page reload.
- It includes a concise text description stating the star count, categories, and selected mood.
- Phase 2 preview and export are static. Optional preview animation is later work and must respect reduced-motion preferences if added.

Acceptance checks:

1. The preview remains proportional at narrow and wide browser viewport sizes.
2. Its primary stars, connections, relative positions, and mood match the exported PNG.
3. Canvas fallback or adjacent text conveys the current result without requiring the pixels to be seen.

### PNG export

Approved behavior:

- Export validates the current form before doing any Canvas work.
- A valid export creates one temporary Canvas at exactly **1179 × 2556 pixels**, renders the current state, and requests a PNG with `toBlob()`.
- A successful result initiates a clearly named PNG download and reports success in text.
- The temporary blob URL and full-resolution Canvas references are released after use. Full-resolution canvases are not stored in a gallery.
- A null blob, Canvas allocation error, or other export failure leaves the form data intact and shows a useful text error without exposing raw implementation details.

Acceptance checks:

1. The downloaded file is nonempty, identifies as PNG, and reports dimensions of 1179 × 2556.
2. One-star and five-star exports preserve the preview's essential composition and keep all allowed labels within the current safe-region rules.
3. Five consecutive exports on the test iPhone complete without a Safari crash or visible long-term freeze.
4. A forced or simulated export failure produces the error state and permits another attempt.
5. The Developer can move the result into Photos if necessary, set it as the iPhone 15 Pro Lock Screen, and inspect it with the actual clock and controls.

### Privacy and accessibility

Approved behavior:

- Star data and mood state exist only in browser memory for Phase 2. The app makes no request containing personal input and does not use analytics, accounts, or persistent storage.
- All form and export actions use semantic HTML controls in a logical focus order. Every control has an accessible name and visible keyboard focus.
- Status and error messages are available as text and announced without unexpectedly moving focus.
- Meaning does not depend only on color, Canvas pixels, or motion.

Acceptance checks:

1. The complete form and export flow can be operated with a keyboard.
2. Focus is always visible and follows the visual task order.
3. Inspection of the Phase 2 build shows no network request containing labels or mood data.

## Architecture

How the system works and the structural decisions that keep it coherent, consistent, and easy to change. Adapt these sections to your project and tech stack.

### Overview

The prototype uses semantic HTML for the interaction, CSS for responsive layout and branding, and plain JavaScript for state, validation, Canvas rendering, and export. Canvas is an output view, not the form interface.

```text
HTML controls
     │ input
     ▼
single app state ──► validation ──► text status/summary
     │
     ├──► renderScene(preview canvas, preview size, state)
     │
     └──► renderScene(export canvas, 1179×2556, state)
                                      │
                                      ▼
                               PNG blob/download
```

Both rendering paths call the same `renderScene` rule. Preview-specific and export-specific drawing implementations are not allowed because they can drift apart.

### Data and state

A single JavaScript state object is the source of truth for the current design:

- `stars`: an ordered array of one to five objects containing an internal ID, label, category, and normalized placement values;
- `mood`: either `calm` or `energized`;
- temporary validation and export status needed by the interface.

Normalized placement values use relative coordinates rather than preview pixels. The renderer converts them into target pixels for whichever Canvas it receives. Export dimensions are configuration constants, not User state. The DOM inputs and Canvas must be updated from state rather than treated as competing sources of truth.

State is not sent to a server or persisted in Phase 2. Reloading the page may reset the current design.

### Interaction loop

1. The User changes a star or mood control.
2. The event handler validates and updates the single state object.
3. The interface updates validation text and the accessible result summary.
4. `renderScene` redraws the preview from the current valid state.
5. When the User requests export, the app validates all state again.
6. If valid, it creates one full-resolution Canvas, calls the same renderer, encodes a PNG blob, starts the download, reports the result, and releases temporary resources.
7. If any step fails, the app reports the failure and preserves the User's inputs for another attempt.

### Visual and content rules

- Use the Inner Orbit direction from the pitch: midnight-blue foundation, electric-violet and coral accents, geometric typography, and a reflective but playful tone.
- Use system fonts during Phase 2 unless a font is later researched and credited. Do not depend on an external font for export reliability.
- Primary stars, their labels, and their connections are the constellation layer. Background stars, gradients, and glow form the mood layer and must not compete with primary content.
- Keep primary stars and labels inside the middle 80% of the wallpaper, leaving a 10% margin on every edge. Avoid essential labels in the upper central clock area. The latter boundary remains provisional until the real Lock Screen test.
- Use Canvas commands and local code only in Phase 2. Do not load external raster images.
- Calm and Energized must differ without relying on animation. Preview and PNG remain static.
- Keep text concise and plain. Do not describe mood choices as diagnoses, scores, or mental-health conclusions.

### Structure rules

- `index.html` owns semantic document structure, controls, Canvas fallback content, status, and result summary.
- `styles.css` owns layout, responsive sizing, branding, and visible states such as focus and errors.
- `app.js` owns the single state object, validation, event handling, normalized layout, `renderScene`, and export cleanup for this small prototype.
- Centralize export dimensions, safe margins, category choices, and mood mappings as named constants rather than scattering numbers and colors through event handlers.
- Drawing rules accept state and target dimensions. They must not read form fields directly.
- Add a new file or module only when one responsibility becomes difficult to understand in `app.js`; do not create parallel preview and export systems.
- Keep personal data out of URLs, logs, storage, and network requests.

### Decisions and changes

- **November 9, 2026 — Target one device for the critical proof.** Phase 2 exports at the iPhone 15 Pro's portrait resolution, 1179 × 2556. Supporting several exact sizes now would increase testing without proving the core more clearly. Broader phone and desktop formats remain later work.
- **November 9, 2026 — Use normalized coordinates and one renderer.** Separate drawing systems would risk preview/export drift. One state-driven renderer scales the same composition to each Canvas.
- **November 9, 2026 — Build working inputs rather than a fixed demo.** One to five categorized stars plus Calm and Energized demonstrate the complete interaction loop and enable the research acceptance tests.
- **November 9, 2026 — Export a static PNG.** A true animated iPhone wallpaper requires a compatible Live Photo and a different native or conversion workflow. Optional browser-preview animation is deferred until the static workflow is stable.
- **November 9, 2026 — Keep data in browser memory.** Phase 2 needs no backend or persistent personal data, reducing privacy risk and system complexity.
