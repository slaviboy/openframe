# The Google Fonts library

Openframe ships with the whole Google Fonts library, so any of it can be used with no network at all.

## What is here

`npm run fonts:fetch` (`scripts/fetch-google-fonts.mjs`) downloads into `public/fonts/google/`:

| | |
|---|---|
| Families | **1,946** (1,943 with files; three are listed by Google but not served) |
| Files | **33,992** woff2 — every style, every subset |
| Size | **721 MB** |
| Index | `index.json`, **453 KB** |

Google's own metadata lists the library as 1.39 GB, which is the TTF total; woff2 is about half that.

The script is resumable — a file already on disk is left alone — so a stopped run can be started again,
and re-running it only fetches what is missing.

## Why it is committed

Openframe is offline. A font that is fetched when it is used is a font that does not work on a train, so
the library is in the repository rather than pulled at run time. That makes the repository large; the
alternatives were worse:

- **Git LFS** does not fit. GitHub's free LFS allowance is 1 GB of storage and 1 GB a month of bandwidth,
  and the library alone is 721 MB — the first few clones would exhaust it.
- **Fetching on demand** would mean the editor only works with a connection, which is the one thing it is
  meant not to need.

## How it loads

The library is far too large to hold at once, so it is read in two steps, which is why the index is split:

1. **`index.json`** lists every family with what the picker shows — its name, category, axes and subsets —
   and how many files it is in. 453 KB, loaded once when the font picker is first opened. Listing all
   34,000 files here instead made it 21 MB.
2. **`<family>/files.json`** lists that family's files, and is read only when the family is picked, along
   with the woff2 files themselves. They register as user fonts, exactly as an uploaded font does.
3. **`previews.json`** names one file per family — the one the picker draws that family's name in.
   133 KB, and the file it names averages 22.7 KB.

## The picker

The list is 1,946 families into a box that shows about a dozen, so it is **windowed**: only the rows in
view are in the page, the same way the layers panel works. Rendering all of them cost 116 ms every time
the picker opened; it is 40 ms now (median of five, Chromium, production build). `e2e/google-fonts.spec.ts`
guards it by counting the rows in the page — under 60 rather than 1,943.

Each row is drawn **in its own typeface**. For a family that is already loaded that is just CSS; for one
of the library's, `loadPreviewFace` adds a `FontFace` pointing at that family's preview file, once the
row has stayed in view for 120 ms. A `FontFace` URL is a CSS font load, not `fetch`, so it needs no
exemption, `font-src 'self'` allows it, and the service worker caches it like any other library file.

**A font just uploaded is scrolled to.** The list is alphabetical over the whole library, so an upload
lands nowhere near what the user was looking at. The picker takes a `reveal` family and goes to it; the
active row follows `reveal ?? current` until the pointer or ↑/↓ move it.

`scripts/build-font-previews.mjs` (`npm run fonts:previews`) writes `previews.json` from the library
already on disk — it fetches nothing — picking each family's upright Latin face nearest to weight 400.
`fetch-google-fonts.mjs` writes the same field from the same function, so a refetch keeps it.

**Hovering previews on the canvas.** Hovering a family lays the selected text out in it within one open
gesture, which `preview.cancel()` reverts when the pointer leaves; only a click commits. A family that
isn't loaded is read first, after the pointer has rested on it for 150 ms — a sweep down the list would
otherwise read a family per row. It is registered with the engine alone: `editor.fonts.add` writes a font
into the file's own store, and the pointer passing over a row is no reason to keep it. Picking is what
stores it, and by then the bytes are already here. Fonts **installed on this device** are never read on
hover: those come through the Local Font Access API, which is not something to ask for on a hover.

Nothing is precached by the service worker: `vite-plugin-sw` precaches the bundled assets, and `public/`
is copied rather than bundled, so a font is cached by the service worker's fetch handler the first time it
is asked for — the same way the 454 Noto Sans CJK subsets already work. After a family has been used once,
it is available offline for good.

**Subset order matters.** `css2` lists a family's faces in unicode-range order, which puts Cyrillic and
Greek before Latin. The shaper takes the first face registered for a family as the one to shape with, so
registering them in that order draws Latin text in the fallback font. `readGoogleFamily` puts the widest
face first — the one `css2` leaves unnamed — then Latin, then the rest.

## The fallback chain

A text layer names one family. Everything its font cannot draw comes from a fallback, and the fallbacks
are loaded for the characters that need them rather than held all at once. In the order the shaper
consults them:

