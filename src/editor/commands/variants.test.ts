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
import { canCombineAsVariants } from './variants';

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
