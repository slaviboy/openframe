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

import type { DocumentStore } from '../document/store';

/** Font families used by text layers in the file (including mixed-style runs), sorted by name. */
export function usedFontFamilies(store: DocumentStore): string[] {
  const families = new Set<string>();
  for (const node of store.nodes()) {
    if (node.type !== 'TEXT') continue;
    families.add(node.fontName.family);
    for (const run of node.styleRuns ?? []) if (run.style.fontName) families.add(run.style.fontName.family);
  }
  return [...families].sort((a, b) => a.localeCompare(b));
}
