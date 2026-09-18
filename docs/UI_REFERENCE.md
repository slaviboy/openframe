# UI reference: measured against real the reference

`src/ui/tokens.css` points here. This file is the committable record of measurements taken from saved
reference-app pages, because those pages themselves cannot be committed.

## Where the numbers come from

The user saved 11 complete the reference editor pages on 2026-09-18 into `reference/app/`, which is
**gitignored** — the pages are the reference's own markup and weigh 33 MB. Each carries the full DOM *and*
~2.5 MB of embedded CSS, so class names, custom-property values and inline SVG paths are all readable
without a browser.

| File | What it captures |
|---|---|
| `design_mode_button.html` | Design mode, a button instance selected — the main source below |
| `design_mode_component.html` | Design mode, a component selected |
| `dev_mode_1.html`, `dev_mode_text_list.html`, `dev_mode_text_code_css.html`, `dev_mode_text_code_compose.html` | Dev Mode inspect panel, list and code views |
| `draw_mode.html`, `motion_mode.html` | Draw and Motion right panels |
| `variables_minimized.html`, `variable_expanded.html` | The variables view |
| `comments.html` | The comments panel |

Two cautions that shape everything here:

- **Each token is declared twice — light first, then a dark override.** Reading the first match gives the
  light value. `--elevation-100-canvas` and `--elevation-200-canvas` resolve to `initial` in light and to
  real shadows in dark, so the shadows recorded below are **dark-theme only** and belong under
  `:root[data-theme='dark']`. Our light `--shadow-panel` stays until someone captures a light-mode page.
- **Each page is one theme, one mode, one selection state.** Anything that only appears for a shape, a
  text layer or a multi-selection has no reference at all. Do not infer it — leave it unmeasured.

## Tokens

From the `:root` declarations in `design_mode_button.html`.

| The reference | Value | Ours | Verdict |
|---|---|---|---|
| `--spacer-1` | `.25rem` = 4px | `--space-1: 4px` | matches |
| `--spacer-2` | `.5rem` = 8px | `--space-2: 8px` | matches |
| `--spacer-3` | `1rem` = 16px | `--space-4: 16px` | matches (our `--space-3` is 12px, which the reference has no equivalent for) |
| `--spacer-4` | `1.5rem` = 24px | `--space-6: 24px` | matches |
| `--radius-small` | `.125rem` = 2px | `--radius-xs: 2px` | matches |
| `--radius-medium` | `.3125rem` = 5px | `--radius-md: 5px` | matches |
| `--radius-large` | `.8125rem` = 13px | `--radius-xl: 13px` | matches |
| `--font-weight-strong` | `550` | `--weight-strong: 600` | **differs** — ours is heavier. Our `--weight-medium` is already 550. |
| `--text-body-small-font-size` | `.5625rem` = 9px | `--text-xs: 10px` | **differs** by 1px |
| `--ramp-blue-500` | `#0d99ff` light, `#0c8ce9` dark | `--accent-design: #0d99ff` | matches (light) |
| `--ramp-blue-600` | `#007be5` | — | used by `--color-icon-brand` |
| `--ramp-grey-100` | `#f5f5f5` | `--bg-control: #f5f5f5` | matches |
| `--elevation-100-canvas` | light `initial`; dark `0 0 .5px rgba(0,0,0,.5), 0 1px 3px rgba(0,0,0,.4), inset …` | — | dark only |
| `--elevation-200-canvas` | light `initial`; dark `0 3px 8px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.5), inset …` | `--shadow-panel` | dark only |

Neither `--weight-strong` nor `--text-xs` is re-pointed at the reference's value. **The rule: a token is
re-pointed only when every one of its call sites has been measured against the reference; otherwise the
fix lands at the call site.** `--weight-strong` is used by six CSS modules — the layer tree, the page
list and the presentation chrome among them — none of which has been measured.

## The toolbar

The reference calls it the toolbelt. Classes from `design_mode_button.html`.

```
.positioned_design_toolbelt--root  position:fixed; left:0; right:0; bottom:12px; z-index:8;
                                   display:flex; justify-content:center; pointer-events:none
.toolbelt--root                    height:48px; border-radius:var(--radius-large); width:fit-content;
                                   background:var(--color-bg); box-shadow:var(--elevation-200-canvas)
.toolbelt_left_side--leftSideRow    height:48px; display:flex; gap:var(--spacer-2); padding:8px
.toolbelt_divider--divider          width:1px; margin-left:0; align-self:stretch;
                                   background-color:var(--color-border)
.toolbelt_mode_segmented_control--container  display:flex; align-items:center; padding:8px
.design_toolbelt--enabledToolsRow   display:flex; gap:var(--spacer-2)
.tool_group--toolGroup              display:flex; gap:1px
.toolbelt_button--topLevelButtonNew  display:flex; align-items:center; fill:var(--color-icon);
                                   border-radius:var(--radius-medium)
.toolbelt_button--topLevelButtonPrimaryPadding  padding:var(--spacer-1)
.toolbelt_button--selectedButton    background-color:var(--color-bg-toolbar-selected);  /* ramp-blue-500 */
                                   --color-icon:var(--color-icon-onbrand)               /* white */
.tool_group--flyoutChevron          width:16px; padding:var(--spacer-1) 0;
                                   border-radius:var(--radius-medium); fill:var(--color-icon-toolbar)
```

