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

import { cornerBisector, maxCornerRadius, resolveCornerRadii } from '@/core/geometry/corners';
import { polygonPoints, starPoints } from '@/core/geometry/shapes';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, multiply, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { isInteractive } from '@/core/scene/hit-test';
import type { CornerRadii, SceneNode } from '@/core/schema/document';
import { setCornerRadii, setCornerRadius } from '../commands/properties';
import type { Editor } from '../editor';

/** A rectangle corner, or `all` for the single handle of a polygon or star. */
export type RadiusCorner = keyof CornerRadii | 'all';

/** On-canvas corner radius handle of the selected rectangle, polygon or star (layer-local geometry). */
export interface RadiusHandle {
  readonly id: Id;
  readonly corner: RadiusCorner;
  readonly vertex: Vec2;
  /** Unit direction from the vertex into the shape along the corner's bisector. */
  readonly dir: Vec2;
  /** sin(θ/2) of the corner's interior angle: the arc center lies radius / sinHalf from the vertex. */
  readonly sinHalf: number;
  /** Largest radius the corner can show. */
  readonly max: number;
  /** Current (effective) radius. */
  readonly radius: number;
}

/** Closest a handle sits to its corner on screen, so it never overlaps the resize handle. */
export const RADIUS_HANDLE_INSET_PX = 12;
/** Layers smaller than this on screen show no radius handles, so small layers stay easy to move by their corners. */
export const RADIUS_HANDLES_MIN_SIZE_PX = 64;

const RECT_CORNERS: readonly (keyof CornerRadii)[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

function localToScreen(editor: Editor, id: Id): Matrix {
  const v = editor.state.viewport;
  return multiply({ a: v.zoom, b: 0, c: 0, d: v.zoom, e: -v.x * v.zoom, f: -v.y * v.zoom }, editor.scene.worldTransform(id));
}

/** The node whose corner radius can be dragged on canvas: a single, unlocked rectangle, polygon or star. */
export function radiusTarget(editor: Editor): Extract<SceneNode, { type: 'RECTANGLE' | 'POLYGON' | 'STAR' }> | null {
  if (editor.selection.length !== 1) return null;
  const node = editor.doc.get(editor.selection[0]!);
  if (!node || (node.type !== 'RECTANGLE' && node.type !== 'POLYGON' && node.type !== 'STAR')) return null;
  if (!isInteractive(editor.doc, node.id)) return null;
  editor.scene.ensure(editor.pageId);
  const m = localToScreen(editor, node.id);
  const scale = Math.hypot(m.a, m.b);
  if (Math.min(node.size.width, node.size.height) * scale < RADIUS_HANDLES_MIN_SIZE_PX) return null;
  return node;
}

/** Radius handles of the selection: one per rectangle corner, or one at the top vertex of a polygon or star. */
export function radiusHandles(editor: Editor): RadiusHandle[] {
  const node = radiusTarget(editor);
  if (!node) return [];
  const { width: w, height: h } = node.size;
  if (node.type === 'RECTANGLE') {
    const radii = resolveCornerRadii(node);
    const pts = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    return RECT_CORNERS.map((corner, i) => {
      const prev = pts[(i + 3) % 4]!;
      const vertex = pts[i]!;
      const next = pts[(i + 1) % 4]!;
      const bisector = cornerBisector(prev, vertex, next)!;
      const max = maxCornerRadius(prev, vertex, next);
      return { id: node.id, corner, vertex, dir: bisector.dir, sinHalf: bisector.sinHalf, max, radius: Math.min(radii[corner], max) };
    });
  }
  const pts = node.type === 'POLYGON' ? polygonPoints(w, h, node.pointCount) : starPoints(w, h, node.pointCount, node.innerRadius);
  const prev = pts[pts.length - 1]!;
  const bisector = cornerBisector(prev, pts[0]!, pts[1]!);
  if (!bisector) return [];
  const max = maxCornerRadius(prev, pts[0]!, pts[1]!);
  return [{ id: node.id, corner: 'all', vertex: pts[0]!, dir: bisector.dir, sinHalf: bisector.sinHalf, max, radius: Math.min(node.cornerRadius ?? 0, max) }];
}

/** Screen position of a handle: at the corner's arc center, but at least `RADIUS_HANDLE_INSET_PX` in from the corner. */
export function radiusHandleScreen(editor: Editor, handle: RadiusHandle): Vec2 {
  const m = localToScreen(editor, handle.id);
  const scale = Math.hypot(m.a, m.b) || 1;
  const distance = Math.max(handle.radius / handle.sinHalf, RADIUS_HANDLE_INSET_PX / scale);
  return apply(m, { x: handle.vertex.x + handle.dir.x * distance, y: handle.vertex.y + handle.dir.y * distance });
}

/** The radius handle under a screen point, if any. */
export function hitRadiusHandle(editor: Editor, screen: Vec2, tolerancePx: number): RadiusHandle | null {
  for (const handle of radiusHandles(editor)) {
    const p = radiusHandleScreen(editor, handle);
    if (Math.hypot(p.x - screen.x, p.y - screen.y) <= tolerancePx) return handle;
  }
  return null;
}

/** Radius after dragging a handle from `downLocal` to `local` (layer-local points): movement along the bisector. */
export function draggedRadius(handle: RadiusHandle, downLocal: Vec2, local: Vec2): number {
  const along = (local.x - downLocal.x) * handle.dir.x + (local.y - downLocal.y) * handle.dir.y;
  return Math.round(Math.min(handle.max, Math.max(0, handle.radius + along * handle.sinHalf)));
}

/**
 * Applies a dragged radius: to every corner, or with `single` (⌥, rectangles only) to the dragged
 * corner, keeping the others as they were when the drag started (`startRadii`).
 */
export function applyDraggedRadius(tx: Transaction, handle: RadiusHandle, radius: number, single: boolean, startRadii: CornerRadii | null): void {
  const node = tx.store.getOrThrow(handle.id) as SceneNode;
  if (single && handle.corner !== 'all' && startRadii) setCornerRadii(tx, node, { ...startRadii, [handle.corner]: radius });
  else setCornerRadius(tx, node, radius);
}
