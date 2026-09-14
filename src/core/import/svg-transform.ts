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

import { IDENTITY, multiply, rotation, scaling, translation, type Matrix } from '../math/matrix';

const FUNCTION = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/y;
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The numbers of a transform function's arguments (comma or space separated); null when one isn't a number. */
function numbers(text: string): number[] | null {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter((part) => part !== '');
  return parts.every((part) => NUMBER.test(part)) ? parts.map(Number) : null;
}

/** One transform function as a matrix; null for a wrong number of arguments. */
function transformFunction(name: string, args: readonly number[]): Matrix | null {
  switch (name) {
    case 'matrix':
      return args.length === 6 ? { a: args[0]!, b: args[1]!, c: args[2]!, d: args[3]!, e: args[4]!, f: args[5]! } : null;
    case 'translate':
      return args.length === 1 || args.length === 2 ? translation(args[0]!, args[1] ?? 0) : null;
    case 'scale':
      return args.length === 1 || args.length === 2 ? scaling(args[0]!, args[1] ?? args[0]!) : null;
    case 'rotate': {
      if (args.length === 1) return rotation(radians(args[0]!));
      if (args.length !== 3) return null;
      const [angle, cx, cy] = args as [number, number, number];
      return multiply(translation(cx, cy), multiply(rotation(radians(angle)), translation(-cx, -cy)));
    }
    case 'skewX':
      return args.length === 1 ? { a: 1, b: 0, c: Math.tan(radians(args[0]!)), d: 1, e: 0, f: 0 } : null;
    case 'skewY':
      return args.length === 1 ? { a: 1, b: Math.tan(radians(args[0]!)), c: 0, d: 1, e: 0, f: 0 } : null;
    default:
      return null;
  }
}

/**
 * An SVG `transform` attribute as one matrix: the functions apply right to left, as in SVG (the list's matrices
 * multiplied in order). An invalid list is ignored, as SVG renderers do, giving the identity.
 */
export function parseSvgTransform(text: string | undefined): Matrix {
  if (!text || text.trim() === '') return IDENTITY;
  let result = IDENTITY;
  FUNCTION.lastIndex = 0;
  let index = 0;
  while (index < text.length) {
    FUNCTION.lastIndex = index;
    const match = FUNCTION.exec(text);
    if (!match) return text.slice(index).trim() === '' ? result : IDENTITY;
    const args = numbers(match[2]!);
    const matrix = args && transformFunction(match[1]!, args);
    if (!matrix) return IDENTITY;
    result = multiply(result, matrix);
    index = FUNCTION.lastIndex;
  }
  return result;
}
