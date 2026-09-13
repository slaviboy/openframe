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

import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeEllipse, makeRectangle, makeStar } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { RectangleNode, StarNode } from '@/core/schema/document';
import { worldToScreen } from '../viewport/viewport';
import { Editor } from '../editor';
import { applyDraggedRadius, draggedRadius, hitRadiusHandle, radiusHandles, radiusHandleScreen } from './radius-handles';

let editor: Editor;

function add(make: typeof makeRectangle | typeof makeStar | typeof makeEllipse, width = 200, height = 100): string {
  const id = editor.history.run('seed', (tx) => {
    const next = editor.ids.next();
    tx.create(make({ id: next, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'L', x: 50, y: 40, width, height }));
    return next;
  });
  editor.state.select([id]);
  return id;
}

beforeEach(() => {
  const ids = new IdGenerator('r');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

describe('radius handles', () => {
  test('a rectangle has one handle per corner, inset along the diagonal', () => {
    const id = add(makeRectangle);
    const handles = radiusHandles(editor);
    expect(handles.map((h) => h.corner)).toEqual(['topLeft', 'topRight', 'bottomRight', 'bottomLeft']);
    expect(handles[0]!.max).toBeCloseTo(50);
    // Radius 0: the handle sits the minimum inset in from the corner.
    const p = radiusHandleScreen(editor, handles[0]!);
    const corner = worldToScreen(editor.state.viewport, { x: 50, y: 40 });
    expect(Math.hypot(p.x - corner.x, p.y - corner.y)).toBeCloseTo(12);
    expect(hitRadiusHandle(editor, p, 5)?.corner).toBe('topLeft');

    // A radius moves the handle to the arc center.
    editor.history.run('r', (tx) => applyDraggedRadius(tx, handles[0]!, 30, false, null));
    expect((editor.doc.getOrThrow(id) as RectangleNode).cornerRadius).toBe(30);
    const moved = radiusHandleScreen(editor, radiusHandles(editor)[1]!);
    const center = worldToScreen(editor.state.viewport, { x: 50 + 200 - 30, y: 40 + 30 });
    expect(moved.x).toBeCloseTo(center.x);
    expect(moved.y).toBeCloseTo(center.y);
  });

  test('dragging along the bisector changes the radius, clamped; ⌥ changes one corner', () => {
    const id = add(makeRectangle);
    const [topLeft, , bottomRight] = radiusHandles(editor);
    expect(draggedRadius(topLeft!, { x: 0, y: 0 }, { x: 20, y: 20 })).toBe(20);
    expect(draggedRadius(topLeft!, { x: 0, y: 0 }, { x: -20, y: -20 })).toBe(0);
    expect(draggedRadius(topLeft!, { x: 0, y: 0 }, { x: 500, y: 500 })).toBe(50);
    const start = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
    editor.history.run('r', (tx) => applyDraggedRadius(tx, bottomRight!, 16, true, start));
    expect((editor.doc.getOrThrow(id) as RectangleNode).cornerRadii).toEqual({ ...start, bottomRight: 16 });
    // Without ⌥ every corner follows again.
    editor.history.run('r', (tx) => applyDraggedRadius(tx, bottomRight!, 10, false, start));
    expect(editor.doc.getOrThrow(id)).toMatchObject({ cornerRadius: 10 });
    expect((editor.doc.getOrThrow(id) as RectangleNode).cornerRadii).toBeUndefined();
  });

  test('stars have a single handle at the top point; ellipses and tiny layers have none', () => {
    const star = add(makeStar, 100, 100);
    const handles = radiusHandles(editor);
    expect(handles).toHaveLength(1);
    expect(handles[0]!.dir.x).toBeCloseTo(0);
    expect(handles[0]!.dir.y).toBeCloseTo(1);
    editor.history.run('r', (tx) => applyDraggedRadius(tx, handles[0]!, 4, true, null));
    expect((editor.doc.getOrThrow(star) as StarNode).cornerRadius).toBe(4);
    add(makeEllipse);
    expect(radiusHandles(editor)).toEqual([]);
    add(makeRectangle, 20, 20);
    expect(radiusHandles(editor)).toEqual([]);
  });
});
