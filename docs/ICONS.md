# Material Symbols

Openframe ships with Google's Material Symbols, both as artwork to place and as a font to type with.

## What is here

`npm run icons:fetch` (`scripts/fetch-material-symbols.mjs`) downloads into `public/icons/material/`:

| | |
|---|---|
| Icons | **2,122**, each drawn in three styles |
| Artwork | 6,366 SVG files |
| Fonts | **3** variable fonts — outlined, rounded, sharp — over fill, weight, grade and optical size |
| Size | **38 MB** |
| Index | `index.json`, with every icon's name, codepoint, category and tags |

## Both ways, because they are different things

An icon is useful in two quite different ways, and the set is shipped for both:

- **As artwork.** Picking an icon in the Assets panel places it as a vector layer, brought in through the
  same SVG import as any other file — so its shapes can be recoloured, reshaped and taken apart like
  anything drawn here. This is what a design tool usually wants.
- **As a font.** *Add Material Symbols…* registers the style's variable font, so an icon can sit inside a
  line of text and follow its size and colour. Openframe already supports icon fonts
  (`e2e/icon-fonts.spec.ts`); this is one more.

## How it loads

The index lists every icon and is read once when the Assets panel is first opened. An icon's artwork and
the fonts are read only when one is used, and the service worker caches each as it is asked for — the same
as the font library (see `docs/FONTS.md`). Searching looks at an icon's name, its tags and its category.

Material Symbols are drawn on a `0 -960 960 960` viewBox — the origin is at the *baseline*, not the top
left — which the SVG import handles as it does any other viewBox.

## Licensing

Material Symbols are Apache 2.0, which permits redistribution.
