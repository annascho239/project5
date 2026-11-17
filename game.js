// Star Launcher on its own page: three fixed levels, with a level choice and session bests.
// The game itself is the component in game-view.js; the explore page mounts the same component.

import { buildAllLevels, loadCatalog } from "./game-levels.js";
import { mountGame } from "./game-view.js";

const root = document.querySelector("#game-root");
const homeLink = '<nav class="top-nav" aria-label="Site"><a href="index.html">&larr; Inner Orbit home</a></nav>';

async function start() {
  let levels;
  try {
    levels = buildAllLevels(await loadCatalog());
  } catch {
    root.innerHTML = `${homeLink}<p id="game-status" class="status" role="status" data-tone="error">The constellation data could not be loaded. Reload the page to try again.</p>`;
    return;
  }
  mountGame(root, { levels, picker: true, nextLevel: true, leadingHtml: homeLink, eyebrow: "Star Launcher", headingTag: "h1" });
}

start();
