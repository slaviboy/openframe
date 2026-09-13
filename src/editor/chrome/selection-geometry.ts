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
import { apply, multiply, type Matrix } from '@/core/math/matrix';
import { unionAll, type Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { Editor } from '../editor';
import { HANDLE_AXES, type HandleId } from '../interactions/transform';
import { worldToScreen } from '../viewport/viewport';

export interface SelectionFrame {
  /** Maps the unit-less box (0..width, 0..height) to world space. */
  readonly toWorld: Matrix;
  readonly width: number;
  readonly height: number;
  /** Single node selection (resizes in node-local space). */
  readonly nodeId: Id | null;
}

/** The transformable frame of the current selection, or null when nothing is selected. */
export function selectionFrame(editor: Editor, ids: readonly Id[] = editor.selection): SelectionFrame | null {
  if (ids.length === 0) return null;
  editor.scene.ensure(editor.pageId);
  if (ids.length === 1) {
    const node = editor.doc.get(ids[0]!);
    if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') return null;
    return { toWorld: editor.scene.worldTransform(node.id), width: node.size.width, height: node.size.height, nodeId: node.id };
  }
  const bounds = unionAll(ids.map((id) => editor.scene.worldBounds(id)).filter((r): r is Rect => r !== null));
  if (!bounds) return null;
  return { toWorld: { a: 1, b: 0, c: 0, d: 1, e: bounds.x, f: bounds.y }, width: bounds.width, height: bounds.height, nodeId: null };
}

export const HANDLE_IDS: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Box-space position of a handle. */
export function handlePoint(frame: SelectionFrame, handle: HandleId): Vec2 {
  const [ax, ay] = HANDLE_AXES[handle];
  return { x: ((ax + 1) / 2) * frame.width, y: ((ay + 1) / 2) * frame.height };
}

/** Screen-space quad corners (nw, ne, se, sw). */
export function screenQuad(editor: Editor, frame: SelectionFrame): [Vec2, Vec2, Vec2, Vec2] {
  const v = editor.state.viewport;
  const pts: Vec2[] = [
    { x: 0, y: 0 },
    { x: frame.width, y: 0 },
    { x: frame.width, y: frame.height },
    { x: 0, y: frame.height },
  ].map((p) => worldToScreen(v, apply(frame.toWorld, p)));
  return pts as [Vec2, Vec2, Vec2, Vec2];
}

/**
 * Finds the resize handle under a screen point. Corner squares take priority; edges are
 * hit anywhere along their length. Small selections hide edge-midpoint handles but keep edges.
 */
export function hitHandle(editor: Editor, frame: SelectionFrame, screen: Vec2, tolerancePx: number): HandleId | null {
  const v = editor.state.viewport;
  const toScreen = multiply({ a: v.zoom, b: 0, c: 0, d: v.zoom, e: -v.x * v.zoom, f: -v.y * v.zoom }, frame.toWorld);
  if (isLineFrame(editor, frame)) {
    // Lines have one handle per end point: 'w' is the start, 'e' the end.
    const end = apply(toScreen, { x: frame.width, y: 0 });
    const start = apply(toScreen, { x: 0, y: 0 });
    if (Math.hypot(end.x - screen.x, end.y - screen.y) <= tolerancePx) return 'e';
    if (Math.hypot(start.x - screen.x, start.y - screen.y) <= tolerancePx) return 'w';
    return null;
  }
  for (const h of ['nw', 'ne', 'se', 'sw'] as const) {
    const p = apply(toScreen, handlePoint(frame, h));
    if (Math.abs(p.x - screen.x) <= tolerancePx && Math.abs(p.y - screen.y) <= tolerancePx) return h;
  }
  const quad = screenQuad(editor, frame);
  const edges: [HandleId, Vec2, Vec2][] = [
    ['n', quad[0], quad[1]],
    ['e', quad[1], quad[2]],
    ['s', quad[2], quad[3]],
    ['w', quad[3], quad[0]],
  ];
  for (const [h, a, b] of edges) {
    if (distanceToSegment(screen, a, b) <= tolerancePx / 2 + 1) return h;
  }
  return null;
}

export const SECTION_TITLE_HEIGHT = 20;
const SECTION_TITLE_INSET = 8;
const SECTION_TITLE_PADDING = 8;
/** Deterministic label width so the drawn pill and its hit area always match (Inter 11px averages ≈6.5px per glyph). */
const titleTextWidth = (text: string): number => Math.ceil(text.length * 6.5);

/**
 * Screen rectangle of a section's title pill, inside its top-left corner, or null when the
 * section is too small on screen to show a title.
 */
export function sectionTitleRect(editor: Editor, id: Id): Rect | null {
  const node = editor.doc.get(id);
  if (node?.type !== 'SECTION') return null;
  const v = editor.state.viewport;
  const world = editor.scene.worldTransform(id);
  const origin = worldToScreen(v, apply(world, { x: 0, y: 0 }));
  const widthPx = node.size.width * Math.hypot(world.a, world.b) * v.zoom;
  const heightPx = node.size.height * Math.hypot(world.c, world.d) * v.zoom;
  const maxWidth = widthPx - SECTION_TITLE_INSET * 2;
  if (maxWidth < 24 || heightPx < SECTION_TITLE_HEIGHT + SECTION_TITLE_INSET * 2) return null;
  return {
    x: origin.x + SECTION_TITLE_INSET,
    y: origin.y + SECTION_TITLE_INSET,
    width: Math.min(titleTextWidth(node.name) + SECTION_TITLE_PADDING * 2, maxWidth),
    height: SECTION_TITLE_HEIGHT,
  };
}

/** Visits sections top-down in paint order (page children first, nested sections after their parent). */
export function forEachSection(editor: Editor, visit: (id: Id) => void): void {
  const walk = (parent: Id) => {
    for (const id of editor.doc.children(parent)) {
      const node = editor.doc.get(id);
      if (node?.type !== 'SECTION' || !node.visible) continue;
      visit(id);
      walk(id);
    }
  };
  walk(editor.pageId);
}

/** The topmost unlocked section whose title pill is under a screen point. */
export function hitSectionTitle(editor: Editor, screen: Vec2): Id | null {
  let found: Id | null = null;
  forEachSection(editor, (id) => {
    const node = editor.doc.get(id);
    const r = sectionTitleRect(editor, id);
    if (!node || node.type === 'DOCUMENT' || node.locked || !r) return;
    if (screen.x >= r.x && screen.x <= r.x + r.width && screen.y >= r.y && screen.y <= r.y + r.height) found = id;
  });
  return found;
}

/** Whether the frame is a single selected line (which shows end point handles instead of a box). */
export function isLineFrame(editor: Editor, frame: SelectionFrame): boolean {
  return frame.nodeId !== null && editor.doc.get(frame.nodeId)?.type === 'LINE';
}

export type Corner = 'nw' | 'ne' | 'se' | 'sw';
const CORNERS: readonly Corner[] = ['nw', 'ne', 'se', 'sw'];

/** World-space center of the selection frame (the rotation pivot). */
export const frameCenterWorld = (frame: SelectionFrame): Vec2 => apply(frame.toWorld, { x: frame.width / 2, y: frame.height / 2 });

/**
 * Rotation zone: just outside a corner of the selection (beyond the resize handle, within
 * `zonePx`). Returns the nearest corner, or null.
 */
export function hitRotationCorner(editor: Editor, frame: SelectionFrame, screen: Vec2, handleTolerancePx: number, zonePx = 18): Corner | null {
  // Lines rotate by dragging an end point; sections never rotate.
  if (isLineFrame(editor, frame) || editor.selection.some((id) => editor.doc.get(id)?.type === 'SECTION')) return null;
  const quad = screenQuad(editor, frame);
  if (pointInQuad(screen, quad)) return null;
  let best: Corner | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = quad[i]!;
    const d = Math.hypot(p.x - screen.x, p.y - screen.y);
    if (d > handleTolerancePx && d <= zonePx && d < bestDistance) {
      best = CORNERS[i]!;
      bestDistance = d;
    }
  }
  return best;
}

