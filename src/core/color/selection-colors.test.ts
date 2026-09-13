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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, solid } from '@/core/document/factory';
import { History } from '@/core/history/history';
import { IdGenerator } from '@/core/ids/ids';
import { imagePaintFor } from '@/core/image/image-paint';
import type { Node, RectangleNode } from '@/core/schema/document';
import { convertPaint } from './paints';
import { selectionColors, showsSelectionColors, updateSelectionColor } from './selection-colors';

const RED = { r: 1, g: 0, b: 0, a: 1 };
const BLUE = { r: 0, g: 0, b: 1, a: 1 };
const GREEN = { r: 0, g: 1, b: 0, a: 1 };

function setup() {
  const ids = new IdGenerator('c');
  const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const add = (node: Node) => {
    store.applyOp({ kind: 'create', node });
    return node.id;
  };
  const rect = (parent: string, extra: Partial<RectangleNode>) =>
    add({ ...makeRectangle({ id: ids.next(), parent: { id: parent, key: keyOnTop(store, parent) }, name: 'R', x: 0, y: 0, width: 10, height: 10 }), ...extra });
  const a = rect(page, { fills: [solid(RED)] });
  const b = rect(page, { fills: [solid(RED), { ...solid(GREEN), visible: false }], strokes: [solid(BLUE)] });
  const frame = add({ ...makeFrame({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 0, y: 0, width: 100, height: 100 }), fills: [] });
  const c = rect(frame, { fills: [solid(RED), convertPaint(solid(BLUE), 'GRADIENT_LINEAR'), imagePaintFor({ hash: 'a'.repeat(64), width: 1, height: 1 })] });
  const mask = rect(frame, { fills: [solid(GREEN)], isMask: true });
  const faded = rect(page, { fills: [solid(RED, 0.5)] });
  return { store, a, b, frame, c, mask, faded };
}

describe('selection colors', () => {
  test('distinct colors of selected layers and their contents, with every usage', () => {
    const { store, a, b, frame, c, faded } = setup();
    const colors = selectionColors(store, [a, b, frame, faded]);
    expect(colors.map((entry) => entry.paint.type)).toEqual(['SOLID', 'SOLID', 'GRADIENT_LINEAR', 'SOLID']);
    const [red, blue, , halfRed] = colors;
    expect(red!.layers).toEqual([a, b, c]);
    expect(red!.usages).toContainEqual({ node: b, field: 'fills', index: 0 });
    expect(blue!.usages).toEqual([{ node: b, field: 'strokes', index: 0 }]);
    // Opacity makes a different selection color; hidden paints, images and masks are skipped.
    expect(halfRed!.layers).toEqual([faded]);
    expect(colors).toHaveLength(4);
    expect(showsSelectionColors(store, [a])).toBe(false);
    expect(showsSelectionColors(store, [frame])).toBe(true);
    expect(showsSelectionColors(store, [a, b])).toBe(true);
  });

  test('changing a selection color updates every usage in one transaction', () => {
    const { store, a, b, frame, c } = setup();
    const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
    const [red] = selectionColors(store, [a, b, frame]);
    history.run('recolor', (tx) => updateSelectionColor(tx, red!.usages, (p) => (p.type === 'SOLID' ? { ...p, color: GREEN } : p)));
    for (const id of [a, b, c]) expect((store.getOrThrow(id) as RectangleNode).fills[0]).toEqual(solid(GREEN));
    // The hidden green fill on b is untouched.
    expect((store.getOrThrow(b) as RectangleNode).fills[1]!.visible).toBe(false);
    history.undo();
    expect((store.getOrThrow(c) as RectangleNode).fills[0]).toEqual(solid(RED));
  });
});
