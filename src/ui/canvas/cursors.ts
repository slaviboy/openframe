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

import type { CursorKind } from '@/editor/tools/types';

/**
 * Custom canvas cursors (own artwork) as inline SVG data URIs, so they work offline and
 * under the CSP (`img-src data:`). The rotate cursor is a curved double arrow drawn with a
 * white outline for contrast on any canvas color; rotated per corner.
 */
function rotateSvg(degrees: number): string {
  const arc = 'M7 15a8 8 0 0 1 8-8';
  const heads = 'M4.5 12.5 7 16l3-2.6M12.5 4.5 16 7l-2.6 3';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g transform='rotate(${degrees} 12 12)' fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='${arc}' stroke='white' stroke-width='4'/><path d='${heads}' stroke='white' stroke-width='3.5'/>` +
    `<path d='${arc}' stroke='black' stroke-width='1.5'/><path d='${heads}' stroke='black' stroke-width='1.5'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
}

const ROTATE: Record<'rotate-nw' | 'rotate-ne' | 'rotate-se' | 'rotate-sw', string> = {
  'rotate-nw': rotateSvg(0),
  'rotate-ne': rotateSvg(90),
  'rotate-se': rotateSvg(180),
  'rotate-sw': rotateSvg(270),
};

/**
 * The Paint tool's droplet, its tip at the point it would paint: filled in where a click adds the paint, hollow
 * where it would take a region's fill away again. Drawn with a white outline, as the rotate cursor is.
 */
function dropletSvg(filled: boolean): string {
  const drop = 'M6 2c0 0 5 5.2 5 8.4A5 5 0 0 1 1 10.4C1 7.2 6 2 6 2Z';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g transform='translate(0 1)' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='${drop}' fill='none' stroke='white' stroke-width='4'/>` +
    `<path d='${drop}' fill='${filled ? 'black' : 'white'}' stroke='black' stroke-width='1.5'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 6 3, crosshair`;
}

const DROPLET: Record<'droplet' | 'droplet-empty', string> = {
  droplet: dropletSvg(true),
  'droplet-empty': dropletSvg(false),
};

/**
 * The eyedropper, from the reference's own artwork — the same path the toolbar's Copy colors button
 * draws. The reference's cursor is a 32px image whose hotspot is the dropper's tip at `8 24`; the glyph
 * is drawn on a 24 grid, so translating it by 4 puts its tip exactly there. The white outline behind it
 * is ours, so the cursor stays visible on a dark canvas — the same treatment as the rotate and droplet
 * cursors. Recorded in docs/UI_REFERENCE.md.
 */
function eyedropperSvg(): string {
  const glyph =
    'M16.922 3.56a2.501 2.501 0 0 1 3.517 3.517l-.172.19-2.206 2.205a.33.33 0 0 0 0 .466h.001c.548.549.582 1.418.103 2.007l-.104.115a1.5 1.5 0 0 1-2.12 0l-.233-.233-6.94 6.94a2.5 2.5 0 0 1-2.12.705L5.56 20.56a1.5 1.5 0 0 1-2.12-2.121l1.086-1.09a2.5 2.5 0 0 1 .706-2.118l6.94-6.939-.232-.232a1.5 1.5 0 0 1 0-2.122l.114-.103a1.5 1.5 0 0 1 1.893 0l.114.103.052.042c.127.084.3.07.411-.042l2.208-2.207z';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>` +
    `<g transform='translate(4 4)' stroke-linejoin='round'>` +
    `<path d='${glyph}' fill='white' stroke='white' stroke-width='2.5'/>` +
    `<path d='${glyph}' fill='black'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 24, crosshair`;
}

const EYEDROPPER = eyedropperSvg();

/** CSS `cursor` value for a tool cursor kind. */
export function cursorCss(kind: CursorKind): string {
  switch (kind) {
    case 'rotate-nw':
    case 'rotate-ne':
    case 'rotate-se':
    case 'rotate-sw':
      return ROTATE[kind];
    case 'droplet':
    case 'droplet-empty':
      return DROPLET[kind];
    case 'eyedropper':
      return EYEDROPPER;
    default:
      return kind;
  }
}
