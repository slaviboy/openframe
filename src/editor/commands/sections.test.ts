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
import { canParent } from '@/core/document/containment';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, makeSection, makeSlice } from '@/core/document/factory';
import { assertDocumentInvariants } from '@/core/document/invariants';
import { IdGenerator } from '@/core/ids/ids';
import { hitTestDeepest, isArtboardWithChildren, selectionTarget } from '@/core/scene/hit-test';
import type { Node, SceneNode } from '@/core/schema/document';
import { createClipboardPayload } from '../clipboard/payload';
import { pastePayload } from '../clipboard/paste';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { BUILTIN_COMMANDS } from './builtin';
import { moveLayers } from './layers';
import { SECTION_PADDING } from './structure';

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

type Maker = (init: { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number }) => Node;
function add(make: Maker, x: number, y: number, width: number, height: number, parent = editor.pageId, name = 'Layer'): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(make({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name, x, y, width, height }));
    return id;
  });
}
const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode;
const parentOf = (id: string) => editor.doc.parentOf(id);

beforeEach(() => {
  const ids = new IdGenerator('s');
  const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  editor = new Editor({ doc, ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
});

describe('containment', () => {
  test('sections live on pages or in sections; frames and groups cannot hold them', () => {
    expect(canParent('PAGE', 'SECTION')).toBe(true);
    expect(canParent('SECTION', 'SECTION')).toBe(true);
    expect(canParent('SECTION', 'FRAME')).toBe(true);
    expect(canParent('FRAME', 'SECTION')).toBe(false);
    expect(canParent('GROUP', 'SECTION')).toBe(false);
    expect(canParent('RECTANGLE', 'RECTANGLE')).toBe(false);
    expect(canParent('SLICE', 'RECTANGLE')).toBe(false);
  });

  test('invariants reject a section inside a frame, and layer drops refuse it', () => {
    const frame = add(makeFrame, 0, 0, 300, 300);
    const section = add(makeSection, 400, 0, 100, 100);
    expect(() =>
      editor.history.run('bad', (tx) => {
        tx.set(section, 'parent', { id: frame, key: keyOnTop(editor.doc, frame) });
      }),
    ).toThrow(/cannot be inside a FRAME/);
    expect(parentOf(section)).toBe(editor.pageId);
    const moved = editor.history.run('drop', (tx) => moveLayers(tx, editor.scene, [section], frame, 'inside'));
    expect(moved).toBe(false);
    expect(parentOf(section)).toBe(editor.pageId);
    assertDocumentInvariants(editor.doc);
  });
});

describe('section tool', () => {
  test('Shift+S draws a section that takes in fully covered layers, in one undo step', () => {
    const inside = add(makeRectangle, 120, 120, 40, 40);
    const partial = add(makeRectangle, 280, 120, 80, 40);
    editor.commands.run('tools.section');
    expect(editor.commands.get('tools.section')?.shortcuts).toEqual(['Shift+S']);
    drag(100, 100, 300, 300);
    const section = editor.doc.children(editor.pageId).map(node).find((n) => n.type === 'SECTION')!;
    expect(section.name).toBe('Section 1');
    expect(section.size).toEqual({ width: 200, height: 200 });
    expect(parentOf(inside)).toBe(section.id);
    expect(node(inside).transform.slice(4)).toEqual([20, 20]);
    expect(parentOf(partial)).toBe(editor.pageId);
    expect(editor.state.getSnapshot().tool).toBe('move');
    editor.history.undo();
    expect(editor.doc.has(section.id)).toBe(false);
    expect(parentOf(inside)).toBe(editor.pageId);
    expect(node(inside).transform.slice(4)).toEqual([120, 120]);
  });

  test('sections drawn over a frame are created on the page, not inside the frame', () => {
    const frame = add(makeFrame, 0, 0, 500, 500);
    editor.state.setTool('section');
    drag(50, 50, 150, 150);
    const section = editor.selection[0]!;
    expect(node(section).type).toBe('SECTION');
    expect(parentOf(section)).toBe(editor.pageId);
    expect(parentOf(frame)).toBe(editor.pageId);
  });

  test('shapes drawn inside a section are created in it', () => {
    const section = add(makeSection, 0, 0, 400, 400);
    editor.state.setTool('rectangle');
    drag(50, 50, 100, 100);
    expect(parentOf(editor.selection[0]!)).toBe(section);
  });
});

describe('selecting sections', () => {
  test('clicks go through sections to their content; the empty body of a populated section is marquee space', () => {
    const section = add(makeSection, 0, 0, 400, 400);
    const frame = add(makeFrame, 50, 50, 200, 200, section);
    const rect = add(makeRectangle, 10, 10, 50, 50, frame);
    const deepest = hitTestDeepest(editor.doc, editor.scene, editor.pageId, { x: 70, y: 70 }, { tolerance: 0 })!;
    expect(deepest).toBe(rect);
    // Frames inside sections act as artboards: the click selects the frame's child.
    expect(selectionTarget(editor.doc, editor.pageId, deepest, [], false)).toBe(rect);
    expect(isArtboardWithChildren(editor.doc, editor.pageId, section)).toBe(true);
    const emptyBody = hitTestDeepest(editor.doc, editor.scene, editor.pageId, { x: 350, y: 350 }, { tolerance: 0 })!;
    expect(emptyBody).toBe(section);
  });

  test('the title pill selects a section; dragging it moves the section and adopts covered layers', () => {
    const section = add(makeSection, 100, 100, 200, 200, editor.pageId, 'Hero');
    const loose = add(makeRectangle, 420, 130, 40, 40);
    tools.pointerDown(sample(112, 112));
    expect(editor.selection).toEqual([section]);
    for (let i = 1; i <= 5; i++) tools.pointerMove(sample(112 + 60 * i, 112));
    tools.pointerUp(sample(412, 112));
    expect(node(section).transform.slice(4)).toEqual([400, 100]);
    expect(parentOf(loose)).toBe(section);
    expect(node(loose).transform.slice(4)).toEqual([20, 30]);
    editor.history.undo();
    expect(parentOf(loose)).toBe(editor.pageId);
  });

  test('double-clicking the title starts renaming', () => {
    const section = add(makeSection, 100, 100, 200, 200);
    tools.pointerDown(sample(112, 112));
    tools.pointerUp(sample(112, 112));
    tools.pointerDown(sample(112, 112, { clickCount: 2 }));
    tools.pointerUp(sample(112, 112, { clickCount: 2 }));
    expect(editor.state.getSnapshot().renamingId).toBe(section);
  });

  test('dragging a layer over a section moves it inside; sections are never rotated', () => {
    const section = add(makeSection, 300, 0, 300, 300);
    const rect = add(makeRectangle, 0, 0, 50, 50);
    editor.state.select([rect]);
    drag(25, 25, 425, 125);
    expect(parentOf(rect)).toBe(section);
    editor.state.select([section]);
    editor.commands.run('object.flipHorizontal');
    expect(node(section).transform.slice(0, 4)).toEqual([1, 0, 0, 1]);
  });
});

describe('section commands', () => {
  test('wrap in new section pads the selection; group is unavailable for sections', () => {
    const a = add(makeRectangle, 100, 100, 50, 50);
    const b = add(makeRectangle, 200, 180, 50, 50);
    editor.state.select([a, b]);
    editor.commands.run('object.wrapInSection');
    const created = node(editor.selection[0]!);
    expect(created.type).toBe('SECTION');
    expect(created.transform.slice(4)).toEqual([100 - SECTION_PADDING, 100 - SECTION_PADDING]);
    expect(created.size).toEqual({ width: 150 + SECTION_PADDING * 2, height: 130 + SECTION_PADDING * 2 });
    expect(parentOf(a)).toBe(created.id);
    editor.scene.ensure(editor.pageId);
    expect(editor.scene.worldBounds(a)).toEqual({ x: 100, y: 100, width: 50, height: 50 });
    expect(editor.commands.isEnabled('object.group')).toBe(false);
    expect(editor.commands.isEnabled('object.frameSelection')).toBe(false);
  });

  test('pasting a section into a selected frame places it on the page instead', () => {
    const section = add(makeSection, 0, 0, 100, 100);
    const frame = add(makeFrame, 300, 0, 200, 200);
    editor.state.select([section]);
    const payload = createClipboardPayload(editor)!;
    editor.state.select([frame]);
    const [pasted] = pastePayload(editor, payload);
    expect(node(pasted!).type).toBe('SECTION');
    expect(parentOf(pasted!)).toBe(editor.pageId);
    assertDocumentInvariants(editor.doc);
  });

  test('⌘⌫ removes a section and keeps its contents in place; empty sections are removed', () => {
    const section = add(makeSection, 100, 100, 300, 300);
    const rect = add(makeRectangle, 20, 30, 50, 50, section);
    const empty = add(makeSection, 600, 0, 100, 100);
    editor.state.select([section, empty]);
    expect(editor.commands.get('object.removeSection')?.shortcuts).toEqual(['Mod+Delete']);
    editor.commands.run('object.removeSection');
    expect(editor.doc.has(section)).toBe(false);
    expect(editor.doc.has(empty)).toBe(false);
    expect(parentOf(rect)).toBe(editor.pageId);
    expect(node(rect).transform.slice(4)).toEqual([120, 130]);
    expect(editor.selection).toEqual([rect]);
  });
});

describe('slices', () => {
  test('S draws a slice; painted layers win hit tests over slices', () => {
    expect(editor.commands.get('tools.slice')?.shortcuts).toEqual(['S']);
    const rect = add(makeRectangle, 0, 0, 100, 100);
    const slice = add(makeSlice, 0, 0, 300, 300);
    const hit = (x: number, y: number) => hitTestDeepest(editor.doc, editor.scene, editor.pageId, { x, y }, { tolerance: 0 });
    expect(hit(50, 50)).toBe(rect);
    expect(hit(200, 200)).toBe(slice);
    editor.state.setTool('slice');
    drag(400, 400, 500, 450);
    expect(node(editor.selection[0]!)).toMatchObject({ type: 'SLICE', name: 'Slice 1', size: { width: 100, height: 50 } });
  });
});
