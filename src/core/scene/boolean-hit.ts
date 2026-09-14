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
import { apply, invert } from '../math/matrix';
import type { Vec2 } from '../math/vec';
import { isSceneNode, type SceneNode } from '../schema/document';
import { matrixOf, nodeContainsLocal } from './scene-index';

/**
 * Whether a point in a layer's local space is inside its shape. Groups contain a point any visible
 * child contains; boolean groups combine their visible children by their operation — union (any),
 * intersect (all), subtract (the bottom child but none above it) or exclude (an odd number).
 */
export function shapeContainsLocal(store: DocumentStore, node: SceneNode, p: Vec2, tolerance: number): boolean {
  if (node.type !== 'BOOLEAN_OPERATION' && node.type !== 'GROUP') return nodeContainsLocal(node, p, tolerance);
  const hits: boolean[] = [];
  for (const childId of store.children(node.id)) {
    const child = store.get(childId);
    if (!child || !isSceneNode(child) || !child.visible) continue;
    const inverse = invert(matrixOf(child.transform));
    hits.push(inverse !== null && shapeContainsLocal(store, child, apply(inverse, p), tolerance));
  }
  if (hits.length === 0) return false;
  if (node.type === 'GROUP') return hits.some(Boolean);
  switch (node.booleanOperation) {
    case 'UNION':
      return hits.some(Boolean);
    case 'INTERSECT':
      return hits.every(Boolean);
    case 'SUBTRACT':
      return hits[0]! && !hits.slice(1).some(Boolean);
    case 'EXCLUDE':
      return hits.filter(Boolean).length % 2 === 1;
  }
}