| | Families | Loaded |
|---|---|---|
| The layer's font | the one it names | with the file, or when picked |
| Bundled script subsets | `Inter (latin-ext)`, `(cyrillic)`, `(greek)`, `(vietnamese)`, `(noto-arabic)`, `(noto-hebrew)` | at startup, with Inter |
| CJK | `Noto Sans SC/TC/JP/KR (n)` | per subset, per layer, for the characters in it |
| Emoji | `Inter (noto-color-emoji-n)` | per subset, for the emoji in the text |
| Symbols | `Inter (noto-symbols-0…2)` | once any text has a character nothing covers |

`isFallbackFamily` keeps all of them out of the picker: they are drawn from, never picked.
`TextShaper.fallbackFamilies()` lists them for **Outline text** and the SVG export, which have to read a
glyph out of the font it was actually drawn from.

### Symbols

Inter's Latin subset is declared `U+0000-00FF, …, U+2191, U+2193, …`: it carries **↑ and ↓ but not ←
or →**, and no other bundled subset has them either, so arrows, maths, box drawing and dingbats shaped
as the missing-glyph box. The editor's own *Use smart quotes/symbols* makes three of them — `->` → `→`,
`<-` → `←`, `[ ]` → `▢`.

Three files out of the library cover them, listed in `SYMBOL_FALLBACK_FILES`
(`src/engine/text/font-files.ts`) and read by `readSymbolFallbacks`:

| File | Size | Code points it adds |
|---|---:|---:|
| `noto-sans-math/…-default-0.woff2` | 196 KB | 746 (← → ≈ ∑) |
| `noto-sans-symbols-2/…-latin-ext-3.woff2` | 235 KB | 446 (✓ ★ ▢ ♥ ☑ ⚠) |
| `noto-sans-symbols/…-latin-ext-0.woff2` | 148 KB | 385 |

**They are picked by measured glyph coverage, not by the `unicodeRange` they declare.** That range
claims the `mayan-numerals` subset of Noto Sans Symbols 2 carries U+2190; opening the file and asking
for the glyph says otherwise. `src/engine/text/text-shaper.test.ts` checks the coverage against the real
files, so a change to the list has to earn it.

Together they cover **1,577 of the 1,741** code points in those blocks, for ~580 KB read once, on
demand. What is left is mostly the heavy and doubled box-drawing variants (U+2501–U+257F) and a few
characters that are emoji anyway and come from the colour emoji font. Those still draw as the box.

Loading is triggered by `TextShaper.uncoveredCodePoints`, which asks every registered typeface for a
glyph, so text with only ™ or ↑ — which Inter *does* carry — never pulls the 580 KB.

### Emoji

An emoji is ordinary text: what matters is how soon the character just typed stops being a box.
Noto Color Emoji is 5.7 MB whole, and it used to ship that way — inlined as base64 into a **7.6 MB
JavaScript chunk** that was fetched, parsed and `atob`-decoded before the first emoji could be
drawn. It is read from the library now, in the eleven subsets it is split into (2.0 MB together, 10
KB to 709 KB each), and only the subsets a text's own emoji fall in: 😭 costs **141 KB**.
`readEmojiSubsets` picks them from each file's `unicodeRange` in `noto-color-emoji/files.json`,
through the same `subsetsFor` the CJK families use.

**It has to be the library's copy.** `@fontsource/noto-color-emoji` splits the same font into ten
subsets, and those carry no `COLR`/`CPAL` table: registered with CanvasKit they draw *nothing at
all*, not even in black, while their `cmap` still reports a glyph — so the font looks fine right up
until it is painted. The library's subsets draw in full colour.
`src/engine/text/text-shaper-draw.test.ts` holds that down by counting coloured pixels, and the
Fontsource package is no longer a dependency.

The declared ranges were checked against the glyphs the files actually carry — 1,322 code points, no
disagreement — which is why they can be trusted here while the symbol families' cannot.

## Reading the assets

`src/ui/fonts/google-fonts.ts` reads these files with `fetch`, which the repository otherwise forbids
(`no-restricted-globals`, "Openframe must not perform network requests"). The rule is exempted for that
file and for `src/ui/icons/material-symbols.ts` alone, because they read what shipped with the app from
its own origin. No request leaves the app.

## Licensing

The library is licensed per family — almost all OFL 1.1, some Apache 2.0, a few UFL. All three permit
redistribution. The family's category and designers are recorded in the index beside it.