Mode switcher:

```
--fieldset        height:32px; padding:2px; border-radius:var(--radius-medium);
                  background:var(--color-bgtoolbarmodeswitcher)   /* grey-100 light, grey-600 dark */
--option          width:28px; height:100%; border-radius:calc(var(--radius-medium) - 2px)  /* 3px */
                  --color-icon:var(--color-icon-secondary)
--selectedOption  position:absolute; width:28px; height:calc(100% - 4px);
                  background:var(--color-bg); box-shadow:var(--elevation-100-canvas)
```

Group markup, for comparison with our `ToolButton`:

```html
<div class="tool_group--toolGroup" aria-label="Move" role="group">
  <button aria-label="Move" aria-pressed="true" data-tooltip="Move" data-tooltip-shortcut="V">…24px svg…</button>
  <button aria-label="Move tools" aria-haspopup="menu" aria-expanded="false">…chevron…</button>
</div>
```

**Group order in Design mode** — Move · Frame (*Region tools*) · Rectangle (*Shape tools*) · Pen
(*Creation tools*) · Text (*Type tools*) · Comment (*Comment tools*). This is **identical to our
`GROUPS`**; the group labels match too.

Differences from ours, before this pass:

| | The reference | Ours |
|---|---|---|
| Gap between groups | 8px | 4px |
| Gap inside a group | 1px | 0 |
| Padding | each row pads itself by 8px | `.toolbar { padding: 0 8px }` |
| Divider | full height, no margin | 24px tall, 4px margins |
| Mode fieldset | 32px tall, 2px pad, 5px radius | 8px radius, 1px pad |
| Mode option | 28px, 3px radius | 30px, 7px radius |
| Selected mode | a separate absolutely-positioned pill that slides | background + `0 0 0 1px` ring on the option |

**Landed.** The gaps, the padded rows, the full-height divider, the 1px split inside a group and the
mode switcher's geometry are all in. The checked mode now takes `--accent`, so the switcher goes green
in Draw as the reference's does.

While doing it, nine CSS declarations turned out to reference tokens that **do not exist here** —
`--color-accent`, `--color-bg-secondary` and `--fg-danger` are the reference's names, pasted in without being
defined, so the fallback always won and the value could never be themed. They now point at `--accent`,
`--bg-control` and `--accent-danger`.

**Known gap, deliberately not built:** the sliding selection pill. It needs a position-measuring effect
in `Toolbar.tsx` and moves 28px; the static highlight reads the same at that size.

## The right panel

**Rows are a 28-column grid**, which is the structural find:

```
.ui3_rows--_grid                    display:grid; column-gap:var(--spacer-2);
                                    padding-left:var(--spacer-3); padding-right:var(--spacer-2)
.raw_components--row                grid-template-columns:repeat(28,1fr)
.transform_panel--gridLeft          grid-column:1 / span 12
.transform_panel--gridRight         grid-column:13 / span 12
.stack_panel_v4--layoutDetailsIcon  grid-column:25 / span 4
.panel_title--panelTitle            grid-column:1 / span 10; margin-left:-8px;
                                    font-weight:var(--font-weight-strong); letter-spacing:1%
```

Two fields of 12 columns plus a trailing 4-column control. Our `.row` is
`minmax(0,1fr) minmax(0,1fr) 24px` — the same idea, but the trailing column is a fixed 24px instead of
4/28 of the panel, so it drifts out of alignment as the panel is resized.

