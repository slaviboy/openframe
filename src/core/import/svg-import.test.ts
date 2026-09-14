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

import { describe, expect, test } from 'vitest';
import { importSvg, type ImportedGroup, type ImportedVector, type SvgElement } from './svg-import';

const el = (tag: string, attributes: Record<string, string> = {}, ...children: SvgElement[]): SvgElement => ({ tag, attributes, children });
const red = { r: 1, g: 0, b: 0, a: 1 };

describe('SVG import', () => {
  test('a rectangle becomes a vector, scaled by the view box into the frame', () => {
    const result = importSvg(el('svg', { width: '200', height: '100', viewBox: '0 0 100 50' }, el('rect', { x: '10', y: '10', width: '20', height: '10', fill: '#f00' })))!;
    expect(result).toMatchObject({ width: 200, height: 100, skipped: [] });
    const [vector] = result.children as [ImportedVector];
    expect(vector).toMatchObject({ kind: 'vector', name: 'Rectangle', x: 20, y: 20, width: 40, height: 20, strokes: [], strokeWeight: 2, opacity: 1 });
    expect(vector.fills).toEqual([{ type: 'SOLID', color: red, opacity: 1, visible: true, blendMode: 'NORMAL' }]);
    // The geometry starts at the layer's position.
    expect(vector.network.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(vector.network.regions).toHaveLength(1);
  });

  test('groups pass their transform and paint on to their children', () => {
    const result = importSvg(
      el('svg', { width: '100', height: '100' }, el('g', { id: 'badge', transform: 'translate(5 5)', fill: 'blue', stroke: 'black', 'stroke-width': '2', opacity: '0.5' }, el('circle', { cx: '10', cy: '10', r: '5' }))),
    )!;
    const [group] = result.children as [ImportedGroup];
    expect(group).toMatchObject({ kind: 'group', name: 'badge', opacity: 0.5 });
    const [circle] = group.children as [ImportedVector];
    expect(circle).toMatchObject({ name: 'Ellipse', strokeWeight: 2 });
    expect(circle.x).toBeCloseTo(10);
    expect(circle.y).toBeCloseTo(10);
    expect(circle.width).toBeCloseTo(10);
    expect(circle.fills[0]).toMatchObject({ color: { r: 0, g: 0, b: 1, a: 1 } });
    expect(circle.strokes[0]).toMatchObject({ color: { r: 0, g: 0, b: 0, a: 1 } });
  });

  test('style declarations, the even-odd fill rule and opacities', () => {
    const result = importSvg(
      el('svg', { width: '20', height: '20' }, el('path', { d: 'M0 0H10V10H0Z M2 2H8V8H2Z', style: 'fill: rgba(0, 128, 0, 0.5); fill-rule: evenodd; fill-opacity: 50%', fill: 'red' })),
    )!;
    const [path] = result.children as [ImportedVector];
    expect(path.network.regions.map((region) => region.windingRule)).toEqual(['EVENODD', 'EVENODD']);
    expect(path.fills).toHaveLength(1);
    expect(path.fills[0]!.opacity).toBeCloseTo(0.25);
  });

  test('lines and polylines are open vectors with strokes only', () => {
    const result = importSvg(el('svg', { width: '50', height: '50', stroke: 'currentColor', color: 'red' }, el('line', { x1: '0', y1: '10', x2: '40', y2: '10' }), el('polyline', { points: '0,0 10,10 20,0', fill: 'blue' })))!;
    const [line, polyline] = result.children as [ImportedVector, ImportedVector];
    expect(line).toMatchObject({ name: 'Line', x: 0, y: 10, width: 40, height: 0, fills: [] });
    expect(line.strokes[0]).toMatchObject({ color: red });
    expect(polyline.network.regions).toEqual([]);
    expect(polyline.fills).toEqual([]);
  });

  test('text, images, reused elements and gradient paints are skipped and listed; hidden and definition content is not imported', () => {
    const result = importSvg(
      el(
        'svg',
        { width: '10', height: '10' },
        el('defs', {}, el('linearGradient', { id: 'fade' }), el('rect', { width: '5', height: '5' })),
        el('text', { id: 'title' }),
        el('image', {}),
        el('use', {}),
        el('rect', { width: '5', height: '5', fill: 'url(#fade)' }),
        el('rect', { width: '5', height: '5', style: 'display:none' }),
        el('blink', {}),
      ),
    )!;
    expect(result.children).toHaveLength(1);
    expect(result.skipped).toEqual(['title: text', 'image', 'reused element (use)', 'fill paint (gradient or pattern)', 'unsupported element <blink>']);
  });

  test('only svg roots import; sizes fall back to the view box, then to 300 × 150', () => {
    expect(importSvg(el('html'))).toBeNull();
    expect(importSvg(el('svg', { viewBox: '0 0 64 32' }))).toMatchObject({ width: 64, height: 32, children: [] });
    expect(importSvg(el('svg'))).toMatchObject({ width: 300, height: 150 });
  });
});
