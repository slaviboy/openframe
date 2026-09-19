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

import type { Vec2 } from '../math/vec';
import type { BrushKind, BrushNode, BrushSettings, Node, Size, VectorNetworkData } from '../schema/document';
import { simplifyPolyline } from './pencil';
import { networkStrokePath } from './vector-network';
import { reverseChain, widthAt, type StrokeChain, type WidthPoint } from './vector-width';

export const isBrush = (node: Node | undefined): node is BrushNode => node?.type === 'BRUSH';

/** How finely a brush's own outline is walked; a stretched shape bends along the stroke, so it needs points to bend. */
const OUTLINE_STEP = 1;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A brush's shape as closed polygons, kept against the shape it came from: a brush is the same shape on
 * every frame and one of the reference's own runs to hundreds of loops of grain, so it is walked once.
 *
 * `step` is how finely the shape is walked, in its own units. A shape bends along the path, so it needs
 * points to bend at — but only as many as are drawn: a brush laid down at a tenth of its size needs a point
 * every ten of its own units to keep a point every pixel, and a spray lays its shape down again and again.
 */
const outlines = new WeakMap<object, Map<number, Vec2[][]>>();

export function brushOutline(network: VectorNetworkData, step = OUTLINE_STEP): Vec2[][] {
  // Bucketed to powers of two, so a stroke being resized does not walk the shape anew at every size.
  const bucket = Math.min(64, 2 ** Math.max(0, Math.round(Math.log2(Math.max(step, 1)))));
  const held = outlines.get(network) ?? new Map<number, Vec2[][]>();
  const walked = held.get(bucket) ?? walkOutline(network, bucket);
  held.set(bucket, walked);
  outlines.set(network, held);
  return walked;
}

function walkOutline(network: VectorNetworkData, step: number): Vec2[][] {
  return walkLoops(network, step).map((loop) => {
    const simplified = step > 1 ? simplifyPolyline(loop, step / 2) : loop;
    // A mark drawn far smaller than itself still leaves ink: where simplifying takes a loop down to nothing,
    // the box it covered stands in for it.
    return simplified.length > 2 ? simplified : boxOf(loop);
  });
}

/** The box a loop covers, as a loop of its own. */
function boxOf(loop: readonly Vec2[]): Vec2[] {
  let lowX = Infinity;
  let lowY = Infinity;
  let highX = -Infinity;
  let highY = -Infinity;
  for (const point of loop) {
    if (point.x < lowX) lowX = point.x;
    if (point.x > highX) highX = point.x;
    if (point.y < lowY) lowY = point.y;
    if (point.y > highY) highY = point.y;
  }
  return [
    { x: lowX, y: lowY },
    { x: highX, y: lowY },
    { x: highX, y: highY },
    { x: lowX, y: highY },
  ];
}

/** The loops of a shape, walked finely enough to bend. */
function walkLoops(network: VectorNetworkData, step: number): Vec2[][] {
  const polygons: Vec2[][] = [];
  let current: Vec2[] | null = null;
  let at: Vec2 = { x: 0, y: 0 };
  const line = (to: Vec2) => {
    if (!current) return;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - at.x, to.y - at.y) / step));
    for (let i = 1; i <= steps; i++) current.push({ x: lerp(at.x, to.x, i / steps), y: lerp(at.y, to.y, i / steps) });
    at = to;
  };
  for (const command of networkStrokePath(network)) {
    if (command.op === 'M') {
      current = [{ x: command.x, y: command.y }];
      polygons.push(current);
      at = { x: command.x, y: command.y };
    } else if (command.op === 'L') {
      line({ x: command.x, y: command.y });
    } else if (command.op === 'C') {
      const from = at;
      const rough = Math.hypot(command.x1 - from.x, command.y1 - from.y) + Math.hypot(command.x2 - command.x1, command.y2 - command.y1) + Math.hypot(command.x - command.x2, command.y - command.y2);
      const steps = Math.max(2, Math.ceil(rough / step));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        current?.push({
          x: u * u * u * from.x + 3 * u * u * t * command.x1 + 3 * u * t * t * command.x2 + t * t * t * command.x,
          y: u * u * u * from.y + 3 * u * u * t * command.y1 + 3 * u * t * t * command.y2 + t * t * t * command.y,
        });
      }
      at = { x: command.x, y: command.y };
    }
  }
  return polygons.filter((polygon) => polygon.length > 2);
}

/** How long a shape is from end to end, across all the loops it is made of. */
function extentOf(polygons: readonly (readonly Vec2[])[]): number {
  let low = Infinity;
  let high = -Infinity;
  for (const polygon of polygons)
    for (const point of polygon) {
      if (point.x < low) low = point.x;
      if (point.x > high) high = point.x;
    }
  return high > low ? high - low : 0;
}