The section padding already matches: The reference's `padding-left: var(--spacer-3)` / `padding-right:
var(--spacer-2)` is our `.section { padding: 0 8px 8px 16px }`, and both use an 8px column gap.

**Section order, Design mode**, read from the DOM of `design_mode_button.html`:

1. Header — Multiplayer tools · Prototype view · Present · zoom · More actions; tabs Design/Prototype; Share
2. Component properties
3. **Position** — *Ignore auto layout* → Alignment → X / Y → Rotation → Rotate 90˚ right / Flip H / Flip V
4. **Auto layout** — Flow · Layout (Freeform/Vertical/Horizontal/Grid/Wrap) · Resizing W/H (Fill/Hug) ·
   Lock aspect ratio · a 3×3 alignment box · gap and padding · Clip content
5. **Appearance** — Hide · opacity · corner radius · blend mode
6. **Fill** → 7. **Stroke** → 8. **Effects** → 9. **Selection colors** → 10. **Layout guide** → 11. **Export**

Ours titled (4) "Layout", put *Ignore auto layout* last inside Position, and rendered Selection colors
before Effects.

**Panel width is not a CSS constant** — the reference sets it dynamically. The capture shows `width:340px` on an
element near the right sidebar, which may be the user's own resize rather than a default. Ours is 248px
(min 248, max 400) and is **left alone** until a second capture settles it.

## Icons

The saved pages hold 128 usable icon path-sets on the `0 0 24 24` and `0 0 16 16` grids (other viewBoxes
are cursors, avatars and the reference brand mark, all excluded). The reference paints them with
`fill="var(--fpl-icon-color, var(--color-icon))"`, which becomes `currentColor` for us, and a two-tone
secondary of `var(--color-icon-color-3)`, which becomes `var(--fg-tertiary)`.

`scripts/extract-reference-icons.mjs` does the reading. It prints a TSX fragment and never writes
`src/ui/icons/icons.tsx`, because the reference's labels are not directly keyable: all four mode icons report the
same label, and `Comment` arrives as `Comment (515 unread)`.

The reference brand mark is **not** copied. Our `logo` icon stays ours.

### What these captures do not contain

Running the extractor shows 128 distinct glyphs: 43 already in our set (lifted in an earlier session from
the same kind of page), 1 newly named, and 84 still to name. Reading the 84 labels settles a scoping
question — **none of our 52 hairline `STROKE` icons has a counterpart here.** The pages were saved with
every flyout closed and vector edit mode inactive, so the reference's shape glyphs (line, arrow, ellipse,
polygon, star, image) and its vector-tool glyphs (lasso, cut, bend, paint, eraser, variable width,
shape builder) are simply not in the markup, and neither are the typography icons.

Those are exactly the icons that make our toolbar look mixed. They cannot be taken from these captures,
and inferring them is the very thing this pass exists to stop, so two more saved pages would close the
gap: **the Shape tools flyout open**, and **vector edit mode active**. Until then the stroke icons that
*do* have a reference here are converted and the rest are left alone. Five so far: `instance`,
`collapse`, `detach` and `paddingSides` moved from hairline to the reference artwork, and `pencil` was
replaced with the reference's own. The other 48 keep their invented drawings.

The extractor refuses to emit a name two glyphs both claim — the reference labels both its instance diamond and
a corner-bracket mark "Instance" — and prints them for a decision instead.

Usable references present for icons we already have: Instance, Text, Auto layout, Collapse layers,
Detach variable, Select layer, Individual padding, Horizontal/Vertical padding, Annotation, Origin,
Apply variable, Edit object, Create collection, Edit variable, Copy colors, Timeline panel,
Collapse timeline, Measurement, Play, Loop, Filter, Comment, Main menu, Select layer.

**One conflation found while mapping:** our `width` icon is rendered both for the Measurement tool
(Dev Mode, `Toolbar.tsx:151`) and for the Variable width tool (vector edit, `Toolbar.tsx:202`) — one
glyph for two unrelated things. The reference draws a ruler for the first. They must be split into two names
before either can take a reference glyph.

## What has been checked so far

`docs/FEATURE_MATRIX.md` now carries a **Fid** column saying whether a row's *look* has been held against
a saved page — a separate question from whether it works. Three rows are `ref~` (checked, with a recorded
deviation); every other row is `—`, which is the honest state: the look was built from prose.

| Row | State | The deviation |
|---|---|---|
| Floating bottom toolbar | `ref~` | The mode switcher's selection does not slide |
| Mode switcher | `ref~` | Same |
| Right sidebar tabs | `ref~` | Section order, names and title weight match; **rows are not on the reference's 28-column grid** |

The 28-column grid is the largest structural difference still open on the panel. Our `.row` puts a fixed
24px in the trailing column where the reference gives it 4 of 28 columns, so the two drift apart as the panel is
widened. Changing it touches every row in a 3,700-line file, so it wants a slice of its own.

## Dev Mode

From `dev_mode_text_list.html` (a text layer, list view). Section order:

> layer name + type → **MCP** → **Layer properties** → **View** (List | Code) → *Unit* →
> **Layout** (Width, Height) → **Typography** → **Modes** → **Colors** → **Motion** →
> **Transitions** → **Text content** → **Export**

Ours: layer name → Status → (unlabelled List|Code tabs) → Position → Size → Layout → Appearance →
Playground → Motion → Variables → Dev resources → Annotations → Measurements → Dev assets → Compare.

**Landed:** the List/Code switch now sits on a row labelled **View**, as the reference names it, and the
variable **Modes** come before **Motion**, which is the reference's order.

**Landed too:** Position, Size and Layout are now one **Layer properties** section, as the reference
holds them, with width and height on a single `160 × 120` line — each half still its own copy button,
which is how the reference does it as well.

There are **four** Dev Mode captures, not one, and they cover different selections: `dev_mode_1.html` has
a *frame* (showing distances to the container edges, border radii, Border, Padding and `375 × 812`),
while the three `dev_mode_text_*` files have a *text* layer in list, CSS and Compose views. An earlier
note here claimed there was no frame reference; that was wrong, and reading `dev_mode_1.html` is what
made the merge above possible.

Still unmatched, in both directions: the reference has **MCP**, **Component information**, **Colors**
(with a colour format control) and **Transitions** sections that we have nothing for; we have
**Playground**, **Dev resources**, **Annotations**, **Measurements**, **Compare** and an **Appearance**
section (opacity, blend mode) that the captures show nothing for. Those are features, not fidelity.

## Dev Mode's code wells

Measured from `dev_mode_text_code_css.html` and `dev_mode_text_code_compose.html`, which are the same
text layer in CSS and in Compose. Code is **not** one block in the reference: it is split into named
aspects, each its own titled section with its own copy button and its own well.

| Reference class | CSS read off it | Where it landed |
| --- | --- | --- |
| `code_panel--codePanelHeader` | `width:100%; display:flex; justify-content:space-between; align-items:center; min-height:32px; padding:0 16px` | `CodeAspects.module.css .header` |
| `code_panel--codePanelTitle` | `padding:8px 0; font-weight:400; color:var(--color-text)`, 11px | `.title` |
| `code_panel--codePanelActions` | `display:flex; gap:4px`, shown on `:hover` of the container | `.actions` |
| `code_panel--codeWell` (+ `includeMargin`) | `display:flex; padding:8px 0 0; margin:1px 16px; box-shadow:0 0 0 1px var(--color-border-code-well); border-radius:var(--radius-medium)` | `.well` |
| `code_panel--lineNumbersColumn` | `min-width:20px; margin-top:-8px; padding-top:8px; border-right:1px solid var(--color-border-code-well)` | `.lineNumbers` |
| `code_panel--lineNumber` | `min-width:12px; color:var(--color-text-tertiary); justify-content:end; padding:0 4px` | `.lineNumber` |
| `code_panels_shared--code` | `font-family:Roboto Mono,…; font-weight:400; font-size:11px; line-height:18px; letter-spacing:.005em` | `.generated`, `.lineNumber` |
| `code_panel--line` | `height:18px; min-height:18px; white-space:nowrap; display:flex; align-items:center` | `.line` |
| the line's inner span | `padding-left:24px; padding-right:8px; text-indent:-16px; flex-grow:1` | `.lineText` |

**Colours.** The reference's syntax colours resolve through its ramp; both ends were read out of the
same file, `:root` for light and `[data-preferred-theme=dark]` for dark:

| Token | Reference | Light | Dark |
| --- | --- | --- | --- |
| `--code-value` (`.token.plain` under `[data-lang=css]`, `.number`, `.unit`) | `--color-codevalue` → pink 600/400 | `#ea10ac` | `#fc9ce0` |
| `--code-accent` (`.token.function`) | `--color-codeaccent` → orange 900/400 | `#ce7012` | `#fcb34a` |
| `--code-string` (`.token.string`) | `--color-codestring` → blue 600/400 | `#007be5` | `#7cc4f8` |
| `--code-comment` (`.token.comment`) | `--color-codecomment` → black/white 500 | `rgba(0,0,0,.5)` | `rgba(255,255,255,.7)` |
| `--code-tag` | `--color-codetag` → purple 600/400 | `#8638e5` | `#d1a8ff` |
| `--border-code-well` | `--color-border-code-well` | `var(--border)` | `rgba(255,255,255,.1)` |

