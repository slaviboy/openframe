/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Reads the icon artwork out of the saved the reference pages in reference/app/ and prints a TSX
// fragment for src/ui/icons/icons.tsx. Run: npm run icons:reference
//
// It prints; it never writes. The reference's own labels are not directly usable as our icon names — all four
// mode icons report the same label, "Comment" arrives as "Comment (515 unread)" — so the naming is
// curated by hand and LABELS below holds what has been curated so far.
//
// The input is gitignored (it is the reference's markup, 33 MB), so this script is the only committed record
// of how the artwork got in. See docs/UI_REFERENCE.md.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'reference/app';

/** The only grids the reference draws icons on. Everything else is a cursor, an avatar or the brand mark. */
const GRIDS = new Set(['0 0 24 24', '0 0 16 16']);

/**
 * The reference label → our IconName, for the ones that have been checked by eye. Anything not here is printed
 * commented out with its label, to be named by hand.
 */
const LABELS = {
  Move: 'move',
  Frame: 'frame',
  Rectangle: 'rectangle',
  Pen: 'pen',
  Pencil: 'pencil',
  Actions: 'actions',
  'Flip horizontal': 'flipHorizontal',
  'Flip vertical': 'flipVertical',
  'Rotate 90˚ right': 'rotate90',
  'Align left': 'alignLeft',
  'Align right': 'alignRight',
  'Align top': 'alignTopEdge',
  'Align bottom': 'alignBottomEdge',
  'Align horizontal centers': 'alignHorizontalCenter',
  'Align vertical centers': 'alignVerticalCenter',
  'Minimize UI': 'sidebar',
  Variables: 'variables',
  Find: 'search',
  Close: 'close',
  Remove: 'minus',
  'Main menu': 'logo',
  Line: 'line',
  Arrow: 'arrow',
  Ellipse: 'ellipse',
  Polygon: 'polygon',
  Star: 'star',
  'Place image': 'image',
  Instance: 'instance',
  'Collapse layers': 'collapse',
  'Detach variable': 'detach',
  'Individual padding': 'paddingSides',
};

// The reference's "Measurement" is deliberately not mapped. Our `width` icon serves both the Measurement tool
// (Dev Mode) and the Variable width tool (vector edit) — one glyph for two unrelated things, which is a
// fidelity bug of its own. Taking the reference's ruler for `width` would silently change the vector tool too.
// Split them first, then map each.
//
// Glyphs whose name has no consumer here (The reference's play, loop, filter, settings…) are left unnamed
// rather than added: an icon nothing renders is dead weight.


/** Names we must never take from the reference, whatever the label says. */
const NEVER = new Set(['logo']);

/** Reads attributes off a tag, tolerating the reference's unquoted serialization (`fill=none viewBox="0 0 24 24"`). */
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

/** The reference paints icons through its own custom properties; ours use currentColor and one tertiary token. */
const colorOf = (fill) => {
  if (!fill || fill === 'none') return fill;
  if (fill.includes('icon-color-3') || fill.includes('icon-tertiary')) return 'var(--fg-tertiary)';
  return 'currentColor';
};

/**
 * Every icon in one page: each `<svg>` on a known grid, named from the nearest ancestor that carries a
 * label. The document is walked with a tag stack so "nearest ancestor" is the real one rather than
 * whatever attribute happened to appear last in the byte stream.
 */
function iconsIn(html) {
  const body = html.slice(html.indexOf('<body'));
  const found = [];
  const stack = [];
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'path', 'use', 'circle', 'rect', 'stop', 'source']);
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g)) {
    const [, closing, tag, rest] = m;
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const selfClosing = rest.trimEnd().endsWith('/') || VOID.has(tag);
    if (tag === 'svg') {
      const a = attrs(rest);
      const grid = a['viewBox'] ?? '';
      if (GRIDS.has(grid)) {
        // The element's own markup runs to its closing tag; paths are read from that slice.
        const end = body.indexOf('</svg>', m.index);
        const inner = end === -1 ? '' : body.slice(m.index + m[0].length, end);
        const paths = [...inner.matchAll(/<path([^>]*)\/?>/g)].map((p) => attrs(p[1])).filter((p) => p['d']);
        // A glyph with nothing but `fill=none` is stroked by the reference elsewhere; it would come out invisible.
        const painted = paths.some((p) => (p['fill'] ?? 'currentColor') !== 'none');
        if (paths.length > 0 && painted) {
          const named = [...stack].reverse().find((s) => s.label);
          found.push({ grid: grid.endsWith('16') ? 16 : 24, paths, label: named?.label ?? '' });
        }
      }
    }
    if (selfClosing) continue;
    const a = attrs(rest);
    const label = a['aria-label'] || a['data-tooltip'] || a['data-testid'] || '';
    stack.push({ tag, label: label.trim() });
  }
  return found;
}

