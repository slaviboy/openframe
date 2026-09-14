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
import { nodeContainsLocal } from '@/core/scene/scene-index';
import { edgeValues, snapValue } from '@/core/scene/snapping';
import type { NodeType } from '@/core/schema/document';
import type { Editor } from '../editor';
import { SNAP_THRESHOLD_PX } from '../interactions/snap-candidates';
import { positionStep } from '../interactions/transform';
import { acceptsLayers } from '@/core/document/instances';

/**
 * Deepest visible, unlocked container of the given types containing the world point (or the
 * page). New layers are created there; new sections pass `['SECTION']`. Inside an instance only
 * a slot takes new layers.
 */
export function containerAt(editor: Editor, world: Vec2, types: readonly NodeType[] = ['FRAME', 'SECTION']): Id {
  const store = editor.doc;
  let result: Id = editor.pageId;
  const visit = (id: Id) => {
    const children = store.children(id);
    for (let i = children.length - 1; i >= 0; i--) {
      const child = store.get(children[i]!);
      if (!child || (child.type !== 'FRAME' && child.type !== 'SECTION') || !types.includes(child.type) || !child.visible || child.locked) continue;
      const local = editor.scene.toLocal(child.id, world);
      if (local && nodeContainsLocal(child, local, 0)) {
        // Instances are searched for slots, but only containers that take layers are used.
        if (acceptsLayers(store, child.id)) result = child.id;
        visit(child.id);
        return;
      }
    }
  };
  visit(editor.pageId);
  return result;
}

/** "<base> N" with N one more than the highest existing number on the page. */
export function nextLayerName(editor: Editor, base: string): string {
  const pattern = new RegExp(`^${base} (\\d+)$`);
  let max = 0;
  for (const id of editor.doc.descendants(editor.pageId, false)) {
    const match = pattern.exec(editor.doc.get(id)?.name ?? '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${base} ${max + 1}`;
}

/** Snaps a world point to candidate edges and centers; reports which axes snapped. Control disables snapping. */
export function snapWorldPoint(editor: Editor, world: Vec2, candidates: readonly Rect[], ctrl: boolean): { point: Vec2; x: boolean; y: boolean } {
  if (ctrl || candidates.length === 0) return { point: world, x: false, y: false };
  const threshold = SNAP_THRESHOLD_PX / editor.state.viewport.zoom;
  const dx = snapValue(world.x, edgeValues(candidates, 'x'), threshold);
  const dy = snapValue(world.y, edgeValues(candidates, 'y'), threshold);
  return { point: { x: world.x + (dx ?? 0), y: world.y + (dy ?? 0) }, x: dx !== null, y: dy !== null };
}

/** Rounds a drawing point to whole pixels, or to 0.01 when "Snap to pixel grid" is off. */
export const roundPoint = (p: Vec2): Vec2 => {
  const step = positionStep();
  return { x: Math.round(Math.round(p.x / step) * step * 100) / 100, y: Math.round(Math.round(p.y / step) * step * 100) / 100 };
};

/** Converts world points into a parent's local space (identity for the page). */
export function parentToLocal(editor: Editor, parent: Id): (world: Vec2) => Vec2 {
  if (parent === editor.pageId) return (w) => w;
  const m = editor.scene.computeWorld(parent);
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return (w) => w;
  return (w) => {
    const x = w.x - m.e;
    const y = w.y - m.f;
    return { x: (m.d * x - m.c * y) / det, y: (-m.b * x + m.a * y) / det };
  };
}

/** Parent-relative transform for a line starting at `origin` pointing along `angle` (radians, y down). */
export function lineTransform(origin: Vec2, angle: number): [number, number, number, number, number, number] {
  // Snap float noise at multiples of 90° and never store -0 (it would not round-trip as a distinct value).
  const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v) + 0;
  const cos = clean(Math.cos(angle));
  const sin = clean(Math.sin(angle));
  return [cos, sin, clean(-sin), cos, origin.x + 0, origin.y + 0];
}

/** Constrains the vector from `from` to `to` to 45° increments (Shift while drawing lines). */
export function constrain45(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const len = dx * Math.cos(angle) + dy * Math.sin(angle);
  return { x: from.x + Math.max(0, len) * Math.cos(angle), y: from.y + Math.max(0, len) * Math.sin(angle) };
}
