# Third-party notices

The Phase 2 astronomy proof vendors these files locally so the tested build does not depend on a runtime CDN.

## d3-celestial 0.7.35

- Source: <https://github.com/ofrohn/d3-celestial>
- Vendored commit: `7e720a3de062059d4c5400a379146a601d9010e0`
- License: BSD-3-Clause; see `licenses/d3-celestial-BSD-3-Clause.txt`
- Included data: magnitude-6 stars, constellation names/lines/borders, Milky Way outline, bright deep-sky objects, object names, and planet elements from the upstream `data/` directory
- Upstream documentation identifies the Extended Hipparcos Compilation (XHIP) as the stellar source and IAU material with Olaf Frohn's modifications as the constellation source. See the full source list in <https://github.com/ofrohn/d3-celestial/blob/master/readme.md#data-sources>.

## D3 3.5.17

- Source: <https://github.com/d3/d3/tree/v3.5.17>
- License: BSD-3-Clause; see `licenses/d3-v3.5.17-BSD-3-Clause.txt`
- d3-celestial 0.7.35 depends on the D3 v3 API.
