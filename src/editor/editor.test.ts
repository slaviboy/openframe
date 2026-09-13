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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { EditorStore } from './stores/editor-store';
import { fitRect, nextZoomStep, screenToWorld, worldToScreen, zoomAt } from './viewport/viewport';

describe('viewport', () => {
  test('screen/world round trip', () => {
    const v = { x: 100, y: -50, zoom: 2.5 };
    const p = worldToScreen(v, screenToWorld(v, { x: 33, y: 71 }));
    expect(p.x).toBeCloseTo(33);
    expect(p.y).toBeCloseTo(71);
  });

  test('zoomAt keeps the point under the cursor fixed', () => {
    const v = { x: 10, y: 20, zoom: 1 };
    const cursor = { x: 300, y: 200 };
    const before = screenToWorld(v, cursor);
    const after = screenToWorld(zoomAt(v, cursor, 4), cursor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test('zoom steps', () => {
    expect(nextZoomStep(1, 1)).toBe(2);
    expect(nextZoomStep(1, -1)).toBe(0.5);
    expect(nextZoomStep(0.7, 1)).toBe(1);
  });

  test('fitRect centers and scales target', () => {
    const v = fitRect({ x: 0, y: 0, width: 1000, height: 500 }, 1200, 700, 100);
    expect(v.zoom).toBeCloseTo(1);
    const center = screenToWorld(v, { x: 600, y: 350 });
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(250);
  });
});

describe('EditorStore', () => {
  const setup = () => {
    const ids = new IdGenerator('e');
    const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = doc.pages()[0]!;
    const frame = makeFrame({ id: ids.next(), parent: { id: page, key: keyOnTop(doc, page) }, name: 'F', x: 0, y: 0, width: 100, height: 100 });
    doc.applyOp({ kind: 'create', node: frame });
    const rect = makeRectangle({ id: ids.next(), parent: { id: frame.id, key: 'V' }, name: 'R', x: 0, y: 0, width: 1, height: 1 });
    doc.applyOp({ kind: 'create', node: rect });
    return { doc, page, frame: frame.id, rect: rect.id, editor: new EditorStore(doc, page) };
  };

  test('selection drops descendants of selected ancestors and reveals layers', () => {
    const { editor, frame, rect } = setup();
    editor.select([rect]);
    expect(editor.getSnapshot().expanded.has(frame)).toBe(true);
    editor.select([rect, frame]);
    expect(editor.selection).toEqual([frame]);
  });

  test('pages cannot be selected; toggle works', () => {
    const { editor, page, rect } = setup();
    editor.select([page]);
    expect(editor.selection).toEqual([]);
    editor.toggleSelection(rect);
    editor.toggleSelection(rect);
    expect(editor.selection).toEqual([]);
  });

  test('spring tool returns to previous tool', () => {
    const { editor } = setup();
    editor.setTool('rectangle');
    editor.springTool('hand');
    expect(editor.getSnapshot().tool).toBe('hand');
    editor.releaseSpring();
    expect(editor.getSnapshot().tool).toBe('rectangle');
  });

  test('snapshot identity changes only on real change', () => {
    const { editor } = setup();
    const a = editor.getSnapshot();
    editor.setHover(null);
    expect(editor.getSnapshot()).toBe(a);
    editor.setHover('e:1');
    expect(editor.getSnapshot()).not.toBe(a);
  });

  test('pruneSelection removes deleted nodes', () => {
    const { editor, doc, rect } = setup();
    editor.select([rect]);
    doc.applyOp({ kind: 'delete', node: doc.getOrThrow(rect) });
    editor.pruneSelection();
    expect(editor.selection).toEqual([]);
  });
});
