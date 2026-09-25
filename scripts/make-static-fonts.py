# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools", "brotli"]
# ///
"""
Regenerate the static TrueType fonts used by PDF export (src/engine/assets/fonts/static/).

Run this only if the brand fonts change or the deck starts using a new weight:

    make fonts        (or directly: uv run scripts/make-static-fonts.py)

uv reads the inline dependency block above and runs it in a throwaway environment,
so nothing needs to be installed globally.

It freezes the VARIABLE woff2 fonts (src/engine/assets/fonts/*.woff2) into STATIC .ttf
instances at the exact weights the decks render. Static TTF is the input Chromium embeds
cleanly as small, subsetted, selectable vector fonts in a PDF; variable woff2 would fall
back to bloated, non-selectable Type3 outlines. The live web decks keep using the variable
woff2 untouched; these static files are for the export path only.
"""
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "src", "engine", "assets", "fonts")
OUT = os.path.join(FONTS, "static")
os.makedirs(OUT, exist_ok=True)

# (source woff2, weights the decks render, name to write into the instanced file)
#
# THE THIRD FIELD IS A LICENCE REQUIREMENT, not a preference. Playfair Display is SIL OFL 1.1
# WITH a Reserved Font Name, and an instanced single-weight TTF is a Modified Version under
# clause 3, which may not carry the reserved name. So the file we generate is named something
# that does not contain "Playfair Display" at all. Inter is OFL with NO reserved name, so it
# keeps its own.
#
# The CSS still declares `font-family: "Playfair Display"` and simply points at this file:
# a CSS family name is a local alias for matching, and the restriction is on the name table
# inside the font software. See src/engine/fonts-static.css.
jobs = [
    (os.path.join(FONTS, "playfair-display-variable.woff2"), [400],            "Deck Serif"),
    (os.path.join(FONTS, "inter-variable.woff2"),            [400, 600, 700],  "Inter"),
]

# The name records that carry a family or full name. Leaving any of them holding the reserved
# name would defeat the rename, because different consumers read different ones: 6 is what a
# PDF's font table shows, 1 and 4 are what a font menu shows, 16 is what a layout engine groups
# by, and 3 is the unique identifier that a duplicate-font check compares.
NAME_IDS = {1: "family", 3: "unique", 4: "full", 6: "postscript", 16: "typographic"}


def rename(font, family, weight):
    """Rewrite every family/full-name record so the file does not claim the original name."""
    style = {400: "Regular", 600: "SemiBold", 700: "Bold"}.get(weight, str(weight))
    full = family if style == "Regular" else f"{family} {style}"
    ps = full.replace(" ", "")
    values = {1: family, 3: f"{ps};stagedeck-static", 4: full, 6: ps, 16: family}
    for rec in list(font["name"].names):
        if rec.nameID in NAME_IDS:
            font["name"].setName(values[rec.nameID], rec.nameID,
                                 rec.platformID, rec.platEncID, rec.langID)


for path, weights, family in jobs:
    axes = {a.axisTag: a.defaultValue for a in TTFont(path)["fvar"].axes}
    for w in weights:
        f = TTFont(path)
        instantiateVariableFont(f, {**axes, "wght": w}, inplace=True)  # pin all axes -> static
        rename(f, family, w)
        f.flavor = None  # write plain sfnt TTF, not woff2
        out_ttf = os.path.join(OUT, f"{family.replace(' ', '')}-{w}.ttf")
        f.save(out_ttf)
        print(f"{family} {w}: {os.path.getsize(out_ttf):,} bytes -> {os.path.relpath(out_ttf, os.path.join(HERE, '..'))}")
