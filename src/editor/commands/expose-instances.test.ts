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
import { exposableInstances, exposedInstances } from '@/core/document/component-properties';
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { applyComponentProperty, createComponentProperty, setExposedInstance, setInstanceProperty } from './component-properties';
import { insertInstance } from './insert-instance';
import { swapInstanceFor } from './swap-instance';

let editor: Editor;
/** A has a boolean property bound to its rectangle; Plain has none. B wraps an instance of each. */
let a: string;
let plain: string;
let b: string;
let aInB: string;
let plainInB: string;
let bInstance: string;
let nestedA: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

/** A main component named `name` wrapping a rectangle at (x, 0); returns the component and the rectangle. */
function component(x: number, name: string): [string, string] {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x, y: 0, width: 20, height: 20 }));
    return id;
  });
  editor.state.select([rect]);
  editor.commands.run('object.createComponent');
  const id = editor.selection[0]!;
  editor.history.run('Rename', (tx) => tx.set(id, 'name', name));
  return [id, rect];
}

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  let rect: string;
  [a, rect] = component(0, 'A');
  createComponentProperty(editor, a, 'BOOLEAN', 'Show', true);
  applyComponentProperty(editor, rect, 'BOOLEAN', 'Show');
  [plain] = component(100, 'Plain');
  aInB = insertInstance(editor, a)!;
  plainInB = insertInstance(editor, plain)!;
  editor.state.select([aInB, plainInB]);
  editor.commands.run('object.createComponent');
  b = editor.selection[0]!;
  bInstance = insertInstance(editor, b)!;
  nestedA = editor.doc.children(bInstance).find((id) => node(id).source === aInB)!;
});

describe('exposing nested instances', () => {
  test('a nested instance whose component has properties is exposed, and instances show it', () => {
    expect(exposableInstances(editor.doc, node(b)).map((instance) => instance.id)).toEqual([aInB]);
    expect(setExposedInstance(editor, plainInB, true)).toBe(false);
    expect(setExposedInstance(editor, aInB, true)).toBe(true);
    expect(node(aInB).isExposedInstance).toBe(true);
    expect(node(nestedA).isExposedInstance).toBe(true);
    expect(exposedInstances(editor.doc, bInstance).map((instance) => instance.id)).toEqual([nestedA]);

    // The exposed instance's properties are set on it from the outer instance.
    expect(setInstanceProperty(editor, nestedA, 'Show', false)).toBe(true);
    const [nestedRect] = editor.doc.children(nestedA) as [string];
    expect(node(nestedRect).visible).toBe(false);

    expect(setExposedInstance(editor, aInB, false)).toBe(true);
    expect(node(aInB).isExposedInstance).toBeUndefined();
    expect(exposedInstances(editor.doc, bInstance)).toEqual([]);
    editor.history.undo();
    expect(exposedInstances(editor.doc, bInstance).map((instance) => instance.id)).toEqual([nestedA]);
  });

  test('a swapped exposed instance stays exposed', () => {
    const [other] = component(300, 'Other');
    createComponentProperty(editor, other, 'TEXT', 'Label', 'Hi');
    setExposedInstance(editor, aInB, true);
    expect(swapInstanceFor(editor, aInB, other)).toBe(true);
    expect(node(aInB)).toMatchObject({ instance: { mainId: other }, isExposedInstance: true });
    expect(exposedInstances(editor.doc, bInstance).map((instance) => instance.id)).toEqual([nestedA]);
  });
});
