# Plan — Current Direction

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

## Five-week map

- **Phase 1 — Ideate and pitch (complete):** Approve the original Inner Orbit concept, scope, title, and visual direction.
- **Phase 2 — Prove the core (built and device-tested; director approval and cleanup pending):** Prove memory details → resolved place-local time → real all-sky constellation map → 1179 × 2556 PNG.
- **Phase 3 — Revise and expand (current):** Turn the project into a constellation launcher game (see below); resolve the pitch/spec changes with the Studio director.
- **Phase 4 — Polish and peer test:** Improve hierarchy and error paths, test accessibility and representative memories, and publish a stable review version.
- **Phase 5 — Finish and showcase:** Revise from testing, verify the public build/download, complete documentation and credits, and prepare the demonstration.

## Phase 3 — Constellation launcher game (Developer direction, November 16, 2026; checkpoints awaiting approval)

Developer direction: make the project a game. After two earlier ideas (drawing a constellation, then tracing a target), the Developer chose a **bubble-shooter-style launcher**: the player aims a ball from the bottom of a portrait screen; it moves at constant speed with no gravity, bounces off the side walls, top, and pegs, and ends when it leaves the bottom. Touching a constellation's star lights it. When every star is lit the constellation is "filled" and the player sees its catalog facts. The goal is the fewest launches.

Decisions from the planning dialogue:
- Levels are **fixed constellations**; the memory place/date/time and the wallpaper export are **out of the game for now** (the code stays in the repo, unlinked and untouched).
- Stars are large glowing targets at their real relative positions, plus a few clearly styled **bumper pegs** that keep the ball moving.
- Learning content is **catalog facts only** (name, IAU abbreviation, Latin/genitive names, star count). No outside facts.
- **Three levels**, easy to harder, about 5–9 stars each. Score is launch count; the target score is set after playtesting.
- Built as **new files on a separate page**; the wallpaper maker is not changed until the Developer decides.

**Approval boundary.** This replaces the pitch's core and the real-sky change that the Studio director has not yet answered. `pitch.md` stays unchanged. Both changes go to the director as one request; the Agent recommends sending it before most of the build is done.

### Proposed checkpoints (not started)

1. **Levels.** Pick three constellations from the vendored catalog and project each to board coordinates with a small local projection. Place bumpers deterministically. Tests: stars inside the board and separated, bumpers never on stars, shapes match the catalog.
   **Status (Nov 16, 2026): implemented and Agent-tested.** `game-levels.js` builds Cassiopeia (5 stars, 8 bumpers), Ursa Minor/Little Dipper (7 stars, 10 bumpers), and Cygnus (9 stars, 12 bumpers) from the vendored catalog. `tests/game-levels.html` (headless Chrome) passed all 33 checks: star and link counts match the catalog; board distances correlate 1.000 with true angular separations; the pattern is not mirrored (checked from raw coordinates); the closest star pair is 80.7, 59.7, and 32.8 units against a 32-unit minimum; bumpers keep their clearances; the build is deterministic; facts come only from the catalog. An early orientation check failed for Ursa Minor because it sits at the celestial pole where right ascension is not a left-right distance; the check was replaced with angular-separation and handedness checks. The Swan's stars are the tightest at 32.8 units, so Level 3 may need tuning once the ball physics exists. Board numbers (360 × 640 units, star radius 14, ball radius 7) are provisional until play-testing.
