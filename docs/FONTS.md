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

## Reading the assets

`src/ui/fonts/google-fonts.ts` reads these files with `fetch`, which the repository otherwise forbids
(`no-restricted-globals`, "Openframe must not perform network requests"). The rule is exempted for that
file and for `src/ui/icons/material-symbols.ts` alone, because they read what shipped with the app from
its own origin. No request leaves the app.

## Licensing

The library is licensed per family — almost all OFL 1.1, some Apache 2.0, a few UFL. All three permit
redistribution. The family's category and designers are recorded in the index beside it.