`.token.property`, `.token.punctuation`, `.token.operator` and `.token.keyword` carry **no colour rule**
in the reference — they inherit the code colour — so ours do the same rather than inventing one.

**Deviations, recorded rather than hidden.**

- The reference names its aspects per language and per selection; we can only name the aspects our own
  generators produce. CSS gives **Layout** and **Typography** and Compose gives **Modifier**, **Layout**
  and **Text** — all four names are the reference's. SwiftUI, UIKit and Android XML have **no capture at
  all**, so their single aspect is named `View`/`View`/`Layout` by us, and `code-gen.ts` says so at each
  one. Compose's **Variables** aspect is the reference's and we do not produce it: we have no bound
  variables to list in code.
- `tag` and `attribute` are token kinds of ours, for Android XML, which no capture covers.
- The reference draws a colour `chit` before a value and, for Compose, before a `0xAARRGGBB` literal.
  Ours does both. It renders as an empty swatch, so the spans still concatenate back to the exact line —
  `code-tokens.test.ts` asserts that for every language.
- Highlighting is a hand-written scanner (`src/core/dev/code-tokens.ts`), not a library: the page's CSP
  is `script-src 'self' 'wasm-unsafe-eval'`, which rules out the highlighters that build their grammars
  with `new Function`. It only ever sees what `code-gen.ts` writes, and anything it cannot classify falls
  through to `plain`.
- Our generators indent with real spaces, so `.lineText` adds `white-space: pre`; the reference's own
  lines carry their indent in the styling instead.
