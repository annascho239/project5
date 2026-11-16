# Inner Orbit — Phase 2 Milestone Handoff

**For:** Studio director · **Date:** November 9, 2026 · **Status:** working proof built, desktop-tested, and run end to end by the Developer on an iPhone 15 Pro

## Decision requested

Approve or decline a change to the project's scope. `pitch.md` is unchanged and stays unchanged until you decide.

## Original pitch

Inner Orbit would let a User enter up to five meaningful people, places, or memories as stars, adjust mood controls, and download a phone or desktop wallpaper. Everything the User typed would stay in the browser. The pitch said a library would be used only if browser APIs could not meet a tested need.

## Proposed change

Instead of inventing a constellation from personal labels, the wallpaper shows the **real sky** above a place at the date and approximate local time of one memory.

| Original pitch | Proposed |
|---|---|
| Up to five labeled stars (person/place/memory) | One memory: title, place, date, approximate local time |
| Invented constellation | Real stars and constellation lines for that place and moment |
| Mood controls | Two presets, Calm and Energized; they change color and glow only, never the sky |
| Phone or desktop PNG | One target for now: iPhone 15 Pro, static 1179 × 2556 PNG |
| Nothing sent anywhere | The place search text, and only that, is sent to Open-Meteo when the User chooses Find place |
| No libraries unless needed | Three pinned libraries (below), because browser APIs do not provide a star catalog or reliable place-local time |

**Why:** After reviewing the first prototype, the Developer judged that a real sky ties the artifact to a specific memory more strongly than invented stars. The earlier generated-star prototype passed 26 browser checks and its layout and export rules were reused; its star logic was replaced.

## What works now

Tested in headless Chrome on a desktop (details in `plan.md`):

- Explicit place search, selection among similarly named places, and Open-Meteo/GeoNames attribution.
- Local time is interpreted in the selected place's time zone. A nonexistent daylight-saving time is rejected, and a repeated hour asks for earlier or later.
- Changing the place or the time changes the sky; changing the mood does not move any star.
- One composition draws both the preview and the export. The sky fills the whole screen, and the title, place, and date sit on a dark fade.
- The export is a PNG of exactly 1179 × 2556. Five exports in a row succeed, temporary canvases and blob URLs are released, and a forced encoding failure keeps the User's entries and allows a retry.
- Requests contain only the place-search text. All 15 form and state checks and all 21 composition and export checks passed, the latter also at a simulated 3× iPhone pixel ratio.

## iPhone results

Performed by the Developer on their iPhone 15 Pro in Safari, using the public GitHub Pages build (`https://annascho239.github.io/project5/`, which at the time of the test opened the wallpaper maker; the wallpaper maker is now at `/wallpaper.html` and the root is a landing page). The Developer reported that they completed a real memory, exported in both Calm and Energized, exported five times in one session with no problems, saved a PNG to Photos, and set it as the Lock Screen, and that the result looks good.

Not recorded: the iOS version, specific coverage by the Lock Screen clock, widgets, and controls, and the Developer's verdict on text size and the provisional safe margins. These are observations from the Developer's own report; the Agent did not run the device test.

## Correction after the milestone (November 16, 2026)

An independent cross-check found that the Phase 2 wallpaper maker drew the wrong sky whenever the memory's time zone differed from the viewer's. The app gave the sky library the place's time-zone offset, but the library uses the browser's own offset, so the sky was rotated by the difference. A Sydney memory viewed from a Chicago browser was off by 104 degrees (about seven hours of sky rotation); a Chicago memory in summer viewed in winter was off by 15 degrees. The earlier tests confirmed that different places gave different maps but not that each map was correct. The Developer's iPhone test therefore confirmed the flow, the export, and the Lock Screen result, but not the astronomical accuracy of every wallpaper. The cause is fixed in the code and verified against an independent sidereal-time calculation across five browser time zones and eight place-and-date cases; the fix is not yet published. The statements above about place and time changing the astronomy remain true; the accuracy statement now holds only after this fix.

## Limitations and open risks

- The map is an astronomical interpretation, not a photograph. It does not show weather, terrain, buildings, light pollution, or exact naked-eye visibility.
- The sky is enlarged to fill the screen, so the horizon and the sky nearest it are cropped out.
- Only the names of the 22 most prominent constellations are shown, because more collided at phone size. Some names near the screen edge are partly cut off.
- The safe margins for the text are still provisional; the Developer reported the Lock Screen result looks good but has not recorded margin details.
- The sky is drawn on a canvas about 2,870 px wide. The Developer reported five exports with no problems; speed and memory were not measured. d3-celestial is an older library and depends on D3 version 3.
- The place search needs a network connection and a third-party service.
- The Open-Meteo place search is an external dependency with its own usage terms. Star positions come from catalog data and are not independently validated.
- Only one device size and two moods are built so far.

## Licenses and credits

- **d3-celestial 0.7.35** — BSD-3-Clause. Stars from the Extended Hipparcos Compilation; constellations from IAU material with Olaf Frohn's modifications.
- **D3 3.5.17** — BSD-3-Clause.
- **Luxon 3.7.2** — MIT.
- **Open-Meteo Geocoding API**, with place data from **GeoNames** — attribution shown in the app footer.

License texts and sources are in `vendor/THIRD_PARTY.md` and `vendor/licenses/`. All dependencies are served locally; the app has no runtime CDN.

## Next steps if approved

1. Phase 3: refine the flow and composition from device evidence, then update `pitch.md` to the approved scope.
2. Remove the superseded star-generation logic and the isolated test pages once the real-sky path passes on the device, with the Developer's approval.
