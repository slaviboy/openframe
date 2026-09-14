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

import { arcSweep, ellipsePoint, isFullTurn, withinSweep, type Arc } from '@/core/geometry/arc';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, multiply, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { isInteractive } from '@/core/scene/hit-test';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { RADIUS_HANDLES_MIN_SIZE_PX } from './radius-handles';

type EllipseNode = Extract<SceneNode, { type: 'ELLIPSE' }>;

/** Sweep (how much of the ellipse is filled), start (where the arc begins) or ratio (the ring's inner radius). */
export type ArcHandleKind = 'sweep' | 'start' | 'ratio';

/** On-canvas arc handle of the selected ellipse. */
export interface ArcHandle {
  readonly id: Id;
  readonly kind: ArcHandleKind;
  /** Layer-local position. */
  readonly local: Vec2;
}

/** What a drag of an arc handle has made so far: the arc, and the pointer's angle at the last update. */
export interface ArcDragState {
  readonly arc: Arc;
  readonly lastAngle: number;
}

export const ARC_GESTURE_LABELS: Record<ArcHandleKind, string> = { sweep: 'Change arc sweep', start: 'Change arc start', ratio: 'Change arc ratio' };

/** Distance the sweep and start handles sit inside the outline on screen, clear of the resize handles. */
export const ARC_HANDLE_INSET_PX = 12;

const TAU = Math.PI * 2;
const FULL: Arc = { startingAngle: 0, endingAngle: TAU, innerRadius: 0 };

const wrapAngle = (a: number): number => a - TAU * Math.round(a / TAU);

function localToScreen(editor: Editor, id: Id): Matrix {
  const v = editor.state.viewport;
  return multiply({ a: v.zoom, b: 0, c: 0, d: v.zoom, e: -v.x * v.zoom, f: -v.y * v.zoom }, editor.scene.worldTransform(id));
}

/** An ellipse's arc; a plain ellipse is a full clockwise turn from its right-hand point. */
export const arcOf = (node: EllipseNode): Arc => node.arcData ?? FULL;

/** The ellipse whose arc can be dragged on canvas: a single, unlocked ellipse large enough on screen. */
export function arcTarget(editor: Editor): EllipseNode | null {
  if (editor.selection.length !== 1) return null;
  const node = editor.doc.get(editor.selection[0]!);
  if (!node || node.type !== 'ELLIPSE' || !isInteractive(editor.doc, node.id)) return null;
  editor.scene.ensure(editor.pageId);
  const m = localToScreen(editor, node.id);
  if (Math.min(node.size.width, node.size.height) * Math.hypot(m.a, m.b) < RADIUS_HANDLES_MIN_SIZE_PX) return null;
  return node;
}

/**
 * Arc handles of the selected ellipse. A plain ellipse has one, the sweep handle, on its right-hand
 * side; once it has a gap (or a ring) the start handle sits at the arc's start and the ratio handle at
 * the inner radius halfway along the sweep — the center while there is no inner radius.
 */
export function arcHandles(editor: Editor): ArcHandle[] {
  const node = arcTarget(editor);
  if (!node) return [];
  const { width: w, height: h } = node.size;
  const arc = arcOf(node);
  const m = localToScreen(editor, node.id);
  const inset = ARC_HANDLE_INSET_PX / (Math.hypot(m.a, m.b) || 1);
  const inside = (angle: number): Vec2 => {
    const p = ellipsePoint(w, h, angle);
    const [dx, dy] = [w / 2 - p.x, h / 2 - p.y];
    const d = Math.hypot(dx, dy);
    return d <= inset ? { x: w / 2, y: h / 2 } : { x: p.x + (dx / d) * inset, y: p.y + (dy / d) * inset };
  };
  const sweep = arcSweep(arc);
  const handles: ArcHandle[] = [{ id: node.id, kind: 'sweep', local: inside(arc.startingAngle + sweep) }];
  if (node.arcData === undefined || (isFullTurn(arc) && arc.innerRadius <= 0)) return handles;
  handles.push({ id: node.id, kind: 'start', local: inside(arc.startingAngle) });
  handles.push({ id: node.id, kind: 'ratio', local: ellipsePoint(w, h, arc.startingAngle + sweep / 2, arc.innerRadius) });
  return handles;
}

