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

/** Horizontal and vertical auto layout flows, as a pure function over boxes (no document access). */

export type FlowDirection = 'HORIZONTAL' | 'VERTICAL';
export type Sizing = 'FIXED' | 'HUG' | 'FILL';
/** Distribution along the flow: packed to a side with a fixed gap, or an Auto gap (between, around, evenly). */
export type PrimaryAlign = 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' | 'SPACE_AROUND' | 'SPACE_EVENLY';
export type CounterAlign = 'MIN' | 'CENTER' | 'MAX';

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface SizeLimits {
  readonly minWidth?: number | undefined;
  readonly maxWidth?: number | undefined;
  readonly minHeight?: number | undefined;
  readonly maxHeight?: number | undefined;
}

export interface FlowContainer extends SizeLimits {
  readonly direction: FlowDirection;
  /** Horizontal flows only: overflowing items continue on the next line. */
  readonly wrap: boolean;
  readonly padding: Padding;
  /** Gap between items along the flow; may be negative. Ignored with an Auto gap. */
  readonly gap: number;
  /** Gap between wrapped lines. */
  readonly counterGap: number;
  readonly primaryAlign: PrimaryAlign;
  readonly counterAlign: CounterAlign;
  readonly width: number;
  readonly height: number;
  readonly horizontalSizing: 'FIXED' | 'HUG';
  readonly verticalSizing: 'FIXED' | 'HUG';
}

export interface FlowItem extends SizeLimits {
  readonly width: number;
  readonly height: number;
  /**
   * The item's own padding plus inside strokes along the flow. Fill items share the free space by
   * content area (border-box), so an item with more padding ends up that much larger.
   */
  readonly mainInset?: number | undefined;
  readonly horizontalSizing: Sizing;
  readonly verticalSizing: Sizing;
}

export interface FlowBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FlowResult {
  readonly width: number;
  readonly height: number;
  /** One box per item, in the container's local space. */
  readonly items: readonly FlowBox[];
}

