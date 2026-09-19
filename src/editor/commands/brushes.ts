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

import type { DocumentStore } from '@/core/document/store';
import { ROOT_ID } from '@/core/ids/ids';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { hasGeometry, isSceneNode, type BrushKind, type BrushNode, type SceneNode, type VectorNetworkData } from '@/core/schema/document';
import { isBrush as isBrushNode } from '@/core/vector/brush';
import type { Editor } from '../editor';

export { isBrush } from '@/core/vector/brush';
import { brushById, BUILTIN_BRUSHES } from '@/core/vector/brushes-builtin';

/** The file's own brushes, in the order they were made. */
export function localBrushes(store: DocumentStore): BrushNode[] {
  return store
    .children(ROOT_ID)
    .map((id) => store.get(id))
    .filter(isBrushNode);
}

/** Every brush a stroke can be painted with: the ones every file has, then the ones this file holds. */
export function availableBrushes(store: DocumentStore): BrushNode[] {
  return [...BUILTIN_BRUSHES, ...localBrushes(store)];
}

/** Whether every loop of a network is closed: only a closed shape can be a brush, as it is filled rather than stroked. */
function isClosed(network: VectorNetworkData): boolean {
  if (network.segments.length < 3) return false;
  const degree = new Map<number, number>();
  for (const segment of network.segments) {
    degree.set(segment.start, (degree.get(segment.start) ?? 0) + 1);
    degree.set(segment.end, (degree.get(segment.end) ?? 0) + 1);
  }
  return [...degree.values()].every((count) => count === 2);
}

/** The layer a brush can be made from: a single vector layer whose path is closed. */
export function brushSource(editor: Editor, id: Id): (SceneNode & { readonly vectorNetwork: VectorNetworkData }) | null {
  const node = editor.doc.get(id);
  if (!node || !isSceneNode(node) || node.type !== 'VECTOR') return null;
  return isClosed(node.vectorNetwork) ? node : null;
}

export const canCreateBrush = (editor: Editor, id: Id): boolean => brushSource(editor, id) !== null;

/**
 * Create brush: a closed vector layer becomes a brush that strokes can be painted with — stretched along a stroke, or
 * repeated along it. The layer itself is left as it is.
 */
export function createBrush(editor: Editor, id: Id, kind: BrushKind, name?: string): Id | null {
  const source = brushSource(editor, id);
  if (!source) return null;
  const brushId = editor.ids.next();
  editor.history.run('Create brush', (tx) => {
    tx.create({
      id: brushId,
      type: 'BRUSH',
      name: (name ?? source.name).trim() || 'Brush',
      parent: { id: ROOT_ID, key: `brush-${brushId}` },
      visible: true,
      locked: false,
      brushKind: kind,
      vectorNetwork: source.vectorNetwork,
      size: { width: source.size.width, height: source.size.height },
    });
  });
  return brushId;
}

/** Paints a layer's stroke with a brush, or with none. */
export function setLayerBrush(tx: Transaction, node: SceneNode, brushId: Id | undefined): void {
  if (!hasGeometry(node)) return;
  tx.set(node.id, 'brushId', brushId);
}

/** Applies a brush to layers, as one undo step. */
export function applyBrush(editor: Editor, ids: readonly Id[], brushId: Id | undefined): boolean {
  const layers = ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && isSceneNode(node) && hasGeometry(node));
  if (layers.length === 0 || (brushId !== undefined && brushById(editor.doc, brushId) === undefined)) return false;
  editor.history.run(brushId === undefined ? 'Remove brush' : 'Apply brush', (tx) => layers.forEach((node) => setLayerBrush(tx, node, brushId)));
  return true;
}
