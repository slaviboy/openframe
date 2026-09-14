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
import { createEmptyDocument, keyOnTop, makeFrame } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { flowsOf } from '@/core/prototype/flows';
import { Editor } from '../editor';
import { addFlowStartingPoint, moveFlowStartingPoint, updateFlowStartingPoint } from './prototype';

let editor: Editor;
const flows = () => flowsOf(editor.doc, editor.pageId);

beforeEach(() => {
  const ids = new IdGenerator('f');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const page = editor.pageId;
  editor.history.run('Build', (tx) => {
    const shape = (id: string, parent: string, x: number) => ({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name: id, x, y: 0, width: 40, height: 40 });
    tx.create(makeFrame(shape('home', page, 0)));
    tx.create(makeFrame(shape('cart', page, 100)));
    tx.create(makeFrame(shape('card', 'home', 0)));
  });
  addFlowStartingPoint(editor, 'home');
  updateFlowStartingPoint(editor, 'home', { name: 'Checkout', description: 'Buy it' });
});

describe('moving a flow starting point', () => {
  test('the flow moves to another top-level frame with its name and description, in one undo step', () => {
    expect(moveFlowStartingPoint(editor, 'home', 'cart')).toBe(true);
    expect(flows()).toEqual([{ nodeId: 'cart', name: 'Checkout', description: 'Buy it' }]);
    editor.history.undo();
    expect(flows().map((flow) => flow.nodeId)).toEqual(['home']);
  });

  test('not to a nested frame, its own frame, or a frame starting a flow already', () => {
    expect(moveFlowStartingPoint(editor, 'home', 'card')).toBe(false);
    expect(moveFlowStartingPoint(editor, 'home', 'home')).toBe(false);
    addFlowStartingPoint(editor, 'cart');
    expect(moveFlowStartingPoint(editor, 'home', 'cart')).toBe(false);
    expect(flows().map((flow) => flow.nodeId)).toEqual(['home', 'cart']);
  });
});
