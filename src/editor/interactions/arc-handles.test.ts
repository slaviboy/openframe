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
import { createEmptyDocument, keyOnTop, makeEllipse } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { arcHandles } from './arc-handles';

let editor: Editor;
let tools: ToolManager;
let id: string;

const sample = (x: number, y: number): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift: false,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
});
const drag = (from: [number, number], to: [number, number]) => {
  tools.pointerDown(sample(...from));
  tools.pointerMove(sample(...to));
  tools.pointerUp(sample(...to));
};
const arc = () => (editor.doc.getOrThrow(id) as Extract<SceneNode, { type: 'ELLIPSE' }>).arcData;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  tools = new ToolManager(editor);
  id = editor.history.run('create', (tx) => {
    const ellipseId = editor.ids.next();
    tx.create(makeEllipse({ id: ellipseId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Ellipse', x: 0, y: 0, width: 200, height: 200 }));
    return ellipseId;
  });
  editor.state.select([id]);
});

describe('arc handles', () => {
  test('a plain ellipse has one sweep handle inside its right-hand point; dragging it up fills three quarters clockwise', () => {
    const handles = arcHandles(editor);
    expect(handles.map((h) => h.kind)).toEqual(['sweep']);
    expect(handles[0]!.local.x).toBeCloseTo(188);
    expect(handles[0]!.local.y).toBeCloseTo(100);

    drag([188, 100], [100, 12]);
    expect(arc()!.startingAngle).toBe(0);
    expect(arc()!.endingAngle).toBeCloseTo(1.5 * Math.PI);
    expect(arc()!.innerRadius).toBe(0);
    expect(arcHandles(editor).map((h) => h.kind)).toEqual(['sweep', 'start', 'ratio']);
    editor.history.undo();
    expect(arc()).toBeUndefined();
  });

  test('dragging the sweep handle down makes a negative sweep', () => {
    drag([188, 100], [100, 188]);
    expect(arc()!.endingAngle).toBeCloseTo(-1.5 * Math.PI);
  });

  test('the ratio handle hollows the arc into a ring and the start handle turns it', () => {
    drag([188, 100], [100, 12]);
    // The ratio handle starts at the center: dragging it halfway out makes a 50% ring.
    drag([100, 100], [150, 100]);
    expect(arc()!.innerRadius).toBe(0.5);
    // The start handle sits inside the start point on the right; a quarter turn clockwise moves the whole arc.
    drag([188, 100], [100, 188]);
    expect(arc()!.startingAngle).toBeCloseTo(Math.PI / 2);
    expect(arc()!.endingAngle).toBeCloseTo(2 * Math.PI);
  });
});
