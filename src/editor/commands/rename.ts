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

import { batchRename, type RenameSpec } from '@/core/document/batch-rename';
import { sortByPaintOrder } from '@/core/document/order';
import type { Id } from '@/core/ids/ids';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';

/** Selected layers in layers-panel order (topmost first); counters number them in this order. */
export function renameTargets(editor: Editor): Id[] {
  return sortByPaintOrder(editor.doc, selectedSceneNodes(editor)).reverse();
}

export interface RenamePreview {
  readonly ids: readonly Id[];
  readonly from: readonly string[];
  /** New names; an empty result keeps the layer's current name. */
  readonly to: readonly string[];
  readonly error: string | null;
}

export function previewRename(editor: Editor, spec: RenameSpec): RenamePreview {
  const ids = renameTargets(editor);
  const from = ids.map((id) => editor.doc.get(id)?.name ?? '');
  const result = batchRename(from, spec);
  return { ids, from, to: result.names.map((name, i) => (name === '' ? from[i]! : name)), error: result.error };
}

import { renameLayer } from '@/core/text/text-resize';

/** Renames the selected layers in one undo step. Returns how many names changed. */
export function applyRename(editor: Editor, spec: RenameSpec): number {
  const preview = previewRename(editor, spec);
  if (preview.error) return 0;
  const changes = preview.ids.map((id, i) => ({ id, name: preview.to[i]! })).filter((c, i) => c.name !== preview.from[i]);
  if (changes.length === 0) return 0;
  editor.history.run('Rename layers', (tx) => {
    for (const { id, name } of changes) if (tx.store.has(id)) renameLayer(tx, id, name);
  });
  return changes.length;
}