export const arcHandleScreen = (editor: Editor, handle: ArcHandle): Vec2 => apply(localToScreen(editor, handle.id), handle.local);

/** The arc handle under a screen point, if any (the sweep handle first where handles overlap). */
export function hitArcHandle(editor: Editor, screen: Vec2, tolerancePx: number): ArcHandle | null {
  for (const handle of arcHandles(editor)) {
    const p = arcHandleScreen(editor, handle);
    if (Math.hypot(p.x - screen.x, p.y - screen.y) <= tolerancePx) return handle;
  }
  return null;
}

/** The parametric angle of a layer-local point around the ellipse's center. */
export function angleAt(size: { readonly width: number; readonly height: number }, local: Vec2): number {
  return Math.atan2((local.y - size.height / 2) / (size.height / 2 || 1), (local.x - size.width / 2) / (size.width / 2 || 1));
}

export function startArcDrag(editor: Editor, handle: ArcHandle, world: Vec2): ArcDragState {
  const node = editor.doc.getOrThrow(handle.id) as EllipseNode;
  return { arc: arcOf(node), lastAngle: angleAt(node.size, editor.scene.toLocal(node.id, world) ?? handle.local) };
}

/**
 * Drags an arc handle to a layer-local point. The sweep handle follows the pointer around the ellipse
 * (passing the start turns a full clockwise sweep into a full counter-clockwise one); the start handle
 * turns the whole arc; the ratio handle sets the inner radius to the pointer's distance from the center, and
 * dragged around into the gap it switches to the other segment.
 */
export function dragArc(tx: Transaction, handle: ArcHandle, state: ArcDragState, local: Vec2): ArcDragState {
  const node = tx.store.getOrThrow(handle.id) as EllipseNode;
  const angle = angleAt(node.size, local);
  const delta = wrapAngle(angle - state.lastAngle);
  const { arc } = state;
  let next: Arc;
  if (handle.kind === 'sweep') {
    let sweep = arcSweep(arc) + delta;
    if (sweep > TAU) sweep -= 2 * TAU;
    else if (sweep < -TAU) sweep += 2 * TAU;
    next = { ...arc, endingAngle: arc.startingAngle + sweep };
  } else if (handle.kind === 'start') {
    const start = (((arc.startingAngle + delta) % TAU) + TAU) % TAU;
    next = { ...arc, startingAngle: start, endingAngle: start + arcSweep(arc) };
  } else {
    const { width: w, height: h } = node.size;
    const r = Math.hypot((local.x - w / 2) / (w / 2 || 1), (local.y - h / 2) / (h / 2 || 1));
    next = { ...arc, innerRadius: Math.round(Math.min(1, r) * 100) / 100 };
    // Dragged around from the arc into its gap, the ratio handle shows the other segment: the gap becomes the arc,
    // starting where the old one ended and turning the same way.
    const sweep = arcSweep(arc);
    if (!isFullTurn(arc) && sweep !== 0 && withinSweep(arc, state.lastAngle) && !withinSweep(arc, angle)) {
      next = { ...next, startingAngle: arc.startingAngle + sweep, endingAngle: arc.startingAngle + sweep + Math.sign(sweep) * (TAU - Math.abs(sweep)) };
    }
  }
  tx.set(node.id, 'arcData', next);
  return { arc: next, lastAngle: angle };
}

/** The label shown while dragging: the sweep as a percentage of the ellipse, the start angle, or the ratio. */
export function arcLabelText(kind: ArcHandleKind, arc: Arc): string {
  if (kind === 'sweep') return `Sweep ${Math.round((arcSweep(arc) / TAU) * 100)}%`;
  if (kind === 'start') return `Start ${Math.round((arc.startingAngle * 180) / Math.PI)}°`;
  return `Ratio ${Math.round(arc.innerRadius * 100)}%`;
}
