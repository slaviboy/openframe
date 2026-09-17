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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { FrameNode, Node, PageNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { rulerAt } from './guides';

let editor: Editor;
let tools: ToolManager;

const sample = (x: number, y: number, over: Partial<PointerInfo> = {}): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift: false,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
  ...over,
});

function drag(x0: number, y0: number, x1: number, y1: number, over: Partial<PointerInfo> = {}) {
  tools.pointerDown(sample(x0, y0, over));
  for (let i = 1; i <= 5; i++) tools.pointerMove(sample(x0 + ((x1 - x0) * i) / 5, y0 + ((y1 - y0) * i) / 5, over));
  tools.pointerUp(sample(x1, y1, over));
}

const pageGuides = () => (editor.doc.getOrThrow(editor.pageId) as PageNode).guides;

function add(
  make: (init: { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number }) => Node,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(make({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'L', x, y, width: w, height: h }));
    return id;
  });
}

beforeEach(() => {
  const ids = new IdGenerator('g');
  const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  editor = new Editor({ doc, ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  editor.setCanvasInsets({ left: 300, right: 0, top: 0, bottom: 0 });
  tools = new ToolManager(editor);
  tools.setRulersVisible(true);
});

describe('rulers', () => {
  test('ruler bands start at the canvas insets; the corner square belongs to neither', () => {
    expect(rulerAt(editor, { x: 400, y: 10 })).toBe('top');
    expect(rulerAt(editor, { x: 310, y: 300 })).toBe('left');
    expect(rulerAt(editor, { x: 310, y: 10 })).toBeNull();
    expect(rulerAt(editor, { x: 200, y: 10 })).toBeNull();
    expect(rulerAt(editor, { x: 400, y: 300 })).toBeNull();
  });
});

describe('ruler guides', () => {
  test('drag from the top ruler adds a horizontal page guide in one undo step', () => {
    drag(500, 10, 500, 200);
    expect(pageGuides()).toEqual([{ axis: 'Y', offset: 200 }]);
    expect(editor.state.getSnapshot().selectedGuide).toEqual({ owner: editor.pageId, index: 0 });
    editor.history.undo();
    expect(pageGuides()).toBeUndefined();
    expect(editor.state.getSnapshot().selectedGuide).toBeNull();
  });

  test('move, ⌥-copy and drag back to the ruler to remove', () => {
    drag(310, 300, 450, 300);
    expect(pageGuides()).toEqual([{ axis: 'X', offset: 450 }]);
    drag(450, 400, 460, 400);
    expect(pageGuides()).toEqual([{ axis: 'X', offset: 460 }]);
    drag(460, 500, 600, 500, { alt: true });
    expect(pageGuides()).toEqual([
      { axis: 'X', offset: 460 },
      { axis: 'X', offset: 600 },
    ]);
    drag(600, 600, 310, 600);
    expect(pageGuides()).toEqual([{ axis: 'X', offset: 460 }]);
    editor.history.undo();
    expect(pageGuides()).toHaveLength(2);
  });

  test('a new guide dropped over a frame becomes a frame guide in the frame’s local space', () => {
    const frame = add(makeFrame, 400, 100, 400, 400);
    drag(600, 10, 600, 150);
    expect(pageGuides()).toBeUndefined();
    expect((editor.doc.getOrThrow(frame) as FrameNode).guides).toEqual([{ axis: 'Y', offset: 50 }]);
    expect(editor.state.getSnapshot().selectedGuide).toEqual({ owner: frame, index: 0 });
  });

  test('guides snap to layer edges unless Control is held', () => {
    add(makeRectangle, 400, 0, 100, 100);
    drag(310, 300, 503, 300);
    expect(pageGuides()).toEqual([{ axis: 'X', offset: 500 }]);
    drag(310, 300, 703, 300);
    drag(310, 300, 503, 300, { ctrl: true });
    expect(pageGuides()!.map((g) => g.offset)).toEqual([500, 703, 503]);
  });

  test('click selects a guide, Delete removes it, and layer selection replaces guide selection', () => {
    drag(500, 10, 500, 200);
    editor.state.clearSelection();
    tools.pointerDown(sample(700, 200));
    tools.pointerUp(sample(700, 200));
    expect(editor.state.getSnapshot().selectedGuide).toEqual({ owner: editor.pageId, index: 0 });
    const rect = add(makeRectangle, 400, 400, 50, 50);
    editor.state.select([rect]);
    expect(editor.state.getSnapshot().selectedGuide).toBeNull();
    editor.state.selectGuide({ owner: editor.pageId, index: 0 });
    expect(editor.selection).toEqual([]);
    editor.commands.run('edit.delete');
    expect(pageGuides()).toBeUndefined();
    expect(editor.doc.has(rect)).toBe(true);
  });

  test('hidden rulers disable guide gestures', () => {
    tools.setRulersVisible(false);
    drag(500, 10, 500, 200);
    expect(pageGuides()).toBeUndefined();
  });
});

describe('guides as something to design against', () => {
  test('a layer being moved snaps to a page guide', () => {
    drag(310, 300, 500, 300);
    const rect = add(makeRectangle, 200, 300, 100, 100);
    editor.state.select([rect]);
    // Left edge lands on 497, three short of the guide, so it takes the guide.
    drag(250, 350, 547, 350);
    expect(editor.scene.worldBounds(rect)!.x).toBe(500);
  });

  test('Control while moving keeps the layer off the guide', () => {
    drag(310, 300, 500, 300);
    const rect = add(makeRectangle, 200, 300, 100, 100);
    editor.state.select([rect]);
    drag(250, 350, 547, 350, { ctrl: true });
    expect(editor.scene.worldBounds(rect)!.x).toBe(497);
  });

  test('a layer inside a frame snaps to that frame’s own guide', () => {
    const frame = add(makeFrame, 400, 100, 400, 400);
    drag(600, 10, 600, 150);
    expect((editor.doc.getOrThrow(frame) as FrameNode).guides).toEqual([{ axis: 'Y', offset: 50 }]);
    const rect = editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: frame, key: keyOnTop(editor.doc, frame) }, name: 'R', x: 0, y: 100, width: 50, height: 50 }));
      return id;
    });
    editor.state.select([rect]);
    // The frame guide runs across the world at y = 150; the layer's top edge is dragged to within three of it.
    drag(425, 225, 425, 178);
    expect(editor.scene.worldBounds(rect)!.y).toBe(150);
  });

  test('⌥ over a guide measures the selection’s distance to it', () => {
    drag(310, 300, 700, 300);
    const rect = add(makeRectangle, 200, 300, 100, 100);
    editor.state.select([rect]);
    tools.pointerMove(sample(700, 350, { alt: true }));
    expect(tools.moveTool.measurements).toEqual([{ from: { x: 300, y: 350 }, to: { x: 700, y: 350 }, distance: 400, axis: 'x' }]);
  });

  test('⌥ over a guide crossing the selection measures to both its edges', () => {
    drag(310, 300, 250, 300);
    const rect = add(makeRectangle, 200, 300, 100, 100);
    editor.state.select([rect]);
    tools.pointerMove(sample(250, 350, { alt: true }));
    expect(tools.moveTool.measurements.map((line) => line.distance)).toEqual([50, 50]);
  });
});
