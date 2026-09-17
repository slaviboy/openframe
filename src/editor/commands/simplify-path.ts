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
import { commandsToNetwork } from '@/core/vector/shape-networks';
import { simplifyNetworkCommands } from '@/core/vector/simplify';
import { networkBounds, transformNetwork, type VectorNetwork } from '@/core/vector/vector-network';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';

/** How a layer was drawn before any simplify preview, so the slider always thins the original path. */
const originals = new WeakMap<Transaction, Map<Id, { readonly network: VectorNetwork; readonly transform: Transform; readonly width: number; readonly height: number }>>();

/** The unlocked vector layers of the selection, which are the only layers with a path to simplify. */
function simplifiable(editor: Editor): Id[] {
  return selectedSceneNodes(editor).filter((id) => {
    const node = editor.doc.get(id);
    return node?.type === 'VECTOR' && !node.locked && node.vectorNetwork.segments.length > 0;
  });
}

/** Simplify vector is available when a selected, unlocked vector layer has a path to thin. */
export const canSimplifyPath = (editor: Editor): boolean => simplifiable(editor).length > 0;

/** How many points the selected vector layers are drawn with, which is what the slider brings down. */
export const selectedPointCount = (editor: Editor): number => simplifiable(editor).reduce((total, id) => total + (editor.doc.get(id) as VectorNode).vectorNetwork.vertices.length, 0);

/**
 * Simplifies the selected vector layers inside an open transaction: `amount` runs from 0, which changes nothing,
 * to 1, which keeps only the turns that carry the shape. Every call starts from the paths as they were when the
 * transaction began, so the slider can be dragged back and forth.
 */
export function simplifyPathInTx(tx: Transaction, editor: Editor, amount: number): void {
  let before = originals.get(tx);
  if (!before) {
    before = new Map();
    originals.set(tx, before);
  }
  const layers = before.size > 0 ? [...before.keys()] : simplifiable(editor);
  for (const id of layers) {
    const node = tx.store.get(id) as VectorNode | undefined;
    if (!node) continue;
    const was = before.get(id) ?? { network: node.vectorNetwork, transform: node.transform, width: node.size.width, height: node.size.height };
    before.set(id, was);
    const commands = simplifyNetworkCommands(was.network, amount);
    const network = commands ? commandsToNetwork(commands) : null;
    const bounds = network ? networkBounds(network) : null;
    // A path nothing could be taken from — or one thinned away to nothing — is left as it was drawn.
    if (!network || !bounds || bounds.width < 0 || bounds.height < 0) {
      tx.set(id, 'vectorNetwork', was.network);
      tx.set(id, 'transform', was.transform);
      tx.set(id, 'size', { width: was.width, height: was.height });
      continue;
    }
    const shift = applyLinear(matrixOf(was.transform), { x: bounds.x, y: bounds.y });
    tx.set(id, 'vectorNetwork', transformNetwork(network, { x: bounds.x, y: bounds.y }, 1, 1));
    tx.set(id, 'size', { width: bounds.width, height: bounds.height });
    tx.set(id, 'transform', [was.transform[0], was.transform[1], was.transform[2], was.transform[3], was.transform[4] + shift.x, was.transform[5] + shift.y] satisfies Transform);
  }
}

/** Simplify vector: thins the selected vector layers' paths, in one undo step. */
export function simplifyPathSelection(editor: Editor, amount: number): boolean {
  if (!canSimplifyPath(editor)) return false;
  editor.history.run('Simplify vector', (tx) => simplifyPathInTx(tx, editor, amount));
  return true;
}
