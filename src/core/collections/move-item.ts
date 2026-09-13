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

/** A copy of `list` with the item at `from` moved to `to` (both clamped to the list). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (list.length === 0) return next;
  const source = Math.min(list.length - 1, Math.max(0, from));
  const target = Math.min(list.length - 1, Math.max(0, to));
  const [item] = next.splice(source, 1);
  next.splice(target, 0, item as T);
  return next;
}
