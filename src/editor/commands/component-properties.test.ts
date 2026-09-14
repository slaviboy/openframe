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
import { createEmptyDocument, keyOnTop, makeRectangle, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import {
  applyComponentProperty,
  createComponentProperty,
  deleteComponentProperty,
  instancePropertyValue,
  renameComponentProperty,
  setComponentPropertyDefault,
  setInstanceProperty,
} from './component-properties';
import { insertInstance } from './insert-instance';

let editor: Editor;
let main: string;
let icon: string;
let label: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  [icon, label] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const iconId = editor.ids.next();
    tx.create(makeRectangle({ id: iconId, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Icon', x: 0, y: 0, width: 20, height: 20 }));
    const labelId = editor.ids.next();
    tx.create(makeText({ id: labelId, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Label', x: 30, y: 0, width: 60, height: 20 }));
    tx.set(labelId, 'characters', 'Buy');
    return [iconId, labelId];
  });
  editor.state.select([icon, label]);
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
});

describe('component properties', () => {
  test('a boolean property drives the visibility of its layers in the component and its instances', () => {
    expect(createComponentProperty(editor, main, 'BOOLEAN', 'Show icon', true)).toBe(true);
    // Names are unique, and a layer that isn't a component can't have properties.
    expect(createComponentProperty(editor, main, 'TEXT', ' Show icon ', 'x')).toBe(false);
    expect(createComponentProperty(editor, icon, 'BOOLEAN', 'Other', true)).toBe(false);
    expect(applyComponentProperty(editor, icon, 'BOOLEAN', 'Show icon')).toBe(true);
    expect(node(icon).componentPropertyReferences).toEqual({ visible: 'Show icon' });

    const instance = insertInstance(editor, main)!;
    const instanceIcon = editor.doc.children(instance)[0]!;
    expect(node(instanceIcon).componentPropertyReferences).toEqual({ visible: 'Show icon' });
    // Layers of instances can't be bound to properties.
    expect(applyComponentProperty(editor, instanceIcon, 'BOOLEAN', 'Show icon')).toBe(false);

    expect(setComponentPropertyDefault(editor, main, 'Show icon', false)).toBe(true);
    expect(node(icon).visible).toBe(false);
    expect(node(instanceIcon).visible).toBe(false);
    expect(instancePropertyValue(editor, instance, 'Show icon')).toBe(false);

    expect(setInstanceProperty(editor, instance, 'Show icon', true)).toBe(true);
    expect(node(instanceIcon)).toMatchObject({ visible: true, overrides: ['visible'] });
    expect(node(icon).visible).toBe(false);
    editor.history.undo();
    expect(node(instanceIcon).visible).toBe(false);
  });

  test('a text property sets the text of text layers; instances keep their own text when the default changes', () => {
    expect(createComponentProperty(editor, main, 'TEXT', 'Label', 'Buy now')).toBe(true);
    expect(applyComponentProperty(editor, icon, 'TEXT', 'Label')).toBe(false);
    expect(applyComponentProperty(editor, label, 'BOOLEAN', 'Label')).toBe(false);
    expect(applyComponentProperty(editor, label, 'TEXT', 'Label')).toBe(true);
    expect(node(label).characters).toBe('Buy now');

    const instance = insertInstance(editor, main)!;
    const instanceLabel = editor.doc.children(instance)[1]!;
    expect(setInstanceProperty(editor, instance, 'Label', 'Sell')).toBe(true);
    expect(setComponentPropertyDefault(editor, main, 'Label', 'Go')).toBe(true);
    expect(node(label).characters).toBe('Go');
    expect(node(instanceLabel).characters).toBe('Sell');
    expect(instancePropertyValue(editor, instance, 'Label')).toBe('Sell');

    editor.state.select([instance]);
    editor.commands.run('object.resetOverrides');
    expect(node(instanceLabel).characters).toBe('Go');
  });

  test('renaming and deleting a property update the layers bound to it', () => {
    createComponentProperty(editor, main, 'BOOLEAN', 'Icon', true);
    createComponentProperty(editor, main, 'TEXT', 'Text', 'Buy');
    applyComponentProperty(editor, icon, 'BOOLEAN', 'Icon');
    expect(renameComponentProperty(editor, main, 'Icon', 'Text')).toBe(false);
    expect(renameComponentProperty(editor, main, 'Icon', 'Has icon')).toBe(true);
    expect(Object.keys(node(main).componentPropertyDefinitions as object)).toEqual(['Has icon', 'Text']);
    expect(node(icon).componentPropertyReferences).toEqual({ visible: 'Has icon' });

    expect(deleteComponentProperty(editor, main, 'Has icon')).toBe(true);
    expect(Object.keys(node(main).componentPropertyDefinitions as object)).toEqual(['Text']);
    expect(node(icon).componentPropertyReferences).toBeUndefined();
    editor.history.undo();
    expect(node(icon).componentPropertyReferences).toEqual({ visible: 'Has icon' });
  });
});