/** The point and direction of the chain at `distance` along it. */
function along(chain: StrokeChain, distance: number): { point: Vec2; tangent: Vec2 } {
  const { points, lengths } = chain;
  const total = lengths[lengths.length - 1]!;
  const d = Math.min(Math.max(distance, 0), total);
  let i = 1;
  while (i < lengths.length - 1 && lengths[i]! < d) i++;
  const before = points[i - 1]!;
  const after = points[i]!;
  const span = lengths[i]! - lengths[i - 1]!;
  const t = span > 0 ? (d - lengths[i - 1]!) / span : 0;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;
  return { point: { x: lerp(before.x, after.x, t), y: lerp(before.y, after.y, t) }, tangent: { x: dx / length, y: dy / length } };
}

/**
 * A brush as it starts out, in the values the reference's own brushes are set to: copies a quarter of the
 * shape apart, none of them moved across the path, a third of a copy's size given away to chance, a copy
 * free to face any way, and no turn of its own. A stretch brush runs forward along the path.
 */
export const DEFAULT_BRUSH_SETTINGS: FilledBrushSettings = { direction: 'FORWARD', gap: 25, wiggle: 0, sizeJitter: 30, angularJitter: 180, rotation: 0 };

/** A brush's settings with nothing left out. */
export type FilledBrushSettings = { [K in keyof BrushSettings]-?: NonNullable<BrushSettings[K]> };

/** A brush's settings with everything it leaves out filled in. */
export function brushSettings(settings: BrushSettings | undefined): FilledBrushSettings {
  const filled = { ...DEFAULT_BRUSH_SETTINGS };
  for (const [key, value] of Object.entries(settings ?? {})) if (value !== undefined) Object.assign(filled, { [key]: value });
  return filled;
}

/** How much of itself a mark is laid over the one before it when nothing is asked for between them. */
const OVERLAP = 0.96;

/** A loop drawn smaller than this across is a speck of nothing on screen, and is left out. */
const VISIBLE = 0.75;
/** However small a brush is drawn, this many of its largest loops are always drawn: something must be. */
const ALWAYS = 8;

/**
 * The loops of a shape worth drawing at the size it is being drawn. The reference's own brushes carry their
 * grain as hundreds of loops a few units across; a brush laid down at a tenth of its size would spend all
 * its time on loops that cover less than a pixel, and a spray lays its shape down again every few pixels.
 */
function visibleLoops(polygons: readonly Vec2[][], scale: number): readonly Vec2[][] {
  if (scale >= 1) return polygons;
  const across = (polygon: readonly Vec2[]) => {
    let lowX = Infinity;
    let highX = -Infinity;
    let lowY = Infinity;
    let highY = -Infinity;
    for (const p of polygon) {
      if (p.x < lowX) lowX = p.x;
      if (p.x > highX) highX = p.x;
      if (p.y < lowY) lowY = p.y;
      if (p.y > highY) highY = p.y;
    }
    return (highX - lowX + (highY - lowY)) / 2;
  };
  const drawn = polygons.filter((polygon) => across(polygon) * scale >= VISIBLE);
  if (drawn.length >= ALWAYS || polygons.length <= ALWAYS) return drawn.length > 0 ? drawn : polygons.slice(0, ALWAYS);
  return [...polygons].sort((a, b) => across(b) - across(a)).slice(0, ALWAYS);
}

