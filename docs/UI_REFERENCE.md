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

## The Dev Mode toolbar

The reference's Dev toolbar reads: **Move · Copy colors · Measurement · Annotation · Comment · Inspect ·
Re-center**. Ours has Move tools (Move, Hand), Handoff tools (Measurement) and Comment tools. The four
missing entries are features rather than fidelity, so they are left for the matrix, not this pass.