- The **Copy code** button that used to sit under the single `<pre>` is gone. Each aspect now has the
  reference's icon button, labelled `Copy {Aspect}, press shift to copy all code` — and shift really does
  copy all of it.

## Dev Mode's MCP and Component information

Section order across the three captures that show it: **MCP → Component information** (frames standing
for a component only) **→ Layer properties → …**. Both now sit there.

| Reference class | CSS read off it | Where it landed |
| --- | --- | --- |
| `mcp_panel--container` | `padding:0 16px; margin-bottom:4px; color:var(--color-text-secondary)` | `DevSections.module.css .mcp` |
| `mcp_panel--settingsContainer` | `margin-top:8px; gap:8px` | `.mcpSettings` |
| `mcp_panel--settingRow` / `--settingLabel` | `gap:8px`; label `width:116px; flex:0 0` | `.mcpRow` / `.mcpLabel` |
| `mcp_panel--examplePromptContainer` | `margin-top:12px; gap:8px` | `.mcpPrompt` |
| `mcp_panel--examplePromptWell` | `padding:8px 12px; gap:4px; border:1px solid var(--color-border); border-radius:var(--radius-medium)` | `.promptWell` |
| `mcp_panel--examplePromptLink` | `color:var(--color-codestring)` | `.promptLink` (our `--code-string`) |
| `component_preview_panel--componentPreviewContainer` (+ `common--well`) | `margin:0 16px 8px; height:140px; border-radius:var(--radius-medium); background:var(--color-bg-secondary)` | `.previewWell` |
| `component_preview_panel--componentPreviewImage` | `margin:16px` | `.previewImage` |
| `component_props_list--playgroundButtonContainer` | `padding:8px 16px` | `.buttonRow` |

The reference's spacers resolve to `--spacer-1: .25rem` (4px), `--spacer-2: .5rem` (8px), `--spacer-2-5: .75rem`
(12px) and `--radius-medium: .3125rem` (5px) — which is our `--radius-md`.

**Deviations, recorded rather than hidden.**

- **Component information is real.** The preview is the main component drawn by `useLayerThumbnail`, and
  "Explore component behavior" opens the Playground and scrolls to it.
- **MCP has the reference's shape and Openframe's answers.** the reference's MCP server hands a selection to an
  agent over the network; Openframe is offline and runs none, so *Not sent* is the truth here rather than
  a state that might change. The token estimate is computed locally (four characters to the token) from
  the prompt this panel builds, and the prompt is text the button really copies. A line of body text the
  reference does not have says plainly that there is no server — that is the alternative to drawing a
  control that does nothing.
- **Two of the reference's buttons are left out**: "Open help" (there is no help page) and "Set up
  third-party agents for the reference MCP" (there is nothing to set up).
- The reference's prompt well is labelled with the prompt itself, and so is ours. That is not only
  faithful: labelling it "Copy example prompt for …" collided with the *Copy example prompt* button under
  it, since Playwright matches accessible names case-insensitively by substring.

## Dev Mode's typography preview, Text content, and the section order

For a text layer the reference puts a **typography preview** inside Layer properties where a frame gets
the box model — `inspect_panel--layerPreview` holds one or the other, never both.

| Reference class | CSS read off it | Where it landed |
| --- | --- | --- |
| `typography_preview--previewContainer` (+ `--previewContainerBoxed`, `common--well`) | `height:140px; margin:4px 16px; display:flex; justify-content:center; align-items:center; color:var(--color-text-secondary)` | `TypographyPreview.module.css .well` |
| `typography_preview--centredRow` | `position:relative; display:flex; justify-content:center; gap:0; width:100%` | `.row` |
| `typography_preview--measure` | `position:absolute; flex-direction:column; justify-content:center; padding:0 4px`; `.left{right:0}`, `.right{left:0}` | `.measure`, `.left`, `.right` |
| `typography_preview--value` | `border-radius:2px; background:var(--color-bg-measure); color:var(--color-text-onmeasure); padding:1px 3px; margin:0 8px` | `.value` |
| `typography_preview--dash` `:before`/`:after` | `width:50%; border-top/bottom:1px dashed var(--color-bg-measure)` | `.dash::before/::after` |
| `typography_preview--measurementLine` | `position:absolute; left:0; right:0; border-top:1px dashed var(--color-bginspectpadding)` | `.sampleLine` |
| `typography_preview--borderedPreview` | `border:1px solid var(--color-bginspectpadding)` | `.sample` |
| `typography_preview--styleName` on `--labelBase` | `font-weight:500; padding:4px 6px; border-radius:2px; color:var(--color-text)` | `.styleName` |
| `text_well--textWell` (+ `common--well`) | `padding:4px 8px; margin-inline:16px; margin-top:4px; font-size:11px; font-family:Roboto Mono; line-height:16px; letter-spacing:.05px; border:1px solid var(--color-border)` | `DevSections.module.css .textWell` |