/** The `d` strings already in our icon set, so an icon we have is never added a second time. */
function existingPaths() {
  const sources = ['src/ui/icons/icons.tsx', 'src/ui/icons/Icon.tsx'].filter((f) => existsSync(f));
  const byPath = new Map();
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    // Each entry is `name: { viewBox: N, body: <path … d="…" /> }` or a STROKE fragment.
    for (const m of src.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)\s*:([\s\S]*?)(?=\n\s{2}[A-Za-z][A-Za-z0-9]*\s*:|\n\};|\n\} as const)/gm)) {
      for (const d of m[2].matchAll(/\bd="([^"]+)"/g)) byPath.set(d[1], m[1]);
    }
  }
  return byPath;
}

/** One icon as the TSX our map holds. */
function toTsx(name, icon) {
  const body = icon.paths
    .map((p) => {
      const parts = [`fill="${colorOf(p['fill'] ?? 'currentColor')}"`];
      if (p['fill-rule']) parts.push(`fillRule="${p['fill-rule']}"`);
      if (p['clip-rule']) parts.push(`clipRule="${p['clip-rule']}"`);
      parts.push(`d="${p['d']}"`);
      return `<path ${parts.join(' ')} />`;
    })
    .join('');
  const wrapped = icon.paths.length > 1 ? `<>${body}</>` : body;
  return `  ${name}: { viewBox: ${icon.grid}, body: ${wrapped} },`;
}

if (!existsSync(DIR)) {
  console.error(`No saved the reference pages at ${DIR}/.`);
  console.error('They are gitignored on purpose — ask for them, drop the .html files in, and run this again.');
  console.error('See docs/UI_REFERENCE.md.');
  process.exit(1);
}

const pages = readdirSync(DIR).filter((f) => f.endsWith('.html'));
if (pages.length === 0) {
  console.error(`${DIR}/ holds no .html pages.`);
  process.exit(1);
}

const have = existingPaths();
const seen = new Map();
for (const page of pages) {
  for (const icon of iconsIn(readFileSync(join(DIR, page), 'utf8'))) {
    const key = icon.paths.map((p) => p['d']).join('|');
    // The same glyph appears on many pages; the first labelled sighting wins.
    if (!seen.has(key) || (!seen.get(key).label && icon.label)) seen.set(key, { ...icon, key, page });
  }
}

const already = [];
const named = [];
const unnamed = [];
for (const icon of seen.values()) {
  const existing = icon.paths.map((p) => have.get(p['d'])).find(Boolean);
  if (existing) already.push({ ...icon, existing });
  else if (LABELS[icon.label] && !NEVER.has(LABELS[icon.label])) named.push({ ...icon, name: LABELS[icon.label] });
  else unnamed.push(icon);
}

console.log(`// Read from ${pages.length} saved pages in ${DIR}/`);
console.log(`// ${seen.size} distinct glyphs: ${already.length} already ours, ${named.length} named, ${unnamed.length} to name by hand.\n`);

// One the reference label can sit on two different glyphs — "Instance" is both the diamond and a corner-bracket
// mark — so a name claimed twice is reported rather than silently emitted twice.
const claims = new Map();
for (const icon of named) claims.set(icon.name, (claims.get(icon.name) ?? 0) + 1);
const contested = [...claims].filter(([, n]) => n > 1).map(([name]) => name);

if (named.length > 0) {
  console.log('// ---- named, ready to paste ----');
  for (const icon of named.sort((a, b) => a.name.localeCompare(b.name))) {
    if (contested.includes(icon.name)) continue;
    console.log(toTsx(icon.name, icon));
  }
  console.log();
}
if (contested.length > 0) {
  console.log('// ---- one name, several glyphs: pick by eye ----');
  for (const name of contested) {
    for (const icon of named.filter((i) => i.name === name)) {
      console.log(`  // "${icon.label}" · ${icon.grid}px · ${icon.page}`);
      console.log(`  //${toTsx(name, icon).trimEnd()}`);
    }
  }
  console.log();
}
if (unnamed.length > 0) {
  console.log('// ---- unnamed: give each a name, or drop it ----');
  for (const icon of unnamed.sort((a, b) => (a.label || '~').localeCompare(b.label || '~'))) {
    console.log(`  // ${icon.label ? `The reference calls this "${icon.label}"` : 'no label'} · ${icon.grid}px · ${icon.page}`);
    console.log(`  //${toTsx('TODO', icon).trimEnd()}`);
  }
  console.log();
}
console.log('// ---- already ours, left alone ----');
const byName = already.map((i) => `${i.existing}${i.label ? ` (The reference: ${i.label})` : ''}`).sort();
console.log(byName.map((n) => `// ${n}`).join('\n'));
