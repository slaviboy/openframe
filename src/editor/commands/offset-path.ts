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
import { applyLinear } from '@/core/math/matrix';
import { matrixOf } from '@/core/scene/scene-index';
import type { Transform, VectorNode } from '@/core/schema/document';
import type { OffsetJoin } from '@/core/vector/geometry-service';
import { commandsToNetwork } from '@/core/vector/shape-networks';
import { networkBounds, transformNetwork, type VectorNetwork } from '@/core/vector/vector-network';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';

/** How an offset path is set up, which the dialog holds and the preview is drawn from. */
export interface OffsetSettings {
  readonly amount: number;
  readonly join: OffsetJoin;
}

export const DEFAULT_OFFSET: OffsetSettings = { amount: 10, join: 'ROUND' };

/** The network a layer was drawn with before any offset preview, so a preview never offsets an offset. */
const originals = new WeakMap<Transaction, Map<Id, { readonly network: VectorNetwork; readonly transform: Transform; readonly width: number; readonly height: number }>>();

/** The unlocked vector layers of the selection, which are the only layers an offset can be taken of. */
function offsettable(editor: Editor): Id[] {
  return selectedSceneNodes(editor).filter((id) => {
    const node = editor.doc.get(id);
    return node?.type === 'VECTOR' && !node.locked && node.vectorNetwork.regions.length > 0;
  });
}

/** Offset path is available once the engine is loaded and a selected vector layer encloses an area to grow. */
export const canOffsetPath = (editor: Editor): boolean => editor.geometry !== null && offsettable(editor).length > 0;

/**
 * Offsets the selected vector layers inside an open transaction, each layer's area grown by `amount` (or shrunk,
 * when it is negative) and its box refitted around the result. Every call starts from the layers as they were when
 * the transaction began, so a preview can be run again and again as the amount is dragged.
 */
export function offsetPathInTx(tx: Transaction, editor: Editor, settings: OffsetSettings): void {
  const geometry = editor.geometry;
  if (!geometry) return;
  let before = originals.get(tx);
  if (!before) {
    before = new Map();
    originals.set(tx, before);
  }
  // The layers are settled on the first run: a preview that shrank one away must still offset it on the next.
  const layers = before.size > 0 ? [...before.keys()] : offsettable(editor);
  for (const id of layers) {
    const node = tx.store.get(id) as VectorNode | undefined;
    if (!node) continue;
    const was = before.get(id) ?? { network: node.vectorNetwork, transform: node.transform, width: node.size.width, height: node.size.height };
    before.set(id, was);
    const commands = settings.amount === 0 ? null : geometry.offsetNetwork(was.network, settings.amount, settings.join);
    // Shrinking a shape away leaves nothing to draw, so the layer is left as it was rather than emptied.
    const network = commands && commands.length > 0 ? commandsToNetwork(commands) : null;
    const bounds = network ? networkBounds(network) : null;
    if (!network || !bounds || bounds.width <= 0 || bounds.height <= 0) {
      tx.set(id, 'vectorNetwork', was.network);
      tx.set(id, 'transform', was.transform);
      tx.set(id, 'size', { width: was.width, height: was.height });
      continue;
    }
    // The box grows in the layer's own space, so its corner moves along the layer's rotation.
    const shift = applyLinear(matrixOf(was.transform), { x: bounds.x, y: bounds.y });
    tx.set(id, 'vectorNetwork', transformNetwork(network, { x: bounds.x, y: bounds.y }, 1, 1));
    tx.set(id, 'size', { width: bounds.width, height: bounds.height });
    tx.set(id, 'transform', [was.transform[0], was.transform[1], was.transform[2], was.transform[3], was.transform[4] + shift.x, was.transform[5] + shift.y] satisfies Transform);
  }
}

/** Offset path: grows or shrinks the selected vector layers by `amount`, in one undo step. */
export function offsetPathSelection(editor: Editor, settings: OffsetSettings): boolean {
  if (!canOffsetPath(editor)) return false;
  editor.history.run('Offset path', (tx) => offsetPathInTx(tx, editor, settings));
  return true;
}
