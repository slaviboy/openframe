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
import { createEmptyDocument, keyOnTop, makeRectangle, makeSection } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { assetTree, componentFolders, componentLeafName, localComponents } from './insert-instance';

let editor: Editor;
let pageName: string;

/** A main component named `name` wrapping a rectangle inside `parent`. */
function component(parent: string, x: number, name: string): string {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name: 'Shape', x, y: 0, width: 20, height: 20 }));
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
  pageName = (editor.doc.get(editor.pageId) as { name: string }).name;
});

describe('Assets folders', () => {
  test('components are in their page, the sections they are in, and the parts of their names before a slash', () => {
    const icons = editor.history.run('Section', (tx) => {
      const id = editor.ids.next();
      tx.create(makeSection({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Icons', x: 0, y: 200, width: 400, height: 200 }));
      return id;
    });
    component(editor.pageId, 0, 'Button/Primary/Large');
    component(icons, 20, 'icon-16-home');
    const byName = new Map(localComponents(editor).map((c) => [c.name, c]));

    expect(componentFolders(editor, byName.get('Button/Primary/Large')!)).toEqual([pageName, 'Button', 'Primary']);
    expect(componentFolders(editor, byName.get('icon-16-home')!)).toEqual([pageName, 'Icons']);
    expect(componentLeafName('Button/Primary/Large')).toBe('Large');
    expect(componentLeafName('Card')).toBe('Card');

    const tree = assetTree(editor, localComponents(editor));
    expect(tree.folders.map((f) => f.name)).toEqual([pageName]);
    const page = tree.folders[0]!;
    expect(page.folders.map((f) => f.name)).toEqual(['Button', 'Icons']);
    expect(page.folders[0]!.folders[0]!.components.map((c) => c.name)).toEqual(['Button/Primary/Large']);
    expect(page.folders[1]!.components.map((c) => c.name)).toEqual(['icon-16-home']);
  });

  test('a component set is listed where the set is', () => {
    const first = component(editor.pageId, 0, 'Button/Primary');
    const second = component(editor.pageId, 100, 'Button/Secondary');
    editor.state.select([first, second]);
    editor.commands.run('object.combineAsVariants');
    const [listed] = localComponents(editor);
    expect(listed).toMatchObject({ name: 'Button' });
    expect(componentFolders(editor, listed!)).toEqual([pageName]);
  });
});