`--color-bg-measure` is red 500 — `#f24822` light, `#e03e1a` dark — which is our existing
`--accent-measure`. `--color-bginspectpadding` is blue 500, `#0d99ff` light and `#0c8ce9` dark, and is a
**different token** from the pale padding fill the box model uses; it landed as `--inspect-guide` rather
than being folded into `--bg-inspect-padding`.

**Section order.** The three captures that show the whole panel agree on:

> MCP → Component information *(only when the layer stands for one)* → Layer properties →
> Layout / Typography *(list view)* → Modes → Colors → Selection or Text colors → Motion → Transitions →
> Assets / Icons / Text content → Export

Ours now reads: header → MCP → Component information → Layer properties → Variables *(our Modes and
Colors)* → Motion → Text content → Dev assets → **then Openframe's own**: Status, Appearance, Playground,
Dev resources, Annotations, Measurements, Compare. Only *where* `DevStatusControl` is called moved; its
markup is untouched, because the Design inspector renders the same component.

**Deviations, recorded rather than hidden.**

- The reference's type sample is a picture its server renders; ours is the text itself, set in the layer's
  own font. The labels carry the real measurements and only the drawing is scaled — to a 64px line box,
  which is what the reference's 32sp line at 64.5px works out to — clamped to between half size and four
  times, so a 6px caption and a 96px display both read.
- The reference names a **text style** under the sample; we have no text styles bound to a layer to name,
  so the button under ours names the font and its weight, which is what we do know.
- The reference's Text content title row carries a variable button beside its copy button. We have no
  variable bound to a text layer's content, so only the copy button is there.
- **Transitions**, **Selection colors** and the colour-format control in **Colors** have no counterpart
  here; they are features, not fidelity, and stay on the matrix.

## The eyedropper: its icon, its cursor and its loupe

From `dev_mode_color_picker.html` (the Copy colors tool active) and a screenshot the user supplied of the
loupe, which no saved page carries — the reference draws it on the canvas itself, so it is not in the DOM.

**Icons.** The user supplied the Dev toolbar's five buttons with their artwork. Two landed: `eyedropper`
(the reference labels it **Copy colors**, its own name for the eyedropper in Dev Mode) and `measurement`.
The measurement glyph replaces the `width` icon the toolbar was borrowing — an earlier pass mapped
The reference's Measurement glyph onto `width` and it was removed again, because `width` also serves the Variable
width tool. This is the real artwork, so the conflation is gone. `move`, `annotation` and `comment` were
supplied too and are not yet taken up.

**The toolbar row.** `design_toolbelt--enabledToolsRow` holds five plain buttons with no dropdowns, so
Dev Mode's tools are each their own group here rather than sharing one with a chevron. And a group of one
now drops its chevron everywhere, not just in Dev Mode: the reference only puts one on a button that has
something to choose between, and ours was drawing a disclosure that opened a menu of a single item. It
drops the `role="group"` wrapper with it, so a lone tool reads as the one button it is — the way Actions
always has. In Design that is the Comment tool; in Dev Mode, Copy colors, Measurement and Comment.

**The cursor.** the reference ships it twice. The saved page carries a runtime class with

```
cursor: -webkit-image-set(url(data:image/png;base64,...) 4x) 8 24, auto !important
```

and `reference_app.min.css.br.css` carries the same cursor as its **source SVG**, on `.color_swatch--chit`
(hovering a swatch offers to pick it), at the same `8 24` hotspot. The SVG is the better source, so that
is what we use, verbatim: a 32px canvas, a white silhouette path under a black drawing path, and the reference's
own drop-shadow filter (`dy 1`, `stdDeviation 1.5`, black at 35%) over both. An earlier pass had built
this cursor from the toolbar icon's path with an outline of our own; that is gone. `crosshair` stays as
the fallback for a browser that refuses SVG cursors.

That stylesheet holds exactly **two** custom cursors — this one and `.hyperlink_popup--clickable`
(hotspot `16 8`, a pointing hand with a link). Every other cursor in it is a CSS keyword, and the reference's
canvas tool cursors are set at runtime through `--cursor-type` rather than declared there, so the file
settles none of the others. The hyperlink cursor is not taken up: we have no call site that `pointer`
does not already serve.

**The loupe.** Read off the user's screenshot, since no capture has it:

| Part | What it is |
| --- | --- |
| The tile | a white rounded square, ~68px, magnifying the device pixels around the pointer, one cell each |
| The sampled pixel | ringed - white inside, red outside - so it reads on a light or a dark colour |
| The pill | a dark rounded panel beside it, ~64px tall, holding a round swatch of the colour |
| Its title | the colour in **RGB**, e.g. `RGB 202 46 52` |
| Its second line | a small dashed square and **Click to copy** |

Ours reads an 11x11 square of device pixels (`Editor.sampleCanvasRegion`, a readback the size of the
loupe rather than the one pixel the eyedropper already read) and draws exactly that. The second line says
*Click to copy* in Dev Mode, where clicking really does put the hex on the clipboard, and *Click to
apply* elsewhere, where it paints the selection - the reference only ever shows the Dev Mode wording,
because Design has no loupe of this shape.

