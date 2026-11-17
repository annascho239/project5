#!/usr/bin/env python3
"""Derive data/stars-compact.json from the vendored star catalog.

The sky map draws about 5,000 stars. stars.6.json is 657 KB of GeoJSON; this keeps only what the map
needs (Hipparcos number, right ascension, declination, magnitude) in about 126 KB. Positions are rounded
to 0.01 degree (36 arcseconds) and magnitudes to 0.1, far below what a phone screen can show.
tests/sky-projection.html compares every row with the full file, so the table cannot drift from it.

Run from the project root:  python3 tools/make-star-table.py
"""
import json, os

SOURCE = os.path.join("vendor", "d3-celestial", "data", "stars.6.json")
OUT = os.path.join("data", "stars-compact.json")


def main():
    with open(SOURCE, encoding="utf-8") as handle:
        features = json.load(handle)["features"]
    rows = []
    for star in sorted(features, key=lambda f: f["id"]):
        ra, dec = star["geometry"]["coordinates"]
        rows.append([star["id"], round(ra, 2), round(dec, 2), round(star["properties"]["mag"], 1)])
    document = {
        "about": "Derived by tools/make-star-table.py from vendor/d3-celestial/data/stars.6.json (XHIP, "
                 "Anderson and Francis 2012). Columns: Hipparcos number, right ascension (degrees, -180 to 180), "
                 "declination (degrees), apparent magnitude (smaller is brighter).",
        "columns": ["hip", "ra", "dec", "mag"],
        "stars": rows,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(document, handle, separators=(",", ":"))
        handle.write("\n")
    print(f"wrote {OUT}: {len(rows)} stars, {os.path.getsize(OUT):,} bytes")


if __name__ == "__main__":
    main()