2. **Physics rules, no interface.** Fixed-timestep deterministic ball, wall and peg bounces, star lighting, launch end, launch count, and win. Headless tests, including repeatability.
   **Status (Nov 16, 2026): implemented and Agent-tested.** `game-physics.js` is a pure, deterministic fixed-step engine (120 steps/s, speed 420 units/s, no gravity or energy loss): wall, peg, and star bounces; star lighting once; launch count; win; and three ways a launch ends (exits the bottom, spent after the bounce limit, or a 20-second timeout). `tests/game-physics.html` (headless Chrome) passed all 28 checks, including constant speed, no overlap or wall escape across 29 aims per level (deepest contact 0.000 units on two levels, 0.082 on the Swan, within a documented 0.25-unit tolerance), identical results for repeated shots, and a scripted player clearing level 1 through the public rules.
   - **Found and fixed:** a level with no stars counted as instantly won (vacuous truth). Two test expectations of mine were wrong (a head-on bumper hit reverses once, not twice).
   - **Design decision (Developer, Nov 16): a launch is spent after 8 bounces.** Measured by sweeping 281 aims per level: with no limit, 38% or fewer of aims light nothing but a perfect shot can clear a level; at 8 bounces the best single shot lights 4, 4, and 5 stars and an expert needs 2 to 3 launches. Greedy set-cover estimates are 2, 3, 3 launches at 0.5° aim resolution and 2, 2, 2 at 0.25°, so they are expert lower bounds, not targets. The target score will be set from play-testing.
   - **Provisional:** stars are solid and bounce the ball like pegs (`PHYSICS.starsBounce`); speed, step, bounce limit, and board sizes will be tuned in play-testing.
3. **Play screen.** New page with canvas, drag-to-aim and release-to-launch, arrow keys and Space, status text, reset, and an instant-result option for reduced motion.
   **Status (Nov 16, 2026): implemented and Agent-tested.** `play.html`, `game.css`, and `game.js` add a separate play page (the wallpaper maker is untouched and not linked). Features: portrait board that keeps its 9:16 shape and fits a 390 × 844 view without scrolling; drag-and-release aiming; arrow keys (1° steps, Shift for 5°) and Space; Launch and Reset buttons; three level choices; HUD with stars lit and launches; text status and a screen-reader star list; and an "instant result" option that defaults on when the system asks for reduced motion. `tests/game-play.html` passed all 22 checks in **real-time** headless Chrome (60 frames a second): instant results match the rules module for the same aim, an animated launch ends in the same state as the rules, a second launch is refused mid-flight, a scripted player clears level 1 in 2 launches through the screen, and the page makes no request outside its own files. The reduced-motion default was checked with the system preference both off and on.
   - **Found and fixed:** the catalog writes "Little Dipper" with a typographic space (U+2005); names are now normalized and a level test guards it. "2 launchs" pluralization bug fixed. Header wrapping and focus-ring overlap tidied.
   - **Test-method note:** the virtual-time runner used earlier cannot test animation (its timers run ahead of `requestAnimationFrame`, about 2 frames a second); animation checks use a real-time DevTools run instead.
   - **Not yet done:** win panel with catalog facts, progression across levels, and session best (checkpoint 4); the Developer's iPhone play-test; touch feel and aim precision are unproven on a real device.
4. **Win and progression.** Facts panel, three levels, session best, restart.
   **Status (Nov 16, 2026): implemented and Agent-tested.** Winning a level opens a panel under the board with the title, launch count, best this session, and catalog facts only (Latin name, common name when different, IAU abbreviation, genitive form, star count, line count). Focus moves to the panel heading; Next level and Play again are at least 44px tall; Next is hidden on the last level; after all three levels are filled the panel adds "All 3 constellations filled. Your best launches: …". Level cards show "filled in N". All levels stay open to play in any order (no locks). Session bests live in memory only: the test confirms no local or session storage, no cookies, and that a reload forgets them. `tests/game-win.html` (real-time headless Chrome) plays every level to a win through the screen: first win, new best, worse run keeps the best, Reset keeps the best, Next level, facts exactly equal to the catalog's, overall result, and no external request.
   - **The tests can fail:** a deliberately broken "new best" rule in a scratch copy failed the two checks it should.
   - **Test-method fixes:** my runners reused a browser profile and served a stale cached copy of a test page; both runners now disable the cache. A size check counted hidden win-panel buttons as 0px tall; it now measures only visible controls. A value-wrapping layout flaw in the facts list was fixed.
   - **Check counts corrected.** Some totals quoted earlier were hand-counted and wrong by one or two. Re-taken from the page on Nov 16 after checkpoint 4: levels 39, physics 26, checkpoint 2 form 16, checkpoint 3 export 19, play screen 21, win and progression 22, all passing. Earlier figures in this file describe earlier versions of those suites.
   - **Not done:** the Developer's play-test of feel (aim, speed, hit size, bounce limit); the front page still opens the wallpaper maker and does not link to the game.
