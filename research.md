# Research — Current Direction

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

## Phase 2: real all-sky memory wallpaper

Research conducted November 9, 2026. After reviewing the first local prototype, the Developer changed the Phase 2 proof: instead of inventing a constellation from personal stars, the wallpaper should show the real constellations visible from the place, date, and approximate local time of a memory.

This materially changes the approved pitch. `pitch.md` remains unchanged, and the change must be disclosed to the Studio director at the milestone review.

### Approved decisions

- Target the Developer's iPhone 15 Pro and export a static **1179 × 2556 PNG**.
- Ask for memory title, place, calendar date, approximate local time, and Calm or Energized.
- Render a circular all-sky view of the cataloged stars and conventional constellation lines above the observer's horizon.
- Let astronomy determine geometry. Mood changes palette and visual intensity only.
- Do not claim to reproduce weather, terrain, buildings, light pollution, or photographic/naked-eye appearance.

### Astronomy renderer

| Option | Fit | Trade-off |
|---|---|---|
| **d3-celestial 0.7.35** | Location/time transforms, stars, constellation lines/names, horizon, Canvas, and all-sky projections | Best scope fit and BSD-3-Clause, but old, dependent on D3 v3, and must be tested in iPhone Safari |
| Astronomy Engine | Accurate transformations, MIT | No complete star/constellation catalog or map renderer |
| Stellarium Web Engine | Extensive, high-fidelity WebGL/WASM sky | Heavy build and AGPL-3.0 obligations are disproportionate for this MVP |
| VirtualSky | Embeddable planetarium | Its documentation says not to expect support |

An isolated d3-celestial experiment rendered a circular Chicago sky for January 1, 2025 at 9:00 PM local time with recognizable Orion, Taurus, Gemini, and Canis Major. The selected JavaScript plus magnitude-6 star and constellation data are under roughly 1 MB before transfer compression. This proves basic browser feasibility, not independent scientific validation.

**Developer decision:** Use pinned local d3-celestial assets for Phase 2, retain its license/data credits, and require a real iPhone Safari test. First prove that it can render matching preview-size and export-size maps before replacing the existing app.

### Place and local time

Open-Meteo's geocoding API returns candidate names, WGS84 coordinates, and an IANA time zone. A live `Chicago` test returned `41.85003`, `-87.65005`, and `America/Chicago`. Nominatim's public service is less suitable because its policy limits requests and prohibits client-side autocomplete.

**Developer decision:** Search only after an explicit **Find place** action. Send only the place query, disclose that request, let the User choose among returned candidates, and credit Open-Meteo/GeoNames. Do not send the title, date, time, mood, or image. Current-device geolocation is out of scope.

The selected place's time zone must govern the entered wall-clock time, not the phone's zone. Native Temporal is not a reliable iPhone Safari baseline. Luxon 3.7.2 is MIT-licensed and supports iOS Safari 14+.

**Developer decision:** Use Luxon. Reject nonexistent local times during a daylight-saving jump. For a duplicated fall-back time, require an earlier/later choice instead of guessing.

### Privacy, accessibility, and output

- Other than the place query, memory data stays in browser memory. Phase 2 has no accounts, analytics, persistence, or application backend.
- Canvas is an output view, not the form interface. Semantic controls, visible focus, text errors/status, and an adjacent result summary remain required.
- Create only one full-resolution export Canvas at a time and release it after PNG encoding. A 1179 × 2556 RGBA bitmap is about 12.1 MB before encoding and browser overhead.
- The outer 10% and upper clock area remain provisional safe regions until the actual Lock Screen test.

### Phase 2 proof

The critical function passes only when:

1. The User can search and deliberately select the intended place.
2. Place/date/time resolve to coordinates, an IANA zone, and a valid instant.
3. Preview shows an above-horizon circular map with stars, constellation lines, and readable names.
4. Place or time changes the astronomy; mood changes styling without moving it.
5. Export creates a nonempty 1179 × 2556 PNG matching the preview's map, metadata, and mood.
6. Failures preserve input and allow retry.
7. iPhone 15 Pro Safari completes the full flow, five repeated exports, save-to-Photos, and a Lock Screen test without crashing.

### Current scope

Included: memory title, explicit place search/selection, date, approximate local time, two moods, real visible-sky map, and static iPhone 15 Pro PNG.

Deferred: weather/terrain/light pollution, planets, Moon, Milky Way art, deep-sky objects, illustrations, device geolocation, manual coordinates, accounts, galleries, other sizes, and animation.

### Sources added for the real-sky direction

