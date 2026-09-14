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
import { componentSetProperties, defaultVariant, variantErrors } from '@/core/document/variants';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { insertInstance, localComponents } from './insert-instance';
import { canCombineAsVariants, instanceVariant, setInstanceVariant } from './variants';

let editor: Editor;
let primary: string;
let secondary: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

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
  primary = component(0, 'Button/Primary/Large');
  secondary = component(200, 'Button/Secondary/Large');
});

describe('combine as variants', () => {
  test('puts the selected components in a component set named from their slash names, keeping their layout', () => {
    editor.state.select([primary]);
    expect(canCombineAsVariants(editor)).toBe(false);
    editor.state.select([primary, secondary]);
    expect(canCombineAsVariants(editor)).toBe(true);
    editor.commands.run('object.combineAsVariants');

    const set = node(editor.selection[0]!);
    expect(set).toMatchObject({ type: 'FRAME', name: 'Button', fills: [], componentSet: {}, strokeDashes: [10, 5], size: { width: 260, height: 20 } });
    expect(editor.doc.children(set.id)).toEqual([primary, secondary]);
    expect(node(primary)).toMatchObject({ name: 'Variant=Primary, Property 2=Large', transform: [1, 0, 0, 1, 0, 0], component: {} });
    expect(node(secondary)).toMatchObject({ name: 'Variant=Secondary, Property 2=Large', transform: [1, 0, 0, 1, 200, 0] });
    expect(componentSetProperties(editor.doc, set.id)).toEqual([
      { name: 'Variant', values: ['Primary', 'Secondary'] },
      { name: 'Property 2', values: ['Large'] },
    ]);
    expect(defaultVariant(editor.doc, set.id)?.id).toBe(primary);
    expect(variantErrors(editor.doc, set.id)).toEqual({ conflicted: [], corrupted: [] });

    // Components already in a component set can't be combined again.
    editor.state.select([primary, secondary]);
    expect(canCombineAsVariants(editor)).toBe(false);

    editor.history.undo();
    expect(node(primary)).toMatchObject({ name: 'Button/Primary/Large', parent: { id: editor.pageId } });
    expect(editor.doc.get(set.id)).toBeUndefined();
  });

  test('variants with the same combination of values conflict, and names without the syntax are corrupted', () => {
    editor.state.select([primary, secondary]);
    editor.commands.run('object.combineAsVariants');
    const set = editor.selection[0]!;
    editor.history.run('Rename', (tx) => tx.set(secondary, 'name', 'Property 2=Large, Variant=Primary'));
    expect(variantErrors(editor.doc, set)).toEqual({ conflicted: [primary, secondary], corrupted: [] });
    editor.history.run('Rename', (tx) => tx.set(secondary, 'name', 'Secondary'));
    expect(variantErrors(editor.doc, set)).toEqual({ conflicted: [], corrupted: [secondary] });
  });

  test('only main components can be combined', () => {
    const rect = editor.history.run('create', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 100, width: 10, height: 10 }));
      return id;
    });
    editor.state.select([primary, rect]);
    expect(canCombineAsVariants(editor)).toBe(false);
  });
});

describe('configure an instance variant', () => {
  test('choosing a property value swaps the instance for that variant, named after the set, keeping its position', () => {
    editor.state.select([primary, secondary]);
    editor.commands.run('object.combineAsVariants');
    const set = editor.selection[0]!;
    const instance = insertInstance(editor, primary)!;
    editor.history.run('Move', (tx) => tx.set(instance, 'transform', [1, 0, 0, 1, 0, 300]));
    expect(instanceVariant(editor, instance)).toMatchObject({ set: { id: set }, variant: { id: primary } });
    expect(node(instance).name).toBe('Button');

    expect(setInstanceVariant(editor, instance, 'Variant', 'Secondary')).toBe(true);
    expect(node(instance)).toMatchObject({ name: 'Button', instance: { mainId: secondary }, transform: [1, 0, 0, 1, 0, 300] });
    expect(node(instance).overrides).toBeUndefined();
    // No variant has this value: nothing changes.
    expect(setInstanceVariant(editor, instance, 'Property 2', 'Small')).toBe(false);
    editor.history.undo();
    expect(node(instance).instance).toEqual({ mainId: primary });

    // Without a variant for the exact combination, the closest one with the chosen value is used.
    editor.history.run('Rename', (tx) => tx.set(secondary, 'name', 'Variant=Secondary, Property 2=Small'));
    expect(setInstanceVariant(editor, instance, 'Variant', 'Secondary')).toBe(true);
    expect(node(instance).instance).toEqual({ mainId: secondary });
  });

  test('renaming the component set renames its instances, unless they were renamed', () => {
    editor.state.select([primary, secondary]);
    editor.commands.run('object.combineAsVariants');
    const set = editor.selection[0]!;
    const instance = insertInstance(editor, primary)!;
    const renamed = insertInstance(editor, secondary)!;
    editor.history.run('Rename', (tx) => tx.set(renamed, 'name', 'My button'));
    expect(node(renamed).overrides).toEqual(['name']);
    editor.history.run('Rename set', (tx) => tx.set(set, 'name', 'CTA'));
    expect(node(instance).name).toBe('CTA');
    expect(node(renamed).name).toBe('My button');
    // Renaming a variant doesn't rename instances, and reset all changes goes back to the set's name.
    editor.history.run('Rename variant', (tx) => tx.set(primary, 'name', 'Variant=Main, Property 2=Large'));
    expect(node(instance).name).toBe('CTA');
    editor.state.select([renamed]);
    editor.commands.run('object.resetOverrides');
    expect(node(renamed)).toMatchObject({ name: 'CTA' });
    expect(node(renamed).overrides).toBeUndefined();
  });
});

describe('variants in a component set', () => {
  test('⌘D on a variant adds a variant to the set instead of making an instance', () => {
    editor.state.select([primary, secondary]);
    editor.commands.run('object.combineAsVariants');
    const set = editor.selection[0]!;
    editor.state.select([secondary]);
    editor.commands.run('edit.duplicate');
    const copy = editor.selection[0]!;
    expect(copy).not.toBe(secondary);
    expect(editor.doc.parentOf(copy)).toBe(set);
    expect(node(copy)).toMatchObject({ name: node(secondary).name, component: {} });
    expect(node(copy).instance).toBeUndefined();
    expect(editor.doc.children(copy)).toHaveLength(1);
  });

  test('a component set is listed once, by its default variant and the set name', () => {
    const lone = component(0, 'Card');
    editor.history.run('Move', (tx) => tx.set(lone, 'transform', [1, 0, 0, 1, 0, 400]));
    editor.state.select([primary, secondary]);
    editor.commands.run('object.combineAsVariants');
    expect(localComponents(editor).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: primary, name: 'Button' },
      { id: lone, name: 'Card' },
    ]);
  });
});
