#!/usr/bin/env python3
"""Derive data/constellation-stars.json from the vendored d3-celestial data.

For every constellation, find the stars its lines connect in the XHIP catalog (stars.6.json) and record
the brightest one with its name from starnames.json. The result is small (about 10 KB) so the game does
not have to download 1.3 MB of star files to show one fact. tests/learn-facts.html recomputes every
entry from the full files and compares, so this table cannot drift from its source.

Run from the project root:  python3 tools/make-star-facts.py
"""
import json, math, os

DATA = os.path.join("vendor", "d3-celestial", "data")
OUT = os.path.join("data", "constellation-stars.json")
MATCH_TOLERANCE_DEGREES = 0.02  # 764 of 767 line points match a catalog star exactly; two more differ by rounding


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as handle:
        return json.load(handle)


def clean(text):
    return " ".join((text or "").split())  # catalog names use typographic spaces


def main():
    stars = load("stars.6.json")["features"]
    names = load("starnames.json")
    lines = load("constellations.lines.json")["features"]

    by_coordinate = {}
    for star in stars:
        lon, lat = star["geometry"]["coordinates"]
        by_coordinate[(lon, lat)] = star

    def find(lon, lat):
        if (lon, lat) in by_coordinate:
            return by_coordinate[(lon, lat)]
        best, best_distance = None, MATCH_TOLERANCE_DEGREES
        for star in stars:
            s_lon, s_lat = star["geometry"]["coordinates"]
            distance = math.hypot((s_lon - lon) * math.cos(math.radians(lat)), s_lat - lat)
            if distance < best_distance:
                best, best_distance = star, distance
        return best

    result = {}
    for feature in sorted(lines, key=lambda f: f["id"]):
        points = {tuple(p) for line in feature["geometry"]["coordinates"] for p in line}
        matched = []
        for lon, lat in sorted(points):
            star = find(lon, lat)
            if star is not None:
                matched.append(star)
        entry = {"matched": len(matched), "unmatched": len(points) - len(matched), "brightest": None}
        if matched:
            star = min(matched, key=lambda s: (s["properties"]["mag"], s["id"]))
            info = names.get(str(star["id"]), {})
            entry["brightest"] = {
                "hip": star["id"],
                "magnitude": star["properties"]["mag"],
                "name": clean(info.get("name")),
                "bayer": clean(info.get("bayer")),
                "flamsteed": clean(info.get("flam")),
            }
        result[feature["id"]] = entry

    document = {
        "about": "Derived by tools/make-star-facts.py from stars.6.json (XHIP, Anderson and Francis 2012), "
                 "starnames.json, and constellations.lines.json in vendor/d3-celestial/data.",
        "constellations": result,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(document, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write("\n")
    unmatched = sum(entry["unmatched"] for entry in result.values())
    print(f"wrote {OUT}: {len(result)} constellations, {sum(e['matched'] for e in result.values())} stars matched, {unmatched} unmatched")


if __name__ == "__main__":
    main()