One thing worth writing down: the tile's magnified pixels must be drawn with the canvas shadow turned
off. Left on, each of the 121 cells casts its own blur and the sample reads as a pale grey mesh instead
of flat colour. The tile itself casts the shadow, before the clip.

## The Dev Mode toolbar

The reference's Dev toolbar reads: **Move · Copy colors · Measurement · Annotation · Comment · Inspect ·
Re-center**. Ours now has Move tools (Move, Hand), **Copy colors**, **Measurement** and Comment tools —
the first two from the artwork the user supplied. **Annotation**, **Inspect** and **Re-center** are still
missing; Annotation's artwork has been supplied and is not yet taken up.

## The pen tool: the two bottom bars and the vector-edit panel

From `pen_tool_1.html` (the Pen active on a vector with its points open), the endpoint listbox markup the
user supplied, `design_mode_button.html` for the panel's shared controls, and the docs mirror's
`design-with-vector-tools/` and `additional-properties/` pages.

### Two bars, not one

The saved page holds **both** bottom toolbars at once:

| Offset | Element |
| --- | --- |
| 2705264 | `toolbelt--root`, `aria-label="Editor"` — the main bar, `height:48px`, **Pen pressed**, mode switcher intact |
| 2724432 | `secondary_toolbelt--root`, `aria-label="Vector editing"` — the 40px bar, floating above it |

`secondary_toolbelt--rootPositioning` is `height:96px; position:absolute; bottom:0` and the root is
`align-items:flex-start`, so the 40px bar's lower edge sits 56px above the toolbar's — an 8px gap over a
48px bar. An earlier note in this file claimed the reference *replaces* the toolbar with the toolbelt as
soon as the Pen is in hand. It does not; that was inferred from a capture where both were true at once.

> Move (V) · Lasso (Q) │ Paint (⇧B) · Bend (⌘) · Cut (X) · Erase (⇧E) │ More │ Close

| Reference class | CSS read off it | Where it landed |
| --- | --- | --- |
| `secondary_toolbelt--secondaryToolbeltContainer` | `height:40px; background:var(--color-bg); border-radius:var(--radius-large); box-shadow:var(--elevation-200-canvas); padding:8px; gap:8px` | `Toolbar.module.css .vectorToolbelt` |
| `toolbelt_button--topLevelButtonNew` | `display:flex; align-items:center; border-radius:var(--radius-medium)` | `.tool` |
| `toolbelt_button--topLevelButtonSecondaryPadding` | `padding:0` — the bar's buttons are the bare 24px glyph, against the toolbar's `...PrimaryPadding` | `.beltTool` |
| `toolbelt_button--selectedButton` | `background-color:var(--color-bg-toolbar-selected)` (ramp-blue-500), `--color-icon:var(--color-icon-onbrand)` (white) | `.tool[data-active]` |
| `toolbelt_button--buttonLabel` | `white-space:nowrap; padding-right:8px` | `.toolLabel` |
| `toolbelt_divider--divider` (+ `--extendedDivider`) | `width:1px; background:var(--color-border); align-self:stretch; margin:-8px 0` | `.toolDivider` |
| the More button | `--icon-button-size:1.5rem`, `padding:0`, and its inner row `margin-left:8px; margin-right:4px` | `.moreTool` |

`--radius-medium` is `.3125rem` = 5px and `--radius-large` `.8125rem` = 13px, which our `--radius-md` and
`--radius-xl` already were; `--color-border` is `#e6e6e6` / `#444` and `--color-icon-secondary`
`#00000080`, which ours already were too.

**The glyphs are the reference's own.** Lasso, Bend, Cut and Erase replaced hand-drawn approximations;
Move and Paint have vector-edit glyphs of their own, because the bar's Move is *not* the toolbar's — it is
a smaller cursor between two handles, for dragging points rather than layers.

**Unmeasured.** Variable width and Shape builder keep our artwork: the reference draws them only inside
its More menu, which is closed in the capture. The documentation lists both among the vector edit tools,
and the reference keeps them in the overflow — both are true at once.

**Deviations.** The main toolbar keeps `aria-label="Tools"` rather than the reference's *Editor*, because
about thirty specs address it by that name; the bar above it takes *Vector editing* verbatim.

### The vector-edit panel

Between the `Vector` `<h1>` and the end of the panel the reference holds exactly four rows and two
sections — **Alignment → Position → Mirroring → Corner radius → Fill → Stroke** — and nothing about the
layer as a whole: no size, no rotation, no constraints, no auto layout, no opacity or blend, no effects,
no export. Every group label is `_14wijgr0`, which is `clip-path:inset(50%)`: screen-reader only. The
only visible headings are the `Fill` and `Stroke` `<h2>`s.

