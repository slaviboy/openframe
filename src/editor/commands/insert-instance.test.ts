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
import { insertInstance, localComponents } from './insert-instance';

let editor: Editor;
let main: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  const shape = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Button', x: 100, y: 100, width: 80, height: 40 }));
    return id;
  });
  editor.state.select([shape]);
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
  editor.history.run('Rename', (tx) => tx.set(main, 'name', 'Button'));
});

describe('inserting instances from the Assets tab', () => {
  test('the file’s main components are listed by name', () => {
    expect(localComponents(editor)).toEqual([{ id: main, name: 'Button', pageId: editor.pageId }]);
  });

  test('an instance is inserted centered on a drop point, selected, as one undo step', () => {
    const id = insertInstance(editor, main, { x: 500, y: 300 })!;
    expect(node(id)).toMatchObject({ type: 'FRAME', instance: { mainId: main } });
    expect(node(id).transform).toEqual([1, 0, 0, 1, 460, 280]);
    expect(editor.selection).toEqual([id]);
    editor.history.undo();
    expect(editor.doc.has(id)).toBe(false);
  });

  test('without a drop point the instance goes just to the right of the main component', () => {
    const id = insertInstance(editor, main)!;
    expect(node(id).transform).toEqual([1, 0, 0, 1, 220, 100]);
  });
});
