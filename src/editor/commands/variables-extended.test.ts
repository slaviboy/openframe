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
import type { VariableCollectionNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { insertInstance } from './insert-instance';
import {
  addMode,
  bindVariable,
  bindVariantVariable,
  createCollection,
  createVariable,
  deleteCollection,
  deleteMode,
  exportCollectionMode,
  extendCollection,
  importMode,
  renameMode,
  resetVariableOverride,
  setExplicitVariableMode,
  setVariableOverride,
  setVariableValue,
  unbindVariantVariable,
  variantVariablesFor,
} from './variables';
import { instanceVariant, setInstanceVariant } from './variants';

let editor: Editor;

const node = (id: string) => editor.doc.getOrThrow(id) as unknown as Record<string, unknown>;
const collection = (id: string) => editor.doc.getOrThrow(id) as VariableCollectionNode;

/** A main component named `name` wrapping a rectangle at (x, 0). */
function component(x: number, name: string): string {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Shape', x, y: 0, width: 60, height: 20 }));
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
});

describe('extended collections', () => {
  test('mirror the parent modes, override values for layers set to them, and reset to the parent', () => {
    const [frame, rect] = editor.history.run('create', (tx) => {
      const page = editor.pageId;
      const f = editor.ids.next();
      tx.create(makeFrame({ id: f, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Card', x: 0, y: 0, width: 200, height: 200 }));
      const r = editor.ids.next();
      tx.create(makeRectangle({ id: r, parent: { id: f, key: keyOnTop(tx.store, f) }, name: 'Box', x: 10, y: 10, width: 40, height: 40 }));
      return [f, r];
    });
    const brand = createCollection(editor, 'Brand');
    const light = collection(brand).modes[0]!.modeId;
    const dark = addMode(editor, brand, 'Dark')!;
    const radius = createVariable(editor, brand, 'FLOAT', 'radius')!;
    setVariableValue(editor, radius, light, 4);
    setVariableValue(editor, radius, dark, 8);

    const acme = extendCollection(editor, brand)!;
    expect(collection(acme)).toMatchObject({ name: 'Brand extended', extendsCollectionId: brand, modes: collection(brand).modes });
    // Variables and modes come from the parent.
    expect(createVariable(editor, acme, 'FLOAT')).toBeNull();
    expect(addMode(editor, acme)).toBeNull();
    const dim = addMode(editor, brand, 'Dim')!;
    renameMode(editor, brand, light, 'Light');
    expect(collection(acme).modes.map((m) => m.name)).toEqual(['Light', 'Dark', 'Dim']);

    expect(setVariableOverride(editor, acme, radius, dark, 20)).toBe(true);
    expect(setVariableOverride(editor, acme, radius, light, 'x' as unknown as number)).toBe(false);
    expect(setVariableOverride(editor, brand, radius, dark, 20)).toBe(false);
    bindVariable(editor, [rect], 'cornerRadius', radius);
    expect(node(rect).cornerRadius).toBe(4);
    setExplicitVariableMode(editor, [frame], brand, dark);
    expect(node(rect).cornerRadius).toBe(8);
    setExplicitVariableMode(editor, [frame], brand, null);
    setExplicitVariableMode(editor, [frame], acme, dark);
    expect(node(rect).cornerRadius).toBe(20);
    setExplicitVariableMode(editor, [frame], acme, light);
    expect(node(rect).cornerRadius).toBe(4);

    // A value equal to the inherited one isn't an override.
    setVariableOverride(editor, acme, radius, light, 4);
    expect(collection(acme).variableOverrides).toEqual({ [radius]: { [dark]: 20 } });
    setExplicitVariableMode(editor, [frame], acme, dark);
    expect(resetVariableOverride(editor, acme, radius, dark)).toBe(true);
    expect(collection(acme).variableOverrides).toBeUndefined();
    expect(node(rect).cornerRadius).toBe(8);

    expect(importMode(editor, acme, { radius: { $type: 'number', $value: 30 } }, { modeId: dark })).toEqual({ created: 0, updated: 1 });
    expect(node(rect).cornerRadius).toBe(30);
    expect(exportCollectionMode(editor, acme, dark)).toMatchObject({ radius: { $type: 'number', $value: 30 } });
    expect(importMode(editor, acme, {}, { name: 'New' })).toBeNull();

    // Deleting a parent mode removes it, its overrides and the layers' modes set to it; deleting the parent deletes the extension.
    expect(deleteMode(editor, brand, dark)).toBe(true);
    expect(collection(acme).modes.map((m) => m.modeId)).toEqual([light, dim]);
    expect(collection(acme).variableOverrides).toBeUndefined();
    expect(node(frame).explicitVariableModes).toBeUndefined();
    expect(deleteCollection(editor, brand)).toBe(true);
    expect(editor.doc.get(acme)).toBeUndefined();
    editor.history.undo();
    expect(collection(acme).extendsCollectionId).toBe(brand);
  });
});

describe('variables bound to variant properties', () => {
  test('an instance uses the variant its variable selects in its mode; picking a variant by hand detaches the variable', () => {
    const small = component(0, 'Button/Small');
    const large = component(200, 'Button/Large');
    editor.state.select([small, large]);
    editor.commands.run('object.combineAsVariants');
    const instance = insertInstance(editor, small)!;
    expect(instanceVariant(editor, instance)?.variant.id).toBe(small);

    const sizes = createCollection(editor, 'Sizes');
    const compact = collection(sizes).modes[0]!.modeId;
    const roomy = addMode(editor, sizes, 'Roomy')!;
    const size = createVariable(editor, sizes, 'STRING', 'size')!;
    setVariableValue(editor, size, compact, 'Small');
    setVariableValue(editor, size, roomy, 'Large');
    const flag = createVariable(editor, sizes, 'BOOLEAN', 'flag')!;

    expect(variantVariablesFor(editor, instance, 'Variant').map((v) => v.id)).toEqual([size]);
    expect(bindVariantVariable(editor, instance, 'Variant', flag)).toBe(false);
    expect(bindVariantVariable(editor, instance, 'Variant', size)).toBe(true);
    expect(instanceVariant(editor, instance)?.variant.id).toBe(small);

    setExplicitVariableMode(editor, [instance], sizes, roomy);
    expect(instanceVariant(editor, instance)?.variant.id).toBe(large);
    expect(node(instance).boundVariables).toEqual({ 'variant:Variant': { type: 'VARIABLE_ALIAS', id: size } });
    expect(node(instance).explicitVariableModes).toEqual({ [sizes]: roomy });

    setVariableValue(editor, size, roomy, 'Small');
    expect(instanceVariant(editor, instance)?.variant.id).toBe(small);

    expect(setInstanceVariant(editor, instance, 'Variant', 'Large')).toBe(true);
    expect(instanceVariant(editor, instance)?.variant.id).toBe(large);
    expect(node(instance).boundVariables).toBeUndefined();

    expect(bindVariantVariable(editor, instance, 'Variant', size)).toBe(true);
    expect(instanceVariant(editor, instance)?.variant.id).toBe(small);
    expect(unbindVariantVariable(editor, instance, 'Variant')).toBe(true);
    expect(node(instance).boundVariables).toBeUndefined();
    expect(instanceVariant(editor, instance)?.variant.id).toBe(small);
  });
});