/** Clamps to [min, max]; the minimum wins when they conflict. */
export function clampSize(value: number, min: number | undefined, max: number | undefined): number {
  let result = value;
  if (max !== undefined) result = Math.min(result, max);
  if (min !== undefined) result = Math.max(result, min);
  return Math.max(0, result);
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/**
 * Shares `space` among fill items by content area (each gets an equal share plus its inset), freezing
 * any that hit their min or max and resharing the rest.
 */
function distribute(space: number, indices: readonly number[], inset: (i: number) => number, limits: (i: number) => [number | undefined, number | undefined], out: number[]): void {
  let remaining = space;
  let pending = [...indices];
  while (pending.length > 0) {
    const share = Math.max(0, remaining - sum(pending.map(inset))) / pending.length;
    const size = (i: number) => Math.max(inset(i), share + inset(i));
    const clamped = pending.filter((i) => clampSize(size(i), ...limits(i)) !== size(i));
    if (clamped.length === 0) {
      for (const i of pending) out[i] = size(i);
      return;
    }
    for (const i of clamped) {
      out[i] = clampSize(size(i), ...limits(i));
      remaining -= out[i];
    }
    pending = pending.filter((i) => !clamped.includes(i));
  }
}

/**
 * Lays out items along a horizontal or vertical flow:
 * - hugging containers take the size of their content plus padding (never less than the padding);
 * - fill items share the space left along the flow, and stretch across it; in a hugging axis they keep their size;
 * - a fixed gap packs items to the start, center or end; an Auto gap spreads them (never below 0);
 * - across the flow, items (or wrapped lines) align to the start, center or end;
 * - min and max limits apply to every item and to the container.
 */
export function layoutFlow(container: FlowContainer, items: readonly FlowItem[]): FlowResult {
  const horizontal = container.direction === 'HORIZONTAL';
  const pad = container.padding;
  const [padMainStart, padMainEnd] = horizontal ? [pad.left, pad.right] : [pad.top, pad.bottom];
  const [padCrossStart, padCrossEnd] = horizontal ? [pad.top, pad.bottom] : [pad.left, pad.right];
  const hugMain = (horizontal ? container.horizontalSizing : container.verticalSizing) === 'HUG';
  const hugCross = (horizontal ? container.verticalSizing : container.horizontalSizing) === 'HUG';
  const mainLimits = (l: SizeLimits): [number | undefined, number | undefined] => (horizontal ? [l.minWidth, l.maxWidth] : [l.minHeight, l.maxHeight]);
  const crossLimits = (l: SizeLimits): [number | undefined, number | undefined] => (horizontal ? [l.minHeight, l.maxHeight] : [l.minWidth, l.maxWidth]);
  const mainSizing = (item: FlowItem) => (horizontal ? item.horizontalSizing : item.verticalSizing);
  const crossSizing = (item: FlowItem) => (horizontal ? item.verticalSizing : item.horizontalSizing);
  const autoGap = container.primaryAlign.startsWith('SPACE_');
  const gap = autoGap ? 0 : container.gap;
  const wrap = container.wrap && horizontal && !hugMain;

  const main = items.map((item) => clampSize(horizontal ? item.width : item.height, ...mainLimits(item)));
  const cross = items.map((item) => clampSize(horizontal ? item.height : item.width, ...crossLimits(item)));
  let innerMain = Math.max(0, (horizontal ? container.width : container.height) - padMainStart - padMainEnd);

  // Break into lines (wrapping only with a fixed width), then let fill items share each line's free space.
  const lines: number[][] = [];
  if (wrap) {
    let line: number[] = [];
    let used = 0;
    items.forEach((_, i) => {
      const next = line.length === 0 ? main[i]! : used + gap + main[i]!;
      if (line.length > 0 && next > innerMain + 1e-9) {
        lines.push(line);
        line = [i];
        used = main[i]!;
      } else {
        line.push(i);
        used = next;
      }
    });
    if (line.length > 0) lines.push(line);
  } else {
    lines.push(items.map((_, i) => i));
  }
  if (!hugMain) {
    for (const line of lines) {
      const fills = line.filter((i) => mainSizing(items[i]!) === 'FILL');
      if (fills.length === 0) continue;
      const fixed = sum(line.filter((i) => mainSizing(items[i]!) !== 'FILL').map((i) => main[i]!)) + gap * Math.max(0, line.length - 1);
      distribute(innerMain - fixed, fills, (i) => items[i]!.mainInset ?? 0, (i) => mainLimits(items[i]!), main);
    }
  }

  // Container size along the flow.
  const lineLength = (line: readonly number[]) => sum(line.map((i) => main[i]!)) + gap * Math.max(0, line.length - 1);
  const [mainMin, mainMax] = mainLimits(container);
  let containerMain = horizontal ? container.width : container.height;
  if (hugMain) containerMain = padMainStart + padMainEnd + Math.max(0, ...lines.map(lineLength));
  containerMain = Math.max(padMainStart + padMainEnd, clampSize(containerMain, mainMin, mainMax));
  innerMain = containerMain - padMainStart - padMainEnd;

  // Across the flow: each line is as thick as its tallest non-fill item (or its fill items when that's all it has).
  const lineThickness = lines.map((line) => {
    const fixed = line.filter((i) => crossSizing(items[i]!) !== 'FILL').map((i) => cross[i]!);
    return Math.max(0, ...(fixed.length > 0 ? fixed : line.map((i) => cross[i]!)));
  });
  const [crossMin, crossMax] = crossLimits(container);
  const contentCross = sum(lineThickness) + container.counterGap * Math.max(0, lines.length - 1);
  let containerCross = horizontal ? container.height : container.width;
  if (hugCross) containerCross = padCrossStart + padCrossEnd + contentCross;
  containerCross = Math.max(padCrossStart + padCrossEnd, clampSize(containerCross, crossMin, crossMax));
  const innerCross = containerCross - padCrossStart - padCrossEnd;

  const alignOffset = (free: number, align: CounterAlign | PrimaryAlign) => (align === 'CENTER' ? free / 2 : align === 'MAX' ? free : 0);
  const boxes: FlowBox[] = new Array<FlowBox>(items.length);
  // A single unwrapped line spans the whole inner thickness; wrapped lines stack and align as a block.
  const thicknesses = wrap ? lineThickness : [innerCross];
  let lineStart = padCrossStart + (wrap ? alignOffset(innerCross - contentCross, container.counterAlign) : 0);
  lines.forEach((line, index) => {
    const thickness = thicknesses[index]!;
    for (const i of line) {
      if (crossSizing(items[i]!) === 'FILL' && !(hugCross && !wrap && lineThickness[0] === 0)) cross[i] = clampSize(thickness, ...crossLimits(items[i]!));
    }
    const sizes = line.map((i) => main[i]!);
    let lead: number;
    let step: number;
    if (autoGap) {
      const free = Math.max(0, innerMain - sum(sizes));
      const n = line.length;
      if (container.primaryAlign === 'SPACE_BETWEEN') [lead, step] = [0, n > 1 ? free / (n - 1) : 0];
      else if (container.primaryAlign === 'SPACE_AROUND') [lead, step] = [free / n / 2, free / n];
      else [lead, step] = [free / (n + 1), free / (n + 1)];
    } else {
      lead = alignOffset(innerMain - lineLength(line), container.primaryAlign);
      step = gap;
    }
    let position = padMainStart + lead;
    for (const i of line) {
      const offset = lineStart + alignOffset(thickness - cross[i]!, container.counterAlign);
      boxes[i] = horizontal
        ? { x: position, y: offset, width: main[i]!, height: cross[i]! }
        : { x: offset, y: position, width: cross[i]!, height: main[i]! };
      position += main[i]! + step;
    }
    lineStart += thickness + container.counterGap;
  });

  return horizontal ? { width: containerMain, height: containerCross, items: boxes } : { width: containerCross, height: containerMain, items: boxes };
}