| Row | Reference classes | Grid | Ours |
| --- | --- | --- | --- |
| Alignment, Position | `x1kmaalo x1frmlc7 xbyi07e` | areas `"label1 label2 label2" / "input1 input2 icon"`, rows `auto 32px`, cols `1fr 1fr 24px` | `.row`, already this shape |
| Mirroring, Corner radius | `x1ra2ayo xdzfydn x16zb2db` | areas `"label1 label1" / "input1 icon"`, cols `1fr 24px` | `.rowNarrow` |
| Stroke controls, Endpoints | `ui3_rows--ui3TwoInputTwoIconRow` | cols `minmax(76px,1fr) 8px 1fr 8px 24px 4px 24px` | `.strokeRow` |

Every row is `display:grid; column-gap:8px; padding-left:16px; padding-right:8px`, which `.section` and
`.row` already were.

**Mirroring is a segmented radio group**, not a list: root `background:var(--color-bg-secondary);
border-radius:var(--radius-medium)`, each option `flex:1; min-width:1.5rem; height:1.5rem`. The chosen one
is `box-shadow: inset 0 0 0 1px var(--color-border); background: var(--color-bg)` — lifted onto the panel
colour inside a hairline, *not* filled with the accent — and `input:not(:checked)` draws its glyph in
`--color-icon-secondary`. The three glyphs are the reference's own.

**Alignment aligns the points**, not the layer, while points are open. **Position** is the picked point's
place, read in the space the layer's own X and Y are read in; with none picked the fields are blank and
disabled, so a disabled number field no longer reads *Mixed*.

**Unmeasured.** Where the tool sections the documentation asks for go — the Eraser's weight and shape, the
Paint tool's paint, the width profile and width point — the capture cannot say: it was taken with Move in
hand. Ours sit between Corner radius and Fill. The vector More-actions menu's entries are likewise not in
the capture, so they stay as they were.

### Panel selects

`design_mode_button.html` and `pen_tool_1.html` draw the same control (`_15y6gsq4 _15y6gsql _15y6gsqn`):

```
border:1px solid var(--color-border); border-radius:var(--radius-medium);
background:var(--color-bg); padding:0 0 0 var(--spacer-2); height:1.5rem;
font: 11px/16px; inner grid 1fr 1.5rem, the chevron in the trailing column
```

Ours were a grey fill with a border that only appeared on hover and no chevron. Fixed in
`primitives.module.css .select`; the chevron is the reference's own glyph, carried in the
`--select-chevron` token because a background image cannot take `currentColor`.

### The Stroke section

The reference's stroke row is **`[Stroke align ▾] [weight] [⇉]`** and nothing else. Everything else —
stroke style and dashes, join and miter angle, path trim, a brush, a dynamic stroke — sits behind
**Advanced stroke settings**, which is also the list `apply-and-adjust-stroke-properties.html` gives. Ours
rendered all of it inline, in Design mode too; it is now a dialog behind the reference's own glyph.

**The endpoint triggers.** The reference does not name the end beside a small picture. It draws the end
across the whole control: `endpoints--longIcon` is `width:100%; overflow:hidden` around a **200 × 24**
SVG, so the drawing is *clipped* by the control rather than scaled into it, and the End point is the same
drawing under `endpoints--ui3EndpointFlipped` (`transform:scaleX(-1)`).

| Value | Label | Notes |
| --- | --- | --- |
| `NONE` | None | |
| `ROUND` | Round | |
| `SQUARE` | Square | |
| — | — | separator |
| `ARROW_LINES` | Line arrow | ours is `LINE_ARROW` |
| `ARROW_EQUILATERAL` | Triangle arrow | ours is `TRIANGLE_ARROW` |
| `TRIANGLE_FILLED` | Reversed triangle | ours was missing it |
| `CIRCLE_FILLED` | Circle arrow | we called it *Circle* |
| `DIAMOND_FILLED` | Diamond arrow | we called it *Diamond* |

The eight 24px list glyphs are the reference's own artwork (the faint part of each is the rest of the
line, drawn in the tertiary icon colour, which we draw at 40% opacity), and `Menu` carries an icon per
item so the list reads as the reference's does.

**Derived, not measured.** Only `capNoneLong` is captured artwork — both ends are None in the saved page.
The other seven 200-wide drawings are derived from the 24px glyphs of the same list: the same head or cap,
with the line run out to the full width, and the captured dash strip for the three that have one.

**Deviations.** The trigger is a `button` with `aria-haspopup="listbox"` rather than a `combobox`, because
a native `<select>` cannot draw the endpoint; `data-value` carries the chosen cap so it can still be
asserted. The reference's list is `min-width:271px`; ours uses the shared menu's width.

### Still open on the pen tool

- The endpoints are offered for lines alone. The documentation puts them in the sidebar for any open path
  with two ends and in Advanced stroke settings for one with more, set per point in vector edit mode —
  which needs a cap on each vector point, and arrowheads drawn on the open ends of a vector network. The
  renderer only caps them round, square or flat today.
- Corner radius rounds a point where two straight lines meet, which is the corner the documentation
  describes. A point with a Bézier on either side stays sharp.
