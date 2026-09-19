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

import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, test } from 'vitest';
import { BLACK, createEmptyDocument, keyOnTop, makeRectangle, makeVector, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import { straightSegment, type VectorNetwork } from '@/core/vector/vector-network';
import type { Node, RectangleNode, StrokeCap, VectorNode } from '@/core/schema/document';
import { SceneRenderer } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

const W = 80;
const H = 80;

/** Renders one unfilled black-stroked 40×40 rectangle at (20, 20) with the given overrides. */
function render(patch: Partial<RectangleNode>) {
  const ids = new IdGenerator('k');
  const store = createEmptyDocument({ name: 'K', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const rect = makeRectangle({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'R', x: 20, y: 20, width: 40, height: 40 });
  store.applyOp({ kind: 'create', node: { ...rect, fills: [], strokes: [solid(BLACK)], ...patch } as Node });
  const surface = ck.MakeSurface(W, H)!;
  const renderer = new SceneRenderer(ck);
  renderer.render(surface.getCanvas(), store, new SceneIndex(store), page, { x: 0, y: 0, zoom: 1, width: W, height: H, dpr: 1 });
  const img = surface.makeImageSnapshot();
  const pixels = img.readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  img.delete();
  surface.delete();
  renderer.dispose();
  return (x: number, y: number) => pixels[(y * W + x) * 4]! < 100;
}

describe('stroke styles', () => {
  test('dashed strokes leave gaps along the edge', () => {
    const solidStroke = render({ strokeWeight: 2, strokeAlign: 'CENTER' });
    const dashed = render({ strokeWeight: 2, strokeAlign: 'CENTER', strokeDashes: [4, 4] });
    const topEdge = Array.from({ length: 30 }, (_, i) => 25 + i);
    expect(topEdge.every((x) => solidStroke(x, 20))).toBe(true);
    expect(topEdge.some((x) => dashed(x, 20))).toBe(true);
    expect(topEdge.some((x) => !dashed(x, 20))).toBe(true);
  });

  test('miter joins fill the outer corner; round joins leave it empty', () => {
    const miter = render({ strokeWeight: 10, strokeAlign: 'OUTSIDE' });
    const round = render({ strokeWeight: 10, strokeAlign: 'OUTSIDE', strokeJoin: 'ROUND' });
    expect(miter(11, 11)).toBe(true);
    expect(round(11, 11)).toBe(false);
    // Both cover the middle of the edge.
    expect(round(40, 15)).toBe(true);
  });

  test('individual stroke weights draw only the chosen sides', () => {
    const top = render({ strokeWeight: 1, strokeAlign: 'INSIDE', individualStrokeWeights: { top: 4, right: 0, bottom: 0, left: 0 } });
    expect(top(40, 21)).toBe(true);
    expect(top(40, 23)).toBe(true);
    expect(top(40, 25)).toBe(false);
    expect(top(40, 58)).toBe(false);
    expect(top(21, 40)).toBe(false);
  });
});

describe('end points on a vector path', () => {
  /** Renders a vector layer whose path runs from (20, 40) right to (60, 40), with the given overrides. */
  function renderPath(patch: Partial<VectorNode>, network?: VectorNetwork) {
    const ids = new IdGenerator('k');
    const store = createEmptyDocument({ name: 'K', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    const path = network ?? {
      vertices: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      segments: [straightSegment(0, 1)],
      regions: [],
    };
    const vector = makeVector({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'V', x: 20, y: 40, width: 40, height: 0 }, path);
    store.applyOp({ kind: 'create', node: { ...vector, strokeWeight: 4, ...patch } as Node });
    const surface = ck.MakeSurface(W, H)!;
    const renderer = new SceneRenderer(ck);
    renderer.render(surface.getCanvas(), store, new SceneIndex(store), page, { x: 0, y: 0, zoom: 1, width: W, height: H, dpr: 1 });
    const img = surface.makeImageSnapshot();
    const pixels = img.readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
    img.delete();
    surface.delete();
    renderer.dispose();
    return (x: number, y: number) => pixels[(y * W + x) * 4]! < 100;
  }

  /** The cap of the path's end (the point at (60, 40)), as the Start point and End point controls set it. */
  const withEndCap = (cap: StrokeCap, patch: Partial<VectorNode> = {}) =>
    renderPath(patch, {
      vertices: [
        { x: 0, y: 0 },
        { x: 40, y: 0, cap },
      ],
      segments: [straightSegment(0, 1)],
      regions: [],
    });

  test('an arrowhead at the end of a path spreads past the stroke, and points the way the path goes', () => {
    const plain = renderPath({});
    const arrow = withEndCap('TRIANGLE_ARROW');
    // The stroke alone is 4 wide, so nothing is drawn 6 above the path; the arrowhead spreads that far.
    expect(plain(48, 34)).toBe(false);
    expect(arrow(48, 34)).toBe(true);
    // The head is behind the path's end, not beside it: the far side of the tip stays empty.
    expect(arrow(64, 40)).toBe(false);
    // The other end carries no cap of its own, so it is left flat.
    expect(arrow(16, 40)).toBe(false);
  });

  test('each end draws its own point, and a layer-wide cap draws the ends that carry none', () => {
    const round = renderPath({ endpointCap: 'ROUND' });
    expect(round(61, 40)).toBe(true);
    expect(round(19, 40)).toBe(true);
    // A point of its own at one end leaves the other on the layer's cap.
    const mixed = withEndCap('NONE', { endpointCap: 'ROUND' });
    expect(mixed(61, 40)).toBe(false);
    expect(mixed(19, 40)).toBe(true);
  });

  test('a dashed stroke keeps its dashes’ own cap rather than an arrowhead', () => {
    const dashed = withEndCap('TRIANGLE_ARROW', { strokeDashes: [4, 4] });
    expect(dashed(48, 34)).toBe(false);
  });

  test('an end point on a dynamic stroke goes where the bumped path stops', () => {
    const network: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 40, y: 0, cap: 'CIRCLE_FILLED' },
      ],
      segments: [straightSegment(0, 1)],
      regions: [],
    };
    // A wiggle wide enough to carry the end clear of where its point sits.
    const bumpy = renderPath({ strokeWeight: 2, dynamicStroke: { frequency: 60, wiggle: 100, smoothen: 0 } }, network);
    const at = renderPath({ strokeWeight: 2 }, network);
    // The plain stroke ends in a circle over its last point; the bumped one has carried that circle away.
    expect(at(60, 40)).toBe(true);
    expect(bumpy(60, 40)).toBe(false);
    // And the circle is somewhere along the line the bump drew, above or below where the point was.
    const column = Array.from({ length: 25 }, (_, i) => 28 + i);
    expect(column.some((y) => bumpy(60, y))).toBe(true);
  });

  test('outlining the stroke takes the end points in, so Outline stroke and an SVG export keep them', () => {
    const ids = new IdGenerator('k');
    const node = makeVector({ id: ids.next(), parent: { id: 'p', key: 'a' }, name: 'V', x: 0, y: 0, width: 40, height: 0 }, { vertices: [{ x: 0, y: 0 }, { x: 40, y: 0, cap: 'TRIANGLE_ARROW' }], segments: [straightSegment(0, 1)], regions: [] });
    const renderer = new SceneRenderer(ck);
    const outline = renderer.strokeOutline({ ...node, strokeWeight: 4 } as VectorNode)!;
    renderer.dispose();
    // The stroke alone is 4 wide; the arrowhead is 16 across, so the outline spreads 8 either side of it.
    const ys = outline.flatMap((c) => (c.op === 'Z' ? [] : [c.y]));
    expect(Math.max(...ys)).toBeCloseTo(8, 1);
    expect(Math.min(...ys)).toBeCloseTo(-8, 1);
  });
});

describe('path trim', () => {
  /** The middles of the rectangle's four edges, which a quarter of its path covers one of. */
  const edges = [
    [40, 20],
    [60, 40],
    [40, 60],
    [20, 40],
  ] as const;
  const drawn = (at: (x: number, y: number) => boolean) => edges.filter(([x, y]) => at(x, y)).length;
  const trimmed = (patch: Partial<RectangleNode>) => render({ strokeWeight: 2, strokeAlign: 'CENTER', ...patch });

  test('draws only the share of the path between its trim points', () => {
    expect(drawn(trimmed({}))).toBe(4);
    const half = trimmed({ strokeTrimEnd: 0.5 });
    const rest = trimmed({ strokeTrimStart: 0.5 });
    expect(drawn(half)).toBe(2);
    expect(drawn(rest)).toBe(2);
    // The two halves are the path between them: every edge belongs to one or the other.
    expect(edges.every(([x, y]) => half(x, y) !== rest(x, y))).toBe(true);
    // Trimmed down to nothing, no stroke is drawn at all.
    expect(drawn(trimmed({ strokeTrimEnd: 0 }))).toBe(0);
  });

  test('wraps back around the path when it starts past where it ends', () => {
    const spinner = trimmed({ strokeTrimStart: 0.75, strokeTrimEnd: 0.25 });
    expect(drawn(spinner)).toBe(2);
    // The quarters left out are the ones in the middle, which the trim runs around rather than through.
    const middle = trimmed({ strokeTrimStart: 0.25, strokeTrimEnd: 0.75 });
    expect(edges.every(([x, y]) => spinner(x, y) !== middle(x, y))).toBe(true);
  });

  test('is left out of account on a stroke that is not centered', () => {
    // An inside stroke sits within the edge rather than over it, so it is sampled just inside the corners.
    const within = [
      [40, 21],
      [59, 40],
      [40, 59],
      [21, 40],
    ] as const;
    const inside = render({ strokeWeight: 2, strokeAlign: 'INSIDE' });
    const asked = render({ strokeWeight: 2, strokeAlign: 'INSIDE', strokeTrimEnd: 0.5 });
    expect(within.every(([x, y]) => inside(x, y))).toBe(true);
    expect(within.every(([x, y]) => inside(x, y) === asked(x, y))).toBe(true);
  });
});
