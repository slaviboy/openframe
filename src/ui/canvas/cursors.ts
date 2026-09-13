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

/** CSS `cursor` value for a tool cursor kind. */
export function cursorCss(kind: CursorKind): string {
  switch (kind) {
    case 'rotate-nw':
    case 'rotate-ne':
    case 'rotate-se':
    case 'rotate-sw':
      return ROTATE[kind];
    default:
      return kind;
  }
}