5. **Desktop verification.** Collision and scoring tests, keyboard flow, screenshots.
6. **Developer iPhone 15 Pro test.** The Agent prepares it; only the Developer's observations can pass it.
7. **Handoff.** One request to the Studio director covering both scope changes.

Risks: aiming and tuning feel can take many iterations; sparse stars may make some levels very hard without enough bumpers; animation conflicts with the pitch's no-motion-required principle, so every outcome needs a text and instant alternative; the schedule for Phases 4 and 5 shrinks.

## Approved technical direction

- Pinned local d3-celestial 0.7.35, D3 v3, magnitude-6 stars, and constellation data
- Open-Meteo Geocoding through an explicit Find place action
- Luxon 3.7.2 for place-local date/time conversion
- Plain HTML, CSS, and JavaScript with a static 1179 × 2556 PNG
- iPhone 15 Pro Safari as the required Phase 2 device test

## Proposed replacement checkpoints

These replace the generated-star build plan. Application-code replacement begins only after the Developer approves this sequence.

### 1. Preserve and isolate the astronomy proof

- Keep the generated-star prototype intact while adding a small isolated real-sky test page.
- Vendor pinned scripts, required catalog files, license notices, and credits locally.
- Render one known Chicago place/time at preview and export-map sizes.
- Compare geometry and prove the Canvas remains exportable.

Stop and review if d3-celestial cannot reliably render both sizes or Safari shows a blocking failure. Do not silently add a second astronomy system.

### 2. Replace the form and create resolved state

- Replace the five-star form with memory title, place search/results, date, approximate local time, and Calm/Energized controls.
- Add explicit Open-Meteo search, candidate selection, disclosure, attribution, loading/error states, and stale-selection invalidation.
- Use Luxon to derive the instant in the selected IANA zone and handle DST gaps/ambiguity.
- Add an accessible summary of the resolved memory and sky.

### 3. Build one wallpaper composition

- Place the circular above-horizon map, title, place, and local date/time within the portrait safe region.
- Apply mood to styling only.
- Use the same state/layout rules for preview and 1179 × 2556 export.
- Preserve existing export cleanup and readable failure behavior where applicable.

### 4. Desktop verification

- Test validation, ambiguous places, stale selections, network failure, time zones, DST, mood invariance, and keyboard flow.
- Verify known place/time changes alter astronomy while mood does not.
- Verify PNG signature/dimensions, repeated export, cleanup, narrow layout, and preview/export agreement.
- Inspect wide and iPhone-width screenshots plus an exported PNG.

### 5. Developer iPhone 15 Pro test

- Open the review build in Safari and complete a real memory.
- Test both moods and repeat export five times.
- Save to Photos and set the PNG as the Lock Screen.
- Record crop, obstruction, readability, download behavior, freezes/crashes, and preview mismatch.

The Agent can prepare this test but cannot mark it passed without the Developer's direct observations.

