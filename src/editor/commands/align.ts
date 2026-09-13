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

import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { captureStart, translateNodes } from '../interactions/transform';
import { selectedSceneNodes } from './selection-helpers';

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

const LABELS: Record<AlignEdge, string> = {
  left: 'Align left',
  hcenter: 'Align horizontal centers',
  right: 'Align right',
  top: 'Align top',
  vcenter: 'Align vertical centers',
  bottom: 'Align bottom',
};

function alignDelta(bounds: Rect, reference: Rect, edge: AlignEdge): Vec2 {
  switch (edge) {
    case 'left':
      return { x: reference.x - bounds.x, y: 0 };
    case 'hcenter':
      return { x: reference.x + reference.width / 2 - (bounds.x + bounds.width / 2), y: 0 };
    case 'right':
      return { x: reference.x + reference.width - (bounds.x + bounds.width), y: 0 };
    case 'top':
      return { x: 0, y: reference.y - bounds.y };
    case 'vcenter':
      return { x: 0, y: reference.y + reference.height / 2 - (bounds.y + bounds.height / 2) };
    case 'bottom':
      return { x: 0, y: reference.y + reference.height - (bounds.y + bounds.height) };
  }
}

const unlockedSelection = (editor: Editor): Id[] => selectedSceneNodes(editor).filter((id) => !(editor.doc.get(id) as SceneNode).locked);

/** World bounds of a layer's parent frame or group, or null for layers directly on the page. */
function parentBounds(editor: Editor, id: Id): Rect | null {
  const parent = editor.doc.parentOf(id);
  const type = parent ? editor.doc.get(parent)?.type : undefined;
  return parent && (type === 'FRAME' || type === 'GROUP' || type === 'SECTION') ? editor.scene.worldBounds(parent) : null;
}

/**
 * Aligns selected layers (⌥A/⌥H/⌥D/⌥W/⌥V/⌥S). Several layers align to their combined bounds;
 * a single layer aligns to its parent frame. `eachToParent` (⇧ + shortcut) aligns every
 * layer to its own parent. Locked layers are not moved.
 */
export function alignSelection(editor: Editor, edge: AlignEdge, eachToParent = false): void {
  const ids = unlockedSelection(editor);
  if (ids.length === 0) return;
  editor.scene.ensure(editor.pageId);
  const toParent = eachToParent || ids.length === 1;
  const selectionReference = toParent ? null : editor.selectionBounds(ids);
  editor.history.run(eachToParent ? `${LABELS[edge]} to parent` : LABELS[edge], (tx) => {
    for (const id of ids) {
      const reference = toParent ? parentBounds(editor, id) : selectionReference;
      const bounds = editor.scene.worldBounds(id);
      if (!reference || !bounds) continue;
      const delta = alignDelta(bounds, reference, edge);
      if (Math.abs(delta.x) < 1e-9 && Math.abs(delta.y) < 1e-9) continue;
      translateNodes(tx, [captureStart(tx, editor.scene, id)], delta);
    }
  });
}

/**
 * Distributes horizontal or vertical spacing (⌃⌥H / ⌃⌥V): the outermost layers stay in
 * place and the gaps between neighbors become equal. Needs at least three layers.
 */
export function distributeSelection(editor: Editor, axis: 'horizontal' | 'vertical'): void {
  const ids = unlockedSelection(editor);
  if (ids.length < 3) return;
  editor.scene.ensure(editor.pageId);
  const horizontal = axis === 'horizontal';
  const items = ids
    .map((id) => ({ id, bounds: editor.scene.worldBounds(id)! }))
    .filter((item) => item.bounds !== null)
    .sort((a, b) => (horizontal ? a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y : a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x));
  const start = (r: Rect) => (horizontal ? r.x : r.y);
  const size = (r: Rect) => (horizontal ? r.width : r.height);
  const first = items[0]!;
  const last = items.at(-1)!;
  const span = start(last.bounds) + size(last.bounds) - start(first.bounds);
  const gap = (span - items.reduce((sum, item) => sum + size(item.bounds), 0)) / (items.length - 1);
  editor.history.run(horizontal ? 'Distribute horizontal spacing' : 'Distribute vertical spacing', (tx) => {
    let cursor = start(first.bounds) + size(first.bounds) + gap;
    for (let i = 1; i < items.length - 1; i++) {
      const item = items[i]!;
      const shift = cursor - start(item.bounds);
      if (Math.abs(shift) > 1e-9) {
        translateNodes(tx, [captureStart(tx, editor.scene, item.id)], horizontal ? { x: shift, y: 0 } : { x: 0, y: shift });
      }
      cursor += size(item.bounds) + gap;
    }
  });
}
