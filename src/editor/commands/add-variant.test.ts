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
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { canAddVariant } from './variants';

let editor: Editor;
let primary: string;
let secondary: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

/** A 60×20 main component named `name` at (x, y). */
function component(x: number, y: number, name: string): string {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Shape', x, y, width: 60, height: 20 }));
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
  primary = component(0, 0, 'Button/Primary');
  secondary = component(200, 0, 'Button/Secondary');
});

describe('add variant', () => {
  test('on a component set, copies the bottom variant below the others and grows the set, as one undo step', () => {
    editor.state.select([primary, secondary]);
    editor.commands.run('object.combineAsVariants');
    const set = editor.selection[0]!;
    expect(canAddVariant(editor)).toBe(true);
    editor.commands.run('object.addVariant');

    const copy = editor.selection[0]!;
    expect(editor.doc.parentOf(copy)).toBe(set);
    expect(editor.doc.children(set)).toHaveLength(3);
    expect(node(copy)).toMatchObject({ name: 'Variant=Secondary', component: {}, transform: [1, 0, 0, 1, 200, 40] });
    expect(node(copy).instance).toBeUndefined();
    expect(node(set).size).toEqual({ width: 260, height: 60 });

    // With a variant selected, that variant is copied to the bottom of the set.
    editor.state.select([primary]);
    editor.commands.run('object.addVariant');
    expect(node(editor.selection[0]!)).toMatchObject({ name: 'Variant=Primary', transform: [1, 0, 0, 1, 0, 80] });
    expect(node(set).size).toEqual({ width: 260, height: 100 });

    editor.history.undo();
    editor.history.undo();
    expect(editor.doc.children(set)).toEqual([primary, secondary]);
    expect(node(set).size).toEqual({ width: 260, height: 20 });
  });

  test('on a main component on its own, makes an identical component below it and puts both in a new component set', () => {
    const card = component(500, 100, 'Card');
    editor.state.select([card]);
    editor.commands.run('object.addVariant');

    const copy = editor.selection[0]!;
    const set = editor.doc.parentOf(copy)!;
    expect(node(set)).toMatchObject({ name: 'Card', componentSet: {}, fills: [], transform: [1, 0, 0, 1, 500, 100], size: { width: 60, height: 60 } });
    expect(editor.doc.children(set)).toEqual([card, copy]);
    expect(node(card)).toMatchObject({ name: 'Variant=Card', transform: [1, 0, 0, 1, 0, 0] });
    expect(node(copy)).toMatchObject({ name: 'Variant=Card', component: {}, transform: [1, 0, 0, 1, 0, 40] });

    editor.history.undo();
    expect(node(card)).toMatchObject({ name: 'Card', parent: { id: editor.pageId } });
    expect(editor.doc.get(copy)).toBeUndefined();
  });

  test('needs a single component set or main component', () => {
    editor.state.select([primary, secondary]);
    expect(canAddVariant(editor)).toBe(false);
    const shape = editor.doc.children(primary)[0]!;
    editor.state.select([shape]);
    expect(canAddVariant(editor)).toBe(false);
  });
});
