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
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { bindingOwner } from '@/core/document/component-properties';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import {
  applyComponentProperty,
  createComponentProperty,
  deleteComponentProperty,
  instancePropertyValue,
  setComponentPropertyDefault,
  setInstanceProperty,
  setPreferredValues,
} from './component-properties';
import { insertInstance } from './insert-instance';

let editor: Editor;
let a: string;
let other: string;
let third: string;
/** Main component B, wrapping an instance of A; an instance of B and the copy of the nested instance in it. */
let b: string;
let aInB: string;
let bInstance: string;
let nested: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

/** A main component named `name` wrapping a rectangle named Shape at (x, 0). */
function component(x: number, name: string): string {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x, y: 0, width: 20, height: 20 }));
    return id;
  });
  editor.state.select([rect]);
  editor.commands.run('object.createComponent');
  const id = editor.selection[0]!;
  editor.history.run('Rename', (tx) => tx.set(id, 'name', name));
  return id;
}

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  a = component(0, 'A');
  other = component(100, 'Other');
  third = component(200, 'Third');
  aInB = insertInstance(editor, a)!;
  editor.state.select([aInB]);
  editor.commands.run('object.createComponent');
  b = editor.selection[0]!;
  bInstance = insertInstance(editor, b)!;
  [nested] = editor.doc.children(bInstance) as [string];
});

describe('instance swap properties', () => {
  test('are created with a default component, applied to a nested instance, and a new default swaps it everywhere', () => {
    expect(createComponentProperty(editor, b, 'INSTANCE_SWAP', 'Icon', 'e:999')).toBe(false);
    expect(createComponentProperty(editor, b, 'INSTANCE_SWAP', 'Icon', a, { preferredValues: [other, third] })).toBe(true);
    expect(node(b).componentPropertyDefinitions).toEqual({ Icon: { type: 'INSTANCE_SWAP', defaultValue: a, preferredValues: [other, third] } });

    // A nested instance binds to the component it's in; its copies in instances and the component itself can't bind.
    expect(bindingOwner(editor.doc, aInB)?.id).toBe(b);
    expect(bindingOwner(editor.doc, nested)).toBeNull();
    expect(bindingOwner(editor.doc, b)).toBeNull();
    const [shapeInB] = editor.doc.children(aInB) as [string];
    expect(applyComponentProperty(editor, shapeInB, 'INSTANCE_SWAP', 'Icon')).toBe(false);
    expect(applyComponentProperty(editor, nested, 'INSTANCE_SWAP', 'Icon')).toBe(false);
    expect(applyComponentProperty(editor, aInB, 'INSTANCE_SWAP', 'Icon')).toBe(true);
    expect(node(aInB).componentPropertyReferences).toEqual({ mainComponent: 'Icon' });
    expect(node(nested).componentPropertyReferences).toEqual({ mainComponent: 'Icon' });

    expect(setComponentPropertyDefault(editor, b, 'Icon', other)).toBe(true);
    expect(node(aInB)).toMatchObject({ instance: { mainId: other }, componentPropertyReferences: { mainComponent: 'Icon' } });
    expect(node(nested)).toMatchObject({ instance: { mainId: other }, source: aInB, componentPropertyReferences: { mainComponent: 'Icon' } });
    expect(instancePropertyValue(editor, bInstance, 'Icon')).toBe(other);
    editor.history.undo();
    expect(node(nested).instance).toEqual({ mainId: a });
  });

  test('setting the property on an instance swaps its nested instance as its own change, which reset swaps back', () => {
    createComponentProperty(editor, b, 'INSTANCE_SWAP', 'Icon', a);
    applyComponentProperty(editor, aInB, 'INSTANCE_SWAP', 'Icon');
    expect(setInstanceProperty(editor, bInstance, 'Icon', 'e:999')).toBe(false);
    expect(setInstanceProperty(editor, bInstance, 'Icon', third)).toBe(true);
    expect(node(nested)).toMatchObject({ instance: { mainId: third }, source: aInB, componentPropertyReferences: { mainComponent: 'Icon' } });
    expect(node(nested).overrides).toContain('instance');
    expect(node(aInB).instance).toEqual({ mainId: a });
    expect(instancePropertyValue(editor, bInstance, 'Icon')).toBe(third);

    // A new default doesn't swap an instance that chose its own.
    setComponentPropertyDefault(editor, b, 'Icon', other);
    expect(node(nested).instance).toEqual({ mainId: third });

    editor.state.select([bInstance]);
    editor.commands.run('object.resetOverrides');
    expect(node(nested)).toMatchObject({ instance: { mainId: other }, componentPropertyReferences: { mainComponent: 'Icon' } });
    expect(instancePropertyValue(editor, bInstance, 'Icon')).toBe(other);
  });

  test('preferred components can be changed, and deleting the property unbinds the nested instance', () => {
    createComponentProperty(editor, b, 'INSTANCE_SWAP', 'Icon', a);
    applyComponentProperty(editor, aInB, 'INSTANCE_SWAP', 'Icon');
    expect(setPreferredValues(editor, b, 'Icon', [third])).toBe(true);
    expect(node(b).componentPropertyDefinitions).toEqual({ Icon: { type: 'INSTANCE_SWAP', defaultValue: a, preferredValues: [third] } });
    expect(setPreferredValues(editor, b, 'Icon', ['e:999'])).toBe(false);
    expect(setPreferredValues(editor, b, 'Icon', [])).toBe(true);
    expect(node(b).componentPropertyDefinitions).toEqual({ Icon: { type: 'INSTANCE_SWAP', defaultValue: a } });

    expect(deleteComponentProperty(editor, b, 'Icon')).toBe(true);
    expect(node(aInB).componentPropertyReferences).toBeUndefined();
    expect(node(aInB).instance).toEqual({ mainId: a });
  });
});
