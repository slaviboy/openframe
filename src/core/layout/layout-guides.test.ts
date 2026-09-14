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
import { constraintsFinalizer } from '../document/constraints';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import { LayoutGuideSchema, type LayoutGuide, type SceneNode } from '../schema/document';
import { constraintBand, convertLayoutGuide, defaultLayoutGuide, gridLines, layoutGuideBands } from './layout-guides';

const columns = (patch: Partial<LayoutGuide>): LayoutGuide => ({ ...defaultLayoutGuide('COLUMNS'), ...patch });
const frame = { width: 400, height: 300 };

describe('layout guides', () => {
  test('defaults: a red 10% grid of 10 px squares, or five stretched columns with 20 px gutters', () => {
    expect(defaultLayoutGuide()).toMatchObject({ pattern: 'GRID', sectionSize: 10, color: { r: 1, g: 0, b: 0, a: 0.1 } });
    expect(defaultLayoutGuide('ROWS')).toMatchObject({ pattern: 'ROWS', count: 5, alignment: 'STRETCH', gutterSize: 20 });
    expect(LayoutGuideSchema.safeParse(defaultLayoutGuide('COLUMNS')).success).toBe(true);
  });

  test('stretched columns share the width left by the margins', () => {
    expect(layoutGuideBands(columns({ count: 3, gutterSize: 20, offset: 30 }), frame)).toEqual([
      { start: 30, length: 100 },
      { start: 150, length: 100 },
      { start: 270, length: 100 },
    ]);
    // Auto count: as many columns of the set width as fit, then stretched to fill.
    expect(layoutGuideBands(columns({ count: null, sectionSize: 90, gutterSize: 10, offset: 0 }), frame)).toHaveLength(4);
  });

  test('fixed columns and rows start from their side, offset, or centered', () => {
    const fixed = { count: 2, sectionSize: 50, gutterSize: 10, offset: 20 };
    expect(layoutGuideBands(columns({ ...fixed, alignment: 'MIN' }), frame).map((b) => b.start)).toEqual([20, 80]);
    expect(layoutGuideBands(columns({ ...fixed, alignment: 'MAX' }), frame).map((b) => b.start)).toEqual([270, 330]);
    expect(layoutGuideBands(columns({ ...fixed, alignment: 'CENTER' }), frame).map((b) => b.start)).toEqual([145, 205]);
    const rows = { ...defaultLayoutGuide('ROWS'), ...fixed, alignment: 'MAX' as const };
    expect(layoutGuideBands(rows, frame).map((b) => b.start)).toEqual([170, 230]);
    expect(layoutGuideBands(columns({ count: null, sectionSize: 100, gutterSize: 0, offset: 0, alignment: 'MIN' }), frame)).toHaveLength(4);
  });

  test('a uniform grid has lines every size pixels inside the frame', () => {
    expect(gridLines(defaultLayoutGuide(), 35)).toEqual([10, 20, 30]);
    expect(layoutGuideBands(defaultLayoutGuide(), frame)).toEqual([]);
  });

  test('changing type keeps color and visibility', () => {
    const grid = { ...defaultLayoutGuide(), visible: false, color: { r: 0, g: 0, b: 1, a: 0.5 } };
    expect(convertLayoutGuide(grid, 'COLUMNS')).toMatchObject({ pattern: 'COLUMNS', visible: false, color: grid.color, count: 5 });
    const cols = columns({ count: 7 });
    expect(convertLayoutGuide(cols, 'ROWS')).toEqual({ ...cols, pattern: 'ROWS' });
  });

  test('constraints follow the nearest stretched column', () => {
    const guides = [columns({ count: 2, gutterSize: 0, offset: 0 })];
    // A layer at x 250 is in the second column (200–400), which becomes 300–600.
    const band = constraintBand(guides, 'x', 250, 20, frame, { width: 600, height: 300 });
    expect(band).toEqual({ before: { start: 200, length: 200 }, after: { start: 300, length: 300 } });
    expect(constraintBand([columns({ alignment: 'MIN' })], 'x', 250, 20, frame, frame)).toBeNull();
    expect(constraintBand(guides, 'y', 250, 20, frame, frame)).toBeNull();

    const ids = new IdGenerator('g');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const history = new History<null>({ store, captureMeta: () => null, restoreMeta: () => undefined, finalizers: [constraintsFinalizer] });
    const page = store.pages()[0]!;
    const [f, r] = [ids.next(), ids.next()];
    history.run('create', (tx) => {
      tx.create({ ...makeFrame({ id: f, parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 400, height: 300 }), layoutGuides: guides });
      tx.create({ ...makeRectangle({ id: r, parent: { id: f, key: keyOnTop(store, f) }, name: 'R', x: 350, y: 0, width: 20, height: 20 }), constraints: { horizontal: 'MAX', vertical: 'MIN' } });
    });
    history.run('resize', (tx) => tx.set(f, 'size', { width: 600, height: 300 }));
    // 30 px from the column's right edge (400) stays 30 px from its new right edge (600).
    expect((store.getOrThrow(r) as SceneNode).transform[4]).toBe(550);
  });
});
