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
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { canMultiEditVariants, matchingLayers } from './multi-edit';

let editor: Editor;
let set: string;
let primary: string;
let secondary: string;
let primaryLabel: string;
let secondaryLabel: string;
let loose: string;

/** A component named `name` wrapping a rectangle named Label at (x, 0); returns the component and the rectangle. */
function component(x: number, name: string): [string, string] {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Label', x, y: 0, width: 40, height: 20 }));
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
  [primary, primaryLabel] = component(0, 'Button/Primary');
  [secondary, secondaryLabel] = component(100, 'Button/Secondary');
  loose = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Loose', x: 0, y: 300, width: 10, height: 10 }));
    return id;
  });
  editor.state.select([primary, secondary]);
  editor.commands.run('object.combineAsVariants');
  set = editor.selection[0]!;
});

describe('multi-edit variants', () => {
  test('matching layers are every variant for a variant, and the layers with the same names for a nested layer', () => {
    expect(matchingLayers(editor, set, [primary]).sort()).toEqual([primary, secondary].sort());
    expect(matchingLayers(editor, set, [primaryLabel]).sort()).toEqual([primaryLabel, secondaryLabel].sort());
    expect(matchingLayers(editor, set, [set]).sort()).toEqual([primary, secondary].sort());
  });

  test('Q on a nested layer selects the matching layers in every variant, and Q again ends it', () => {
    editor.state.select([loose]);
    expect(canMultiEditVariants(editor)).toBe(false);

    editor.state.select([primaryLabel]);
    expect(editor.commands.get('object.multiEditVariants')?.shortcuts).toEqual(['Q']);
    editor.commands.run('object.multiEditVariants');
    expect([...editor.selection].sort()).toEqual([primaryLabel, secondaryLabel].sort());
    expect(editor.state.getSnapshot().multiEditSetId).toBe(set);

    editor.commands.run('object.multiEditVariants');
    expect(editor.state.getSnapshot().multiEditSetId).toBeNull();
  });

  test('with the set selected the selection stays; selecting outside the set ends multi-edit', () => {
    editor.state.select([set]);
    editor.commands.run('object.multiEditVariants');
    expect(editor.selection).toEqual([set]);
    expect(editor.state.getSnapshot().multiEditSetId).toBe(set);

    // Staying inside the set keeps it; leaving ends it.
    editor.state.select([secondary]);
    expect(editor.state.getSnapshot().multiEditSetId).toBe(set);
    editor.state.select([loose]);
    expect(editor.state.getSnapshot().multiEditSetId).toBeNull();
  });
});