**Checkpoint 5 record (the Developer's observations, reported in chat on Nov 9, 2026; the Agent recorded them without adding detail).**

Build under test: commit `76292ee` (full-bleed sky) on GitHub Pages, `https://annascho239.github.io/project5/`. Device: iPhone 15 Pro, Safari, iOS version: not recorded.

| Step | What to do | Observed result |
|---|---|---|
| 1 | Open the page; complete a real memory (title, Find place, choose, date, time) | Completed (reported) |
| 2 | Compare the preview with what you expect: map, text, no stretching | "Looks good" (reported) |
| 3 | Calm: tap Create iPhone wallpaper; note download prompt/behavior | Exported; no problems reported |
| 4 | Energized: repeat | Exported; no problems reported |
| 5 | Repeat export 5 times in one session; note freezes, crashes, reloads, lost entries | Completed with no problems (reported) |
| 6 | Save a PNG to Photos | Completed (reported) |
| 7 | Set it as the Lock Screen; note what the clock, widgets, and bottom controls cover | Set as Lock Screen; overall "looks good"; specific clock/widget coverage not recorded |
| 8 | Compare Lock Screen result with the preview: crop, readability, text size | Overall "looks good"; no specific crop or readability issue reported |
| 9 | Try a place with a DST case if you like (Chicago, 2025-03-09, 2:30 AM should be rejected) | Not reported (optional; covered by desktop tests) |

Not yet recorded: iOS version, any confusing wording, whether the map text size is right, and whether the text safe margins (10% sides, nothing above 30% height) were right. The margins stay provisional until the Developer states them. Phase 2's device criterion is met on the Developer's report of the full flow, five exports, Photos, and Lock Screen.

### 6. Milestone handoff

- Present the original pitch, evidence motivating the change, working proof, limitations, licenses/credits, and iPhone results.
- Ask the Studio director to approve the scope change before editing `pitch.md` or treating it as final scope.

**Status:** Handoff drafted November 9, 2026 as `milestone-phase2.md` and updated with the Developer's iPhone report. Not yet sent to the Studio director, and `pitch.md` is unchanged.

## Current evidence

| Date | Build | Test | Observed result | Meaning |
|---|---|---|---|---|
| Nov 9, 2026 | Superseded generated-star prototype | Headless Chrome at 390px; validation, moods, export, cleanup, forced failure, overflow | 26 browser checks passed; PNG was 1179 × 2556 | Reuse stable layout/export rules, not invented-star logic |
| Nov 9, 2026 | Isolated d3-celestial experiment in `/tmp` | Chicago, Jan 1 2025, 9:00 PM local | Circular sky rendered with recognizable Orion, Taurus, Gemini, and Canis Major | Basic rendering is feasible; export-size and Safari proof remain |
| Nov 9, 2026 | Open-Meteo live request | Search `Chicago` | Returned Chicago, Illinois coordinates and `America/Chicago` | One API resolves location and time zone |
| Nov 9, 2026 | `tests/real-sky-renderer.html`, uncommitted | Headless Chrome; pinned local assets | Catalog load, Chicago observer state, 362px preview, 902px export-map render, normalized projection geometry, PNG encoding | All 6 checks passed; maximum normalized point shift was 0.00113 and the large map encoded to a 272,787-byte PNG |
| Nov 9, 2026 | Checkpoint 2 app (uncommitted), live Open-Meteo | `tests/checkpoint2.html`, headless Chrome, 390px iframe | Validation, Chicago/Sydney search and selection, Luxon time, DST gap and fall-back, stale selection, network failure, mood invariance, request contents, overflow, control names | All 15 checks passed; Chicago 9:00 PM Jan 1 2025 → CST; requests contained only place-search text | Checkpoint 2 meets its stated tests; export and composition are checkpoint 3 |

| Nov 9, 2026 | Checkpoint 3 app (uncommitted), live Open-Meteo | `tests/checkpoint3.html`, headless Chrome, 390px iframe, real submit button | 1179 × 2556 PNG, preview/export agreement, safe region, mood invariance, time change, 5 exports, blob/canvas cleanup, forced `toBlob` failure and retry, long title | All 20 checks passed; PNG 2,276,576 bytes; preview/export mean channel difference 4.14/255; text spans x 217–962 and ends at y 2125 (limit 2300); 5 of 5 exports, 5 blob URLs created and revoked | Checkpoint 3 meets its stated tests; device behavior still unproven |
| Nov 9, 2026 | Checkpoint 3 label comparison | Exported PNGs shown at iPhone point-size, both moods | No names, rank 1 only (22), ranks 1–2 (46), all (89) | Ranks 1–2 and all collided near the center and clipped at the disc edge; rank 1 stayed readable | **Developer chose rank 1 only** (`LABELS.ranksShown = 1`) |

| Nov 9, 2026 | Full-bleed revision of checkpoint 3 (uncommitted) | `tests/checkpoint3.html` at devicePixelRatio 1 and at `--force-device-scale-factor=3`; `tests/checkpoint2.html` | Sky covers all 12 tiles above the text fade; disc 2871 px vs 2815 px diagonal; text box x 217–962, y 1947–2125; canvas not inflated by pixel ratio; 5 exports; failure/retry | All 21 checks passed at both ratios (sky canvas 2871 px wide at ratio 3); 15 of 15 checkpoint 2 checks passed | Developer chose zoomed full-screen sky with a bottom fade; the earlier circle layout is superseded. Device memory/speed of a 2871 px canvas on iPhone is unproven |

Checkpoint 3 status (circle layout superseded by the full-bleed revision above): implemented and Agent-tested. One composition (`renderWallpaper`) draws both preview and export; d3-celestial renders off-screen at the target diameter with sizes scaled to it. Star designations (α, β…) were turned off after the first render showed clutter. Safe-region numbers for text (10% margins, text below 30% height) remain provisional until the iPhone Lock Screen test. PNG decoding was verified through the blob header and the encoded canvas pixels, not by re-decoding the file in the test (headless virtual time stalls `createImageBitmap`).

Checkpoint 2 status: implemented and Agent-tested. Visual inspection at 1440px found the empty-state placeholder covering the finished map (`display` overriding `hidden`); fixed in the stylesheet and rechecked. PNG export is intentionally absent until checkpoint 3. The pre-change app files are backed up outside the repo (scratchpad), not committed.

Visual inspection of the isolated proof found that showing every constellation name is too dense at phone-preview scale. Checkpoint 3 must establish a legible label-selection rule without changing the underlying astronomy.

## Current approval boundary

Research and technical direction are approved. The existing application remains unchanged until the Developer approves the replacement checkpoints above. Publishing, committing, pushing, and editing `pitch.md` remain separate actions requiring direction.

At Phase 2 cleanup, remove superseded logic and the isolated test only after the real-sky path passes and the Developer approves cleanup. Keep one state model, one astronomy path, one composition path, and one pinned dependency set.

---

# Archived Plan — Generated-Star Prototype

The plan and detailed test record below are retained as evidence from the superseded prototype. Where they conflict with the current plan above, the current plan governs.

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

Purpose: Track the five-week map, the next build checkpoints, testing, and simplification reviews.

## Working agreement

Developer: Choose priorities, plan only the next few checkpoints in detail, test results directly, and keep the map current.

Agent: Read the project documents and inspect the project. Where practical, keep each checkpoint small enough to run and judge. Do not expand scope or mark the Developer's verification complete.

When you begin this step, start a fresh chat so its transcript stays clean. For example:

`Read the project documents, inspect the project, and help me complete the next checkpoint.`

## Five-week map

- **Phase 1 — Ideate and pitch (complete):** Approve Inner Orbit's concept, scope, title, and initial visual direction.
- **Phase 2 — Prove the core (current):** Build and verify one end-to-end iPhone 15 Pro path: enter one to five stars, choose Calm or Energized, preview the result, and export a 1179 × 2556 PNG.
- **Phase 3 — Revise and expand:** Use Phase 2 evidence to finalize label and safe-area rules, improve composition and input flow, and test responsive layout, contrast, and keyboard use.
- **Phase 4 — Polish and peer test:** Add the remaining approved output format, refine branding and visual variation, handle edit and failure paths, and publish a stable peer-review version.
- **Phase 5 — Finish and showcase:** Revise from testing, verify the public build and downloads, complete documentation and credits, and prepare the demonstration.

## Checkpoints

### 1. Accessible app shell and star form

Produce `index.html`, `styles.css`, and `app.js` with the Inner Orbit shell, one editable star, Person/Place/Memory category controls, add/remove behavior up to five stars, Calm/Energized controls, preview region, result summary, status region, and export button. Use semantic HTML before adding Canvas drawing behavior.

**Status:** Implemented and Agent-tested on November 9, 2026. The Developer approved the local page's visual direction before checkpoint 2.

Test before continuing:

- Keyboard focus follows the task order and is always visible.
- A User can add five stars but not a sixth, and cannot remove the final star.
- Every control has a visible label and accessible name.
- Blank labels are identified and prevent export.
- Narrow iPhone-sized and wider layouts have no horizontal page scrolling.

### 2. Single state and shared Canvas renderer

Add one JavaScript state object, validation, normalized star positions, and `renderScene(ctx, width, height, state)`. Render a responsive iPhone-ratio preview and a text summary. Make Calm and Energized visibly different through palette and intensity without moving the primary stars.

**Status:** Implemented and Agent-tested on November 9, 2026; awaiting real-device visual testing.

Test before continuing:

- One-star and five-star states draw the correct number of primary stars.
- Editing a star or changing mood updates the preview without reloading.
- Mood changes preserve labels, categories, and normalized positions.
- The preview does not stretch at narrow and wide viewport sizes.
- The text summary reports star count, categories, and mood.

### 3. Full-resolution PNG export

Create one temporary 1179 × 2556 Canvas only when export is requested. Call the same `renderScene`, encode with `toBlob("image/png")`, initiate a named download, report status, and release the blob URL and Canvas references. Preserve form state on failure.

**Status:** Implemented and Agent-tested on November 9, 2026; iPhone Safari download behavior remains for Developer verification.

Test before continuing:

- The file is a nonempty 1179 × 2556 PNG.
- One-star and five-star downloads match the preview's essential composition.
- Five consecutive desktop-browser exports succeed without accumulating full-resolution canvases in the document.
- Simulating a null `toBlob` result in browser developer tools shows a readable error and allows retry.
- No request, URL, log, or storage entry contains a User label.

### 4. Local verification and review build

Run the app through a local HTTP server. Verify the approved acceptance checks in a desktop browser, inspect the downloaded PNG dimensions, test keyboard operation, and capture a screenshot of the working result. Fix governing layout or rendering rules rather than adding case-specific patches.

**Status:** Local verification completed on November 9, 2026. Public review-link publication is not yet approved or attempted.

After local verification, prepare the exact tested commit for a public GitHub Pages review link. Publishing remains a separate checkpoint requiring the Developer's approval because it changes external state.

### 5. iPhone 15 Pro visual test

Open the published review build in Safari on the Developer's iPhone 15 Pro. Test one- and five-star designs, both moods, candidate label lengths, five repeated exports, the download-to-Photos path, and the actual Lock Screen result.

Record observations before revising:

- what the Developer did;
- what appeared in preview and export;
- which content was cropped, covered, overlapping, or hard to read;
- whether Safari froze, crashed, or lost state;
- the chosen label limit and upper clock exclusion area.

Update `research.md`, `spec.md`, and this plan only from the observed results. Phase 2 is complete only after the Developer performs and records the real-device checks.

## Testing and evidence

No implementation tests have run yet.

Use this table for each meaningful test:

| Date | Build/commit | Device and browser | Test case | Observed result | Decision or revision |
|---|---|---|---|---|---|
| Nov 9, 2026 | Uncommitted checkpoint 1 | Headless Chrome, 390px iframe viewport | Add/remove limits, moods, valid and invalid submit, error focus, horizontal overflow | All 11 automated checks passed; content width was 375px within the 390px viewport | Keep semantic form and delegated event structure |
| Nov 9, 2026 | Uncommitted checkpoint 1 | Headless Chrome, 1440 × 1100 viewport | Initial visual layout | Two-column form and phone preview rendered with no visible overlap | Keep desktop layout |
| Nov 9, 2026 | Uncommitted checkpoint 1 | Headless Chrome narrow screenshot | Initial responsive visual order | Preview appeared before the form and the device badge clipped | Removed visual reordering and hid the badge at the narrow breakpoint; automated overflow check then passed |
| Nov 9, 2026 | Uncommitted checkpoints 2–3 | Headless Chrome, 390px iframe viewport | State, Canvas preview, moods, categories, validation, PNG export, repeated export, cleanup, and forced failure | All 26 browser checks passed; generated PNG was 2,179,025 bytes and its header reported 1179 × 2556 | Keep one renderer and temporary export Canvas architecture |
| Nov 9, 2026 | Uncommitted checkpoints 2–3 | Headless Chrome, 1440 × 1100 and 500 × 1000 screenshots | Canvas and responsive visual review | Constellation, Lock Screen overlay, form, and mood controls rendered without visible overlap | Ready for Developer's iPhone visual test after publication |

For the label visual test, compare representative 12-, 20-, and 30-character labels in both moods. For the Lock Screen test, record the actual clock, widgets, and controls used rather than assuming a universal safe area.

## Simplification reviews

Formal simplification reviews begin at the end of Phase 3. During Phase 2, keep one state object, one renderer, and the three-file structure from `spec.md`; do not add libraries or alternate rendering paths unless a tested requirement cannot be met without them.
