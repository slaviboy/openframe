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
import { createEmptyDocument, keyOnTop, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { FrameNode, TextNode, VariableCollectionNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import {
  applyComponentProperty,
  bindPropertyDefaultVariable,
  createComponentProperty,
  propertyDefaultVariables,
  setComponentPropertyDefault,
  unbindPropertyDefaultVariable,
} from './component-properties';
import { insertInstance } from './insert-instance';
import { addMode, createCollection, createVariable, deleteVariables, setExplicitVariableMode, setVariableValue } from './variables';

let editor: Editor;

const definition = (ownerId: string, name: string) => (editor.doc.getOrThrow(ownerId) as FrameNode).componentPropertyDefinitions![name]!;
const text = (id: string) => (editor.doc.getOrThrow(id) as TextNode).characters;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
});

describe('variables applied to component properties', () => {
  test("a text property's default follows a string variable in the component's modes, reaching instances; editing the default detaches it", () => {
    const layer = editor.history.run('create', (tx) => {
      const id = editor.ids.next();
      tx.create(makeText({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Label', x: 0, y: 0, width: 120, height: 24 }));
      tx.set(id, 'characters', 'Buy');
      return id;
    });
    editor.state.select([layer]);
    editor.commands.run('object.createComponent');
    const main = editor.selection[0]!;
    const [label] = editor.doc.children(main) as [string];
    expect(createComponentProperty(editor, main, 'TEXT', 'Label', 'Buy')).toBe(true);
    expect(applyComponentProperty(editor, label, 'TEXT', 'Label')).toBe(true);
    const instance = insertInstance(editor, main)!;
    const [copy] = editor.doc.children(instance) as [string];

    const strings = createCollection(editor, 'Copy');
    const english = (editor.doc.getOrThrow(strings) as VariableCollectionNode).modes[0]!.modeId;
    const french = addMode(editor, strings, 'French')!;
    const cta = createVariable(editor, strings, 'STRING', 'cta')!;
    setVariableValue(editor, cta, english, 'Buy now');
    setVariableValue(editor, cta, french, 'Acheter');
    const flag = createVariable(editor, strings, 'BOOLEAN', 'flag')!;

    expect(propertyDefaultVariables(editor, main, 'Label').map((v) => v.id)).toEqual([cta]);
    expect(bindPropertyDefaultVariable(editor, main, 'Label', flag)).toBe(false);
    expect(bindPropertyDefaultVariable(editor, main, 'Label', cta)).toBe(true);
    expect(definition(main, 'Label')).toMatchObject({ defaultValue: 'Buy now', boundVariables: { defaultValue: { type: 'VARIABLE_ALIAS', id: cta } } });
    expect(text(label)).toBe('Buy now');
    expect(text(copy)).toBe('Buy now');

    setExplicitVariableMode(editor, [main], strings, french);
    expect(text(label)).toBe('Acheter');
    expect(text(copy)).toBe('Acheter');
    setVariableValue(editor, cta, french, 'Commander');
    expect(text(copy)).toBe('Commander');

    // Editing the default by hand detaches the variable.
    expect(setComponentPropertyDefault(editor, main, 'Label', 'Order')).toBe(true);
    expect(definition(main, 'Label')).toEqual({ type: 'TEXT', defaultValue: 'Order' });
    expect(text(copy)).toBe('Order');

    expect(bindPropertyDefaultVariable(editor, main, 'Label', cta)).toBe(true);
    expect(unbindPropertyDefaultVariable(editor, main, 'Label')).toBe(true);
    expect(definition(main, 'Label')).toEqual({ type: 'TEXT', defaultValue: 'Commander' });

    // Deleting a bound variable removes the binding and keeps the default.
    expect(bindPropertyDefaultVariable(editor, main, 'Label', cta)).toBe(true);
    expect(deleteVariables(editor, [cta])).toBe(true);
    expect(definition(main, 'Label')).toEqual({ type: 'TEXT', defaultValue: 'Commander' });
  });
});