/** Rotate cursor oriented toward the corner, accounting for the frame's rotation on screen. */
export function rotateCursor(frame: SelectionFrame, corner: Corner): 'rotate-nw' | 'rotate-ne' | 'rotate-se' | 'rotate-sw' {
  const base = { nw: 225, ne: 315, se: 45, sw: 135 }[corner];
  const deg = (((base + (Math.atan2(frame.toWorld.b, frame.toWorld.a) * 180) / Math.PI) % 360) + 360) % 360;
  if (deg < 90) return 'rotate-se';
  if (deg < 180) return 'rotate-sw';
  if (deg < 270) return 'rotate-nw';
  return 'rotate-ne';
}

function pointInQuad(p: Vec2, quad: readonly Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % quad.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** CSS resize cursor for a handle, accounting for the frame's rotation on screen. */
export function handleCursor(frame: SelectionFrame, handle: HandleId): 'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize' {
  const [ax, ay] = HANDLE_AXES[handle];
  const baseAngle = Math.atan2(ay, ax);
  const rotation = Math.atan2(frame.toWorld.b, frame.toWorld.a);
  const deg = ((((baseAngle + rotation) * 180) / Math.PI) % 180 + 180) % 180;
  if (deg < 22.5 || deg >= 157.5) return 'ew-resize';
  if (deg < 67.5) return 'nwse-resize';
  if (deg < 112.5) return 'ns-resize';
  return 'nesw-resize';
}
