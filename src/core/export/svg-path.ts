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

import type { PathCommand } from '../geometry/corners';

/** A number in SVG markup: at most 3 decimals, without trailing zeros or a negative zero. */
export function svgNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** SVG path data for path commands: absolute moves, lines, cubic curves and closes. */
export function svgPathData(commands: readonly PathCommand[]): string {
  return commands
    .map((command) => {
      switch (command.op) {
        case 'M':
        case 'L':
          return `${command.op}${svgNumber(command.x)} ${svgNumber(command.y)}`;
        case 'C':
          return `C${svgNumber(command.x1)} ${svgNumber(command.y1)} ${svgNumber(command.x2)} ${svgNumber(command.y2)} ${svgNumber(command.x)} ${svgNumber(command.y)}`;
        case 'Z':
          return 'Z';
      }
    })
    .join('');
}

const ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/**
 * Text for SVG element content and attribute values: markup characters escaped, and control characters XML doesn't
 * allow (all but tab, line feed and carriage return) removed.
 */
export function escapeXml(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 && char !== '\t' && char !== '\n' && char !== '\r') continue;
    out += ENTITIES[char] ?? char;
  }
  return out;
}
