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

/**
 * Batch rename (⌘R). `replace` may contain:
 * - `$&` the matched text (with an empty `match`, the whole current name)
 * - `$1`, `$2`, … capture groups; `` $` `` and `$'` the text before / after the match
 * - `$n` / `$nnn` an ascending counter (plain / three digits) starting at `start`
 * - `$N` / `$NNN` a descending counter that ends at `start` on the last layer
 *
 * `match` is a regular expression; every occurrence is replaced. Empty `match` replaces the
 * whole name.
 */
export interface RenameSpec {
  readonly match: string;
  readonly replace: string;
  readonly start: number;
}

export interface RenameResult {
  readonly names: string[];
  /** Set when `match` is not a valid regular expression (names are then unchanged). */
  readonly error: string | null;
}

export const MAX_LAYER_NAME = 10_000;

export function batchRename(names: readonly string[], spec: RenameSpec): RenameResult {
  let pattern: RegExp;
  try {
    pattern = spec.match === '' ? /^[\s\S]*$/ : new RegExp(spec.match, 'g');
  } catch (error) {
    return { names: [...names], error: error instanceof Error ? error.message : 'Invalid expression' };
  }
  const count = names.length;
  const out = names.map((name, i) => {
    const up = spec.start + i;
    const down = spec.start + (count - 1 - i);
    const replacement = spec.replace.replace(/\$(nnn|NNN|n|N)/g, (_, token: string) => {
      const value = token.toLowerCase() === token ? up : down;
      return token.length === 3 ? String(value).padStart(3, '0') : String(value);
    });
    pattern.lastIndex = 0;
    return name.replace(pattern, replacement).slice(0, MAX_LAYER_NAME);
  });
  return { names: out, error: null };
}
