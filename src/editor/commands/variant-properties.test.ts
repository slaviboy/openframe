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
import { componentSetProperties } from '@/core/document/variants';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { deleteVariantProperty, moveVariantProperty, renameVariantProperty, renameVariantValue } from './variants';

let editor: Editor;
let set: string;
let small: string;
let large: string;

const name = (id: string) => (editor.doc.getOrThrow(id) as SceneNode).name;

function component(x: number, componentName: string): string {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Shape', x, y: 0, width: 60, height: 20 }));
    return id;
  });
  editor.state.select([rect]);
  editor.commands.run('object.createComponent');
  const id = editor.selection[0]!;
  editor.history.run('Rename', (tx) => tx.set(id, 'name', componentName));
  return id;
}

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  small = component(0, 'Button/Small/Green');
  large = component(200, 'Button/Large/Green');
  editor.state.select([small, large]);
  editor.commands.run('object.combineAsVariants');
  set = editor.selection[0]!;
});

describe('variant properties', () => {
  test('renaming a property renames it in every variant, as one undo step', () => {
    expect(renameVariantProperty(editor, set, 'Variant', ' Size ')).toBe(true);
    expect([name(small), name(large)]).toEqual(['Size=Small, Property 2=Green', 'Size=Large, Property 2=Green']);
    // Empty names, names with = or , and names of other properties are refused.
    for (const bad of ['', 'A=B', 'A,B', 'Property 2']) expect(renameVariantProperty(editor, set, 'Size', bad)).toBe(false);
    editor.history.undo();
    expect(name(small)).toBe('Variant=Small, Property 2=Green');
  });

  test('changing a value changes it in the variants that have it', () => {
    expect(renameVariantValue(editor, set, 'Variant', 'Large', 'Big')).toBe(true);
    expect([name(small), name(large)]).toEqual(['Variant=Small, Property 2=Green', 'Variant=Big, Property 2=Green']);
    expect(componentSetProperties(editor.doc, set)[0]).toEqual({ name: 'Variant', values: ['Small', 'Big'] });
  });

  test('reordering properties rewrites the variant names in the new order', () => {
    expect(moveVariantProperty(editor, set, 'Property 2', 0)).toBe(true);
    expect(name(large)).toBe('Property 2=Green, Variant=Large');
    expect(componentSetProperties(editor.doc, set).map((p) => p.name)).toEqual(['Property 2', 'Variant']);
  });

  test('deleting a property removes it from the names; deleting the only one deletes the component set', () => {
    expect(deleteVariantProperty(editor, set, 'Property 2')).toBe(true);
    expect(name(large)).toBe('Variant=Large');
    expect(deleteVariantProperty(editor, set, 'Variant')).toBe(true);
    expect(editor.doc.get(set)).toBeUndefined();
    expect(editor.doc.get(small)).toBeUndefined();
    editor.history.undo();
    expect(name(small)).toBe('Variant=Small');
  });
});
