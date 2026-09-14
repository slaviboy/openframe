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

import type { Rect } from '../math/rect';
import type { Vec2 } from '../math/vec';
import type { Size } from '../schema/document';
import type { Padding } from './flow-layout';

export type PaddingSide = keyof Padding;

/** An on-canvas handle of an auto layout frame, in the frame's local space. */
export type LayoutHandle = { readonly kind: 'padding'; readonly side: PaddingSide; readonly at: Vec2 } | { readonly kind: 'gap'; readonly index: number; readonly at: Vec2 };

export interface LayoutHandleInput {
  readonly size: Size;
  readonly padding: Padding;
  readonly direction: 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  readonly wrap: boolean;
  /** An Auto gap has no value to drag. */
  readonly autoGap: boolean;
  /** Flow children's boxes in the frame's space, in flow order. */
  readonly children: readonly Rect[];
}

const OPPOSITE: Record<PaddingSide, PaddingSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/**
 * Handles for editing an auto layout frame's spacing on the canvas: one per side, centered in that
 * side's padding band, and one per gap between consecutive children (for a fixed gap in a horizontal
 * or vertical flow that doesn't wrap), centered in the gap.
 */
export function layoutHandles(input: LayoutHandleInput): LayoutHandle[] {
  const { size, padding } = input;
  const handles: LayoutHandle[] = [
    { kind: 'padding', side: 'top', at: { x: size.width / 2, y: padding.top / 2 } },
    { kind: 'padding', side: 'right', at: { x: size.width - padding.right / 2, y: size.height / 2 } },
    { kind: 'padding', side: 'bottom', at: { x: size.width / 2, y: size.height - padding.bottom / 2 } },
    { kind: 'padding', side: 'left', at: { x: padding.left / 2, y: size.height / 2 } },
  ];
  if (input.direction === 'GRID' || input.wrap || input.autoGap) return handles;
  const horizontal = input.direction === 'HORIZONTAL';
  input.children.slice(1).forEach((next, i) => {
    const prev = input.children[i]!;
    const top = Math.min(prev.y, next.y);
    const bottom = Math.max(prev.y + prev.height, next.y + next.height);
    const left = Math.min(prev.x, next.x);
    const right = Math.max(prev.x + prev.width, next.x + next.width);
    handles.push({
      kind: 'gap',
      index: i,
      at: horizontal ? { x: (prev.x + prev.width + next.x) / 2, y: (top + bottom) / 2 } : { x: (left + right) / 2, y: (prev.y + prev.height + next.y) / 2 },
    });
  });
  return handles;
}

const snap = (value: number, step: number | undefined) => (step && step > 1 ? Math.round(value / step) * step : Math.round(value));

/**
 * Padding after dragging a side's handle by `delta` (local pixels): dragging inward grows that side.
 * `opposite` sets the opposite side to the same value (⌥), `all` every side (⌥⇧); values snap to `step`.
 */
export function draggedPadding(start: Padding, side: PaddingSide, delta: Vec2, mode: 'side' | 'opposite' | 'all', step?: number): Padding {
  const amount = side === 'top' ? delta.y : side === 'bottom' ? -delta.y : side === 'left' ? delta.x : -delta.x;
  const value = Math.max(0, snap(start[side] + amount, step));
  if (mode === 'all') return { top: value, right: value, bottom: value, left: value };
  return { ...start, [side]: value, ...(mode === 'opposite' ? { [OPPOSITE[side]]: value } : {}) };
}

/** The gap after dragging a gap handle by `delta` along the flow; values snap to `step`. */
export function draggedGap(start: number, direction: 'HORIZONTAL' | 'VERTICAL', delta: Vec2, step?: number): number {
  return snap(start + (direction === 'HORIZONTAL' ? delta.x : delta.y), step);
}
