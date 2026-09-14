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
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { canCreateComponent, isComponent } from './components';

let editor: Editor;
let a: string;
let b: string;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  [a, b] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const first = editor.ids.next();
    tx.create(makeRectangle({ id: first, parent: { id: page, key: keyOnTop(editor.doc, page) }, name: 'A', x: 0, y: 0, width: 50, height: 50 }));
    const second = editor.ids.next();
    tx.create(makeRectangle({ id: second, parent: { id: page, key: keyOnTop(editor.doc, page) }, name: 'B', x: 100, y: 0, width: 50, height: 50 }));
    return [first, second];
  });
});

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode;

describe('create component', () => {
  test('⌥⌘K nests the selected layers in a new component frame without a fill, as one undo step', () => {
    editor.state.select([a, b]);
    expect(editor.commands.get('object.createComponent')?.shortcuts).toContain('Mod+Alt+K');
    editor.commands.run('object.createComponent');
    const component = node(editor.selection[0]!);
    expect(component).toMatchObject({ type: 'FRAME', name: 'Component 1', fills: [], component: {} });
    expect(component.size).toEqual({ width: 150, height: 50 });
    expect(editor.doc.children(component.id)).toEqual([a, b]);
    expect(isComponent(component)).toBe(true);
    // A single component is already one.
    expect(canCreateComponent(editor)).toBe(false);
    editor.history.undo();
    expect(node(a).parent.id).toBe(editor.pageId);
  });

  test('a single selected frame becomes the component itself', () => {
    const frame = editor.history.run('frame', (tx) => {
      const id = editor.ids.next();
      tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Card', x: 0, y: 200, width: 80, height: 80 }));
      return id;
    });
    editor.state.select([frame]);
    editor.commands.run('object.createComponent');
    expect(editor.selection).toEqual([frame]);
    expect(node(frame)).toMatchObject({ name: 'Card', component: {} });
  });

  test('needs a selection without sections', () => {
    editor.state.select([]);
    expect(canCreateComponent(editor)).toBe(false);
  });
});
