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
import { apply, applyLinear, determinant, invert, multiply, rotation, scaling, translation, type Matrix } from '@/core/math/matrix';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { matrixOf, type SceneIndex } from '@/core/scene/scene-index';
import { isSceneNode, type Transform } from '@/core/schema/document';

export const toTransform = (m: Matrix): Transform => [m.a, m.b, m.c, m.d, m.e, m.f];

const round = (v: number, step: number) => Math.round(v / step) * step;
const isAxisAligned = (m: Matrix) => Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9;

let snapToPixelGrid = true;

/** "Snap to pixel grid" view preference (⌘⇧'); on by default. Set by the UI. */
export function setSnapToPixelGrid(enabled: boolean): void {
  snapToPixelGrid = enabled;
}

export const isSnappingToPixelGrid = (): boolean => snapToPixelGrid;

/** Positioning step for moved, resized and drawn layers: whole pixels when snapping to the pixel grid. */
export const positionStep = (): number => (snapToPixelGrid ? 1 : 0.01);

/**
 * Rounds translation to the positioning step for axis-aligned nodes (whole pixels with pixel-grid
 * snapping), and to 0.01 for rotated nodes.
 */
export function roundTransform(m: Matrix): Matrix {
  const step = isAxisAligned(m) ? positionStep() : 0.01;
  return { ...m, e: Math.round(round(m.e, step) * 100) / 100, f: Math.round(round(m.f, step) * 100) / 100 };
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Which edges a handle moves: [-1 = min edge, 0 = none, 1 = max edge] per axis. */
export const HANDLE_AXES: Record<HandleId, readonly [-1 | 0 | 1, -1 | 0 | 1]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export interface ResizeInput {
  /** Starting box in the resize coordinate space. */
  readonly box: Rect;
  readonly handle: HandleId;
  /** Pointer in the resize coordinate space. */
  readonly pointer: Vec2;
  /** Pointer at gesture start, same space (so grabbing slightly off the edge doesn't jump). */
  readonly start: Vec2;
  readonly keepAspect: boolean;
  readonly fromCenter: boolean;
}

/** Signed edges of the resized box: x0/y0 is the (possibly moved) origin side; x1 < x0 means flipped. */
export interface ResizeResult {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function computeResize(input: ResizeInput): ResizeResult {
  const { box, handle, keepAspect, fromCenter } = input;
  const [ax, ay] = HANDLE_AXES[handle];
  const dx = input.pointer.x - input.start.x;
  const dy = input.pointer.y - input.start.y;
  let x0 = box.x;
  let y0 = box.y;
  let x1 = box.x + box.width;
  let y1 = box.y + box.height;
  if (ax === -1) x0 += dx;
  if (ax === 1) x1 += dx;
  if (ay === -1) y0 += dy;
  if (ay === 1) y1 += dy;
  if (fromCenter) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    if (ax === -1) x1 = 2 * cx - x0;
    if (ax === 1) x0 = 2 * cx - x1;
    if (ay === -1) y1 = 2 * cy - y0;
    if (ay === 1) y0 = 2 * cy - y1;
  }
  if (keepAspect && box.width > 0 && box.height > 0) {
    const sx = (x1 - x0) / box.width;
    const sy = (y1 - y0) / box.height;
    // Edge handles scale the other axis to match; corners follow the dominant axis.
    const s = ax === 0 ? sy : ay === 0 ? sx : Math.abs(sx) > Math.abs(sy) ? sx : sy;
    const signX = ax === 0 ? 1 : Math.sign(sx) || 1;
    const signY = ay === 0 ? 1 : Math.sign(sy) || 1;
    const w = Math.abs(s) * box.width * signX;
    const h = Math.abs(s) * box.height * signY;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    if (ax === 0 || fromCenter) {
      x0 = cx - w / 2;
      x1 = cx + w / 2;
    } else if (ax === -1) x0 = x1 - w;
    else x1 = x0 + w;
    if (ay === 0 || fromCenter) {
      y0 = cy - h / 2;
      y1 = cy + h / 2;
    } else if (ay === -1) y0 = y1 - h;
    else y1 = y0 + h;
  }
  return { x0, y0, x1, y1 };
}

export interface NodeStart {
  readonly id: Id;
  readonly transform: Matrix;
  readonly width: number;
  readonly height: number;
  readonly world: Matrix;
  readonly parentWorld: Matrix;
}

export function captureStart(tx: Transaction, index: SceneIndex, id: Id): NodeStart {
  const node = tx.store.getOrThrow(id);
  if (!isSceneNode(node)) throw new Error('Only scene nodes can be transformed');
  const transform = matrixOf(node.transform);
  const world = index.worldTransform(id);
  const parentInv = invert(transform);
  return {
    id,
    transform,
    width: node.size.width,
    height: node.size.height,
    world,
    parentWorld: parentInv ? multiply(world, parentInv) : index.computeWorld(node.parent.id),
  };
}

/** Applies a resize of a single node in its own local space (supports rotated nodes and flips). */
export function resizeSingle(tx: Transaction, start: NodeStart, result: ResizeResult): void {
  const width = Math.abs(result.x1 - result.x0);
  const height = Math.abs(result.y1 - result.y0);
  const flip = scaling(result.x1 < result.x0 ? -1 : 1, result.y1 < result.y0 ? -1 : 1);
  let next = multiply(start.transform, multiply(translation(result.x0, result.y0), flip));
  next = roundTransform(next);
  const axis = isAxisAligned(next);
  tx.set(start.id, 'transform', toTransform(next));
  tx.set(start.id, 'size', {
    width: axis ? Math.max(0, Math.round(width * 100) / 100) : width,
    height: axis ? Math.max(0, Math.round(height * 100) / 100) : height,
  });
}

/**
 * Resizes a multi-selection by mapping its world bounding box `from` → `to`.
 * Axis-aligned nodes get new positions and sizes; rotated nodes keep their size and
 * have their center repositioned (the reference editor behaves the same for mixed rotations).
 */
export function resizeMany(tx: Transaction, starts: readonly NodeStart[], from: Rect, result: ResizeResult): void {
  const sx = from.width > 0 ? (result.x1 - result.x0) / from.width : 1;
  const sy = from.height > 0 ? (result.y1 - result.y0) / from.height : 1;
  const mapPoint = (p: Vec2): Vec2 => ({ x: result.x0 + (p.x - from.x) * sx, y: result.y0 + (p.y - from.y) * sy });
  for (const s of starts) {
    const parentInv = invert(s.parentWorld);
    if (!parentInv) continue;
    if (isAxisAligned(s.world)) {
      const p0 = mapPoint(apply(s.world, { x: 0, y: 0 }));
      const p1 = mapPoint(apply(s.world, { x: s.width, y: s.height }));
      const world: Matrix = {
        a: Math.sign(p1.x - p0.x) * Math.sign(s.world.a) || 1,
        b: 0,
        c: 0,
        d: Math.sign(p1.y - p0.y) * Math.sign(s.world.d) || 1,
        e: p0.x,
        f: p0.y,
      };
      tx.set(s.id, 'transform', toTransform(roundTransform(multiply(parentInv, world))));
      tx.set(s.id, 'size', { width: Math.abs(p1.x - p0.x), height: Math.abs(p1.y - p0.y) });
    } else {
      const center = apply(s.world, { x: s.width / 2, y: s.height / 2 });
      const moved = mapPoint(center);
      const delta = applyLinear(parentInv, { x: moved.x - center.x, y: moved.y - center.y });
      const t = s.transform;
      tx.set(s.id, 'transform', toTransform({ ...t, e: t.e + delta.x, f: t.f + delta.y }));
    }
  }
}

/**
 * Rotation shown to users, in degrees, counterclockwise positive, in (−180, 180]. A flip
 * is removed before measuring, so mirrored layers report the rotation of their unflipped
 * shape.
 */
export function matrixRotationDegrees(m: Matrix): number {
  const flipped = determinant(m) < 0;
  const a = flipped ? -m.a : m.a;
  const b = flipped ? -m.b : m.b;
  let deg = (-Math.atan2(b, a) * 180) / Math.PI;
  if (Math.abs(deg) < 1e-9) deg = 0;
  return Math.round(deg * 100) / 100;
}

/** Snaps linear components that differ from 0 or ±1 only by floating-point noise. */
function cleanLinear(m: Matrix): Matrix {
  const snap = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v);
  return { a: snap(m.a), b: snap(m.b), c: snap(m.c), d: snap(m.d), e: m.e, f: m.f };
}

/**
 * Rotates nodes around a world-space pivot by `radians` (clockwise on screen is positive).
 * Starts are captured at gesture begin, so each call applies the total rotation from there.
 */
export function rotateNodes(tx: Transaction, starts: readonly NodeStart[], pivot: Vec2, radians: number): void {
  const spin = multiply(translation(pivot.x, pivot.y), multiply(rotation(radians), translation(-pivot.x, -pivot.y)));
  for (const s of starts) {
    const parentInv = invert(s.parentWorld);
    if (!parentInv) continue;
    tx.set(s.id, 'transform', toTransform(cleanLinear(multiply(parentInv, multiply(spin, s.world)))));
  }
}

/** Moves nodes by a world-space delta, converting into each node's parent space. */
export function translateNodes(tx: Transaction, starts: readonly NodeStart[], delta: Vec2): void {
  for (const s of starts) {
    const parentInv = invert(s.parentWorld);
    if (!parentInv) continue;
    const local = applyLinear(parentInv, delta);
    tx.set(s.id, 'transform', toTransform(roundTransform({ ...s.transform, e: s.transform.e + local.x, f: s.transform.f + local.y })));
  }
}
