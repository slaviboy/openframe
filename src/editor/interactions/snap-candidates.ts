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
import { gridLines, layoutGuideBands } from '@/core/layout/layout-guides';
import { apply } from '@/core/math/matrix';
import { intersects, type Rect } from '@/core/math/rect';
import { isSceneNode, type FrameNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { visibleWorldRect } from '../viewport/viewport';

/** Snap distance in screen pixels (a snap happens when strictly closer than this). */
export const SNAP_THRESHOLD_PX = 5;

/** Candidates that are layout guide columns, rows or grid lines rather than layers. */
const layoutGuideRects = new WeakSet<Rect>();

/** Whether a snap candidate is a layout guide (these are snapped to, but never measured for equal gaps). */
export const isLayoutGuideRect = (rect: Rect): boolean => layoutGuideRects.has(rect);

/**
 * World rects of a frame's layout guides: each column or row, and each uniform grid line as a
 * zero-thickness rect. Hidden guides still count; rotated or flipped frames have none.
 */
function layoutGuideCandidates(editor: Editor, frame: FrameNode): Rect[] {
  const m = editor.scene.worldTransform(frame.id);
  if (!frame.layoutGuides || Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9 || m.a <= 0 || m.d <= 0) return [];
  const origin = apply(m, { x: 0, y: 0 });
  const width = frame.size.width * m.a;
  const height = frame.size.height * m.d;
  const rects: Rect[] = [];
  for (const guide of frame.layoutGuides) {
    if (guide.pattern === 'GRID') {
      for (const x of gridLines(guide, frame.size.width)) rects.push({ x: origin.x + x * m.a, y: origin.y, width: 0, height });
      for (const y of gridLines(guide, frame.size.height)) rects.push({ x: origin.x, y: origin.y + y * m.d, width, height: 0 });
    } else {
      for (const band of layoutGuideBands(guide, frame.size)) {
        rects.push(
          guide.pattern === 'COLUMNS'
            ? { x: origin.x + band.start * m.a, y: origin.y, width: band.length * m.a, height }
            : { x: origin.x, y: origin.y + band.start * m.d, width, height: band.length * m.d },
        );
      }
    }
  }
  for (const rect of rects) layoutGuideRects.add(rect);
  return rects;
}

/**
 * World bounds to snap against: visible children of the given parents that are in view,
 * plus each parent itself when it is a frame, and the frame's layout guides. `skip` excludes
 * layers (e.g. those being moved). Requires the scene index to be up to date for the active page.
 */
export function snapCandidatesIn(editor: Editor, parents: Iterable<Id>, skip: (id: Id) => boolean = () => false): Rect[] {
  const store = editor.doc;
  const view = visibleWorldRect(editor.state.viewport, editor.canvasSize.width, editor.canvasSize.height);
  const rects: Rect[] = [];
  for (const parent of parents) {
    const parentNode = store.get(parent);
    if (parentNode?.type === 'FRAME' || parentNode?.type === 'SECTION') {
      const frameBounds = editor.scene.worldBounds(parent);
      if (frameBounds) rects.push(frameBounds);
    }
    if (parentNode?.type === 'FRAME') rects.push(...layoutGuideCandidates(editor, parentNode));
    for (const id of store.children(parent)) {
      if (skip(id)) continue;
      const node = store.get(id);
      if (!node || !isSceneNode(node) || !node.visible) continue;
      const bounds = editor.scene.worldBounds(id);
      if (bounds && intersects(bounds, view)) rects.push(bounds);
    }
  }
  return rects;
}

/** Snap targets for layers being moved or resized: their siblings and parent frames, excluding the layers and their contents. */
export function snapCandidatesFor(editor: Editor, layers: readonly Id[]): Rect[] {
  const store = editor.doc;
  const layerSet = new Set(layers);
  const parents = new Set(layers.map((id) => store.parentOf(id)).filter((id): id is Id => id !== null));
  return snapCandidatesIn(editor, parents, (id) => layerSet.has(id) || layers.some((layer) => store.isAncestor(layer, id)));
}