/** A repeatable value in [-1, 1] for a copy: the same stroke scatters the same way on every draw. */
function jitterAt(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * A stroke painted with a custom brush, as the groups of polygons to fill — one path each. A brush's shape
 * carries holes (the grain of the reference's own brushes is holes), and a hole is a loop wound against the
 * ink around it, so filling two copies of a shape as one path lets a hole in one cancel the ink of its
 * neighbour and cut a slit through the stroke. A stretched brush is laid once, so it is one group; a
 * scattered one goes down in two, every other copy, and copies that far apart never meet.
 */
export function brushStrokeGroups(
  chain: StrokeChain,
  network: VectorNetworkData,
  size: Size,
  kind: BrushKind,
  strokeWeight: number,
  options: { readonly settings?: BrushSettings | undefined; readonly widths?: readonly WidthPoint[] | undefined } = {},
): Vec2[][][] {
  if (kind === 'STRETCH') return [brushStrokeOutlines(chain, network, size, kind, strokeWeight, options)];
  const copies = brushStrokeCopies(chain, network, size, strokeWeight, options);
  const even: Vec2[][] = [];
  const odd: Vec2[][] = [];
  copies.forEach((polygons, i) => (i % 2 === 0 ? even : odd).push(...polygons));
  return [even, odd];
}

/**
 * A stroke painted with a custom brush, as closed polygons to fill.
 *
 * A stretch brush is laid over the whole stroke: the shape's x becomes distance along the path and its y the offset
 * across it, so it bends with the path, and Direction decides which end it starts from. A scatter brush repeats the
 * shape along the path instead, a gap apart, each copy turned to face the way the path goes and then moved, resized
 * and turned again by as much as its jitters allow. Both scale so the shape's height matches the stroke's weight —
 * or, where the stroke's width varies, the width at the point the shape is laid over.
 */
export function brushStrokeOutlines(
  chain: StrokeChain,
  network: VectorNetworkData,
  size: Size,
  kind: BrushKind,
  strokeWeight: number,
  options: { readonly settings?: BrushSettings | undefined; readonly widths?: readonly WidthPoint[] | undefined } = {},
): Vec2[][] {
  const laid = kind === 'STRETCH' && brushSettings(options.settings).direction === 'REVERSE' ? reverseChain(chain) : chain;
  const total = laid.lengths[laid.lengths.length - 1]!;
  const polygons = brushOutline(network, size.height / Math.max(strokeWeight, 0.01));
  if (total <= 0 || strokeWeight <= 0 || polygons.length === 0 || size.width <= 0 || size.height <= 0) return [];
  const widths = options.widths?.length ? options.widths : undefined;
  /** How far the shape is scaled where it sits: the stroke's weight there against the shape's own height. */
  const scaleAt = (position: number) => (widths ? widthAt(widths, position, strokeWeight) : strokeWeight) / size.height;

  if (kind === 'STRETCH') {
    return visibleLoops(polygons, strokeWeight / size.height).map((polygon) =>
      polygon.map((p) => {
        const position = Math.min(Math.max(p.x / size.width, 0), 1);
        const { point, tangent } = along(laid, position * total);
        const across = (p.y - size.height / 2) * scaleAt(position);
        return { x: point.x - tangent.y * across, y: point.y + tangent.x * across };
      }),
    );
  }

  // Scatter: a copy of the shape at each step along the path, a gap apart.
  return brushStrokeCopies(chain, network, size, strokeWeight, options).flat();
}

/** Each copy a scatter brush lays down the path, as its own polygons. */
function brushStrokeCopies(
  chain: StrokeChain,
  network: VectorNetworkData,
  size: Size,
  strokeWeight: number,
  options: { readonly settings?: BrushSettings | undefined; readonly widths?: readonly WidthPoint[] | undefined } = {},
): Vec2[][][] {
  const total = chain.lengths[chain.lengths.length - 1]!;
  const polygons = brushOutline(network, size.height / Math.max(strokeWeight, 0.01));
  if (total <= 0 || strokeWeight <= 0 || polygons.length === 0 || size.width <= 0 || size.height <= 0) return [];
  const settings = brushSettings(options.settings);
  const widths = options.widths?.length ? options.widths : undefined;
  // How long the shape itself is, which is what a gap is a share of — a mark can be far smaller than the
  // box it sits in, which is how a spray's mark is small against the stroke it is scattered down.
  const markWidth = extentOf(polygons) || size.width;
  const scaleAt = (position: number) => (widths ? widthAt(widths, position, strokeWeight) : strokeWeight) / size.height;

  const drawn = visibleLoops(polygons, scaleAt(0));
  const copies: Vec2[][][] = [];
  let index = 0;
  for (let distance = 0; distance <= total; index++) {
    const position = distance / total;
    const scale = scaleAt(position);
    const { point, tangent } = along(chain, distance);
    // Every jitter is a repeatable value for this copy, so the stroke is the same on every draw.
    const sized = scale * (1 + (settings.sizeJitter / 100) * jitterAt(index, 1));
    const across = (settings.wiggle / 100) * strokeWeight * jitterAt(index, 2);
    const turn = ((settings.rotation + settings.angularJitter * jitterAt(index, 3)) * Math.PI) / 180;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    copies.push(
      drawn.map((polygon) =>
        polygon.map((p) => {
          // The shape's own center sits on the path, turned to the path's direction and then by its own.
          const sx = (p.x - size.width / 2) * sized;
          const sy = (p.y - size.height / 2) * sized;
          const x = sx * cos - sy * sin;
          const y = sx * sin + sy * cos - across;
          return { x: point.x + tangent.x * x - tangent.y * y, y: point.y + tangent.y * x + tangent.x * y };
        }),
      ),
    );
    // The next copy starts where this one ends: stepping by the size the shape was laid at rather than the
    // size it would have had keeps the copies touching however much their size is given away to chance.
    // No gap is a hair of overlap rather than a kiss, since a mark's ink is ragged at its edges and two
    // that only touched would leave a line of nothing between them.
    distance += Math.max(markWidth * sized * (OVERLAP + settings.gap / 100), 0.5);
  }
  return copies;
}