- [d3-celestial documentation](https://github.com/ofrohn/d3-celestial/blob/master/readme.md) and [BSD-3-Clause license](https://github.com/ofrohn/d3-celestial/blob/master/LICENSE)
- [XHIP: An Extended Hipparcos Compilation](https://arxiv.org/abs/1108.4971)
- [International Astronomical Union, The Constellations](https://iauarchive.eso.org/public/themes/constellations/)
- [Astronomy Engine](https://github.com/cosinekitty/astronomy)
- [Stellarium Web Engine](https://github.com/Stellarium/stellarium-web-engine/blob/master/README.md)
- [VirtualSky](https://github.com/slowe/VirtualSky)
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Luxon install guide](https://github.com/moment/luxon/blob/master/docs/install.md), [time-zone guide](https://github.com/moment/luxon/blob/master/docs/zones.md), and [support matrix](https://github.com/moment/luxon/blob/master/docs/matrix.md)
- [MDN, Temporal.ZonedDateTime](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime)

---

# Archived Research — Generated-Star Prototype

The material below records the superseded Phase 2 experiment. Its responsive layout, accessibility, Canvas export, and failure-handling evidence remain useful, but its invented-star product model is no longer the current specification.

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

Purpose: Keep the evidence, decisions, and current scope that guide the build.

## Working agreement

Developer: Direct the inquiry toward what the next decision needs, judge sources and options, make the consequential decisions, and keep this file current.

Agent: Read the project documents and inspect the project. Help investigate, compare options, and test assumptions quickly. Verify sources directly.

When you begin this step, start a fresh chat so its transcript stays clean. For example:

`Read the project documents and help me research what I need for the next build decision.`

## Inquiry and decisions

### Phase 2: iPhone wallpaper preview and export

Research conducted November 9, 2026. Phase 2 needs to prove that the web app can show a responsive constellation preview in iPhone Safari and export the same composition as a usable iPhone wallpaper.

#### Target device and output size

**Evidence:** Apple lists the iPhone 15 Pro display at 2556 by 1179 pixels. Apple also lists different resolutions for other iPhone models, so there is no single exact export size for every iPhone.

**Developer decision:** Use the Developer's iPhone 15 Pro as the Phase 2 test device. Export a portrait PNG at **1179 × 2556 pixels**. This is a validation target, not a claim of support for every iPhone. The approved pitch's broader phone and desktop output remains later work.

#### One composition at preview and export sizes

**Evidence:** A Canvas element's bitmap size is controlled by its `width` and `height`; CSS can display it at a different size. If the CSS and bitmap aspect ratios do not match, the browser scales and can distort the image. Changing a Canvas dimension also clears its drawing state.

**Decision:** Store each star position and size in normalized coordinates rather than preview pixels. One render function will receive the current state plus a target width and height. It will draw both the responsive preview and the full-resolution export from the same data. The preview can use a smaller bitmap matched to its displayed aspect ratio; export will use a separate 1179 × 2556 Canvas created only when requested.

#### PNG creation and download

**Evidence:** `HTMLCanvasElement.toBlob()` creates an image asynchronously. Browsers are required to support PNG output. The HTML standard permits a null result when the Canvas has no pixels and blocks export with a `SecurityError` when cross-origin content has made the Canvas no longer origin-clean. The anchor `download` property indicates that a linked resource is intended for download, but the final iPhone save flow still depends on Safari and must be tested on the target device.

**Decision:** Phase 2 will use `toBlob(callback, "image/png")`, create a temporary blob URL, and trigger a named PNG download. It will show a clear failure message if Canvas creation or blob encoding fails. The blob URL will be revoked after use. Phase 2 will draw with Canvas commands and local code only; it will not load external raster images that could taint the Canvas.

#### Canvas limits and memory

**Evidence:** WebKit raised iOS's individual Canvas dimension limit from 4096 × 4096 to 8192 × 8192 in 2024. The iPhone 15 Pro export fits within that dimension. WebKit also documents failures when a page's total Canvas memory exceeds a device-dependent limit. A 1179 × 2556 RGBA bitmap alone is about 12.1 MB in decimal units (about 11.5 MiB), before encoding and browser overhead.

**Decision:** Keep the live preview modest, create only one full-resolution export Canvas at a time, and release references after export. Do not retain a gallery of full-resolution canvases in memory during Phase 2. A successful test on the actual iPhone 15 Pro is required; the documented maximum dimension does not guarantee that every memory-heavy design will work.

#### Lock Screen composition and safe areas

**Evidence:** Apple allows Users to resize the Lock Screen clock and add widgets and bottom controls. The iPhone 15 Pro also has rounded display corners and a Dynamic Island. Apple does not publish one fixed pixel rectangle that guarantees important wallpaper content will remain unobscured under every Lock Screen configuration.

**Provisional rule to test:** Keep stars and labels away from the outer 10% of the composition and avoid placing essential labels in the upper central clock area. This is a project rule, not an Apple specification. The Developer will test the downloaded image as an actual Lock Screen, record any crop or obstruction, and revise the rule from evidence.

#### Accessibility

**Evidence:** MDN recommends fallback content for Canvas. WCAG 2.2 requires text alternatives for non-text content, keyboard-operable functionality, logical focus order, and visible focus.

**Decision:** Canvas will display the artwork but will not be the form interface. Star labels, categories, mood choices, and export will use semantic HTML controls. The preview will have a concise textual description derived from the same state. Meaning will not depend only on color or motion, and Phase 2 controls must be usable by keyboard with visible focus.

#### Animation and iPhone wallpaper format

**Evidence:** Apple supports animated Lock Screen wallpapers through compatible Live Photos. A Live Photo is not a normal animated image: Apple documents it as a paired still image and video saved as one Photos asset through native Photos and AVFoundation APIs. A Canvas-generated PNG cannot carry that motion.

**Developer decision:** Phase 2 exports a static PNG. Optional motion may be added to the in-browser preview in a later phase and must respect reduced-motion preferences. Creating and saving a true Live Photo is outside the current browser-only architecture and is not part of the MVP. It may be reconsidered only as a research-heavy stretch goal after the static workflow is stable.

#### Phase 2 experiment

The critical function passes when all of the following are observed on the Developer's iPhone 15 Pro:

1. Safari displays a responsive preview without stretching the constellation.
2. Export produces a nonempty PNG reported as 1179 × 2556 pixels.
3. The downloaded image preserves the preview's stars, connections, colors, and relative placement.
4. One-star and five-star cases keep all stars and allowed labels inside the provisional safe region.
5. The User can move the PNG into Photos if needed and set it as a Lock Screen wallpaper.
6. The actual Lock Screen keeps essential content visible around the clock, Dynamic Island, corners, and controls.
7. Repeated exports do not visibly freeze or crash Safari during the test session.

The exact iPhone download-to-Photos flow and the adequacy of the provisional safe region remain assumptions until this device test is completed. Results belong in `plan.md` under Testing and evidence.

## Scope

### Stretch goals

Current approved priorities from the pitch:

1. Save a small collection of recent designs locally in the browser.
2. Add seeded variations without changing the meaning or mood.
3. Add optional reduced-motion preview animation while keeping exports still.
4. Add more wallpaper aspect ratios or a custom-size option.
5. Add an optional short dedication or date.

None are part of the Phase 2 proof.

### Scope changes

No approved final-scope change. Phase 2 validation is deliberately limited to an iPhone 15 Pro export in Safari. Phone and desktop formats remain in the approved pitch for later phases.

## Sources and credits

- [Apple, iPhone 15 Pro technical specifications](https://support.apple.com/111829) — supports the target display resolution, rounded-corner, and Dynamic Island findings. Reference only; no Apple asset or code used.
- [Apple, Compare iPhone models](https://www.apple.com/iphone/compare/) — supports the finding that iPhone resolutions vary by model. Reference only; no Apple asset or code used.
- [Apple, Create a custom iPhone Lock Screen](https://support.apple.com/guide/iphone/create-a-custom-lock-screen-iph4d0e6c351/ios) — supports findings about clocks, widgets, and Lock Screen controls. Reference only.
- [MDN, Basic usage of Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_usage) — supports Canvas sizing, distortion, and fallback-content findings. Documentation reference; example code not copied.
- [MDN, `HTMLCanvasElement.toBlob()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) — supports PNG export behavior. Documentation reference; example code not copied.
- [WHATWG, HTML Standard: Canvas](https://html.spec.whatwg.org/multipage/canvas.html) — normative source for `toBlob()`, null results, and origin-clean security behavior. Specification reference.
- [MDN, `HTMLAnchorElement.download`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/download) — supports the intended download behavior. Documentation reference.
- [WebKit bug 271002: increase iOS Canvas size limit](https://bugs.webkit.org/show_bug.cgi?id=271002) — primary implementation record for the 8192 × 8192 dimension change. Reference only.
- [WebKit bug 195325: total Canvas memory failures](https://bugs.webkit.org/show_bug.cgi?id=195325) — primary implementation record showing that total Canvas memory can remain device-dependent. Reference only.
- [W3C, Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/) — supports accessibility requirements. Standards reference.
- [Apple, Set a Live Photo as Lock Screen wallpaper](https://support.apple.com/120734) — supports the finding that compatible Live Photos can animate when the iPhone wakes. Reference only.
- [Apple Developer, Capturing and saving Live Photos](https://developer.apple.com/documentation/avfoundation/capturing-and-saving-live-photos) — supports the paired still-image/video format and native Photos workflow. Documentation reference; code not copied.
