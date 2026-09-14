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

import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { applyScale, captureScale } from '../interactions/scale';
import type { ScaleAnchor } from '../stores/editor-store';
import { selectedSceneNodes } from './selection-helpers';

const ANCHOR_FRACTIONS: Record<ScaleAnchor, readonly [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  w: [0, 0.5],
  c: [0.5, 0.5],
  e: [1, 0.5],
  sw: [0, 1],
  s: [0.5, 1],
  se: [1, 1],
};

export const ANCHOR_LABELS: Record<ScaleAnchor, string> = {
  nw: 'top left',
  n: 'top',
  ne: 'top right',
  w: 'left',
  c: 'center',
  e: 'right',
  sw: 'bottom left',
  s: 'bottom',
  se: 'bottom right',
};

export const SCALE_ANCHORS: readonly ScaleAnchor[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];

/** The point of a rectangle that stays fixed when scaling from `anchor`. */
export function anchorPoint(rect: Rect, anchor: ScaleAnchor): Vec2 {
  const [fx, fy] = ANCHOR_FRACTIONS[anchor];
  return { x: rect.x + rect.width * fx, y: rect.y + rect.height * fy };
}

export const scaleTargets = (editor: Editor): Id[] => selectedSceneNodes(editor).filter((id) => !(editor.doc.get(id) as SceneNode).locked);

/** Scales layers (with their contents) proportionally inside an open transaction. */
export function scaleLayersInTx(tx: Transaction, editor: Editor, ids: readonly Id[], factor: number, anchor: ScaleAnchor): void {
  if (!(factor > 0) || !Number.isFinite(factor) || ids.length === 0) return;
  editor.scene.ensure(editor.pageId);
  const bounds = editor.selectionBounds(ids);
  if (!bounds) return;
  // Scaling already scales the contents; constraints would move them a second time.
  tx.ignoreConstraints = true;
  applyScale(tx, captureScale(tx.store, editor.scene, ids), factor, anchorPoint(bounds, anchor));
}

/** Scale (Scale tool panel): scales the selected unlocked layers by `factor` from the chosen anchor, in one undo step. */
export function scaleSelection(editor: Editor, factor: number, anchor: ScaleAnchor = editor.state.getSnapshot().scaleAnchor): void {
  const ids = scaleTargets(editor);
  if (ids.length === 0 || !(factor > 0) || !Number.isFinite(factor) || factor === 1) return;
  editor.history.run('Scale', (tx) => scaleLayersInTx(tx, editor, ids, factor, anchor));
}
