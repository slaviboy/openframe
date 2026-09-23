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

## Reading the assets

`src/ui/fonts/google-fonts.ts` reads these files with `fetch`, which the repository otherwise forbids
(`no-restricted-globals`, "Openframe must not perform network requests"). The rule is exempted for that
file and for `src/ui/icons/material-symbols.ts` alone, because they read what shipped with the app from
its own origin. No request leaves the app.

## Licensing

The library is licensed per family — almost all OFL 1.1, some Apache 2.0, a few UFL. All three permit
redistribution. The family's category and designers are recorded in the index beside it.
