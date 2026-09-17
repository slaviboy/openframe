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
import { createEmptyDocument, keyOnTop, makeFrame, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode, TextNode } from '@/core/schema/document';
import { applyComponentProperty, createComponentProperty } from '../commands/component-properties';
import { createComponent } from '../commands/components';
import { insertInstance } from '../commands/insert-instance';
import { Editor } from '../editor';
import { PlaygroundPreview } from './playground';

let editor: Editor;
let label: string;
let main: string;
let instance: string;

/** A component holding one text layer, whose content a text property drives. */
beforeEach(() => {
  const ids = new IdGenerator('p');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const frame = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Button', x: 0, y: 0, width: 120, height: 40 }));
    return id;
  });
  label = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create({ ...makeText({ id, parent: { id: frame, key: keyOnTop(tx.store, frame) }, name: 'Label', x: 0, y: 0, width: 100, height: 20 }), characters: 'Click me' });
    return id;
  });

  editor.state.select([frame]);
  main = createComponent(editor)!;
  createComponentProperty(editor, main, 'TEXT', 'Caption', 'Click me');
  applyComponentProperty(editor, label, 'TEXT', 'Caption');
  instance = insertInstance(editor, main, { x: 400, y: 400 })!;
});

/** The instance's own copy of the text layer. */
const mirror = () =>
  editor.doc
    .children(instance)
    .map((id) => editor.doc.getOrThrow(id) as SceneNode)
    .find((node): node is TextNode => node.type === 'TEXT')!;

describe('the component playground', () => {
  test('shows an instance with a property turned another way, and puts it back', () => {
    expect(mirror().characters).toBe('Click me');

    const playground = new PlaygroundPreview(editor);
    playground.show(instance, { Caption: 'Buy now' });
    expect(playground.active).toBe(true);
    expect(mirror().characters).toBe('Buy now');

    playground.clear();
    expect(playground.active).toBe(false);
    expect(mirror().characters).toBe('Click me');
  });

  test('is not an edit: it leaves no undo step and never reaches the file', () => {
    const before = editor.history.canUndo;
    const playground = new PlaygroundPreview(editor);
    playground.show(instance, { Caption: 'Buy now' });
    playground.clear();
    expect(editor.history.canUndo).toBe(before);

    // Undo takes back the last real edit, which is inserting the instance, not the playground.
    editor.history.undo();
    expect(editor.doc.get(instance)).toBeUndefined();
  });

  test('an edit made while it is showing takes the file back first', () => {
    const playground = new PlaygroundPreview(editor);
    playground.show(instance, { Caption: 'Buy now' });
    // Beginning any transaction clears the playground, so the edit is made against the file as it stands.
    editor.history.run('rename', (tx) => tx.set(instance, 'name', 'Renamed'));
    expect(playground.active).toBe(false);
    expect(mirror().characters).toBe('Click me');
  });

  test('nothing to show leaves the instance alone, and disposing lets go of the editor', () => {
    const playground = new PlaygroundPreview(editor);
    playground.show(instance, {});
    expect(playground.active).toBe(false);

    playground.show(instance, { Caption: 'Buy now' });
    playground.dispose();
    expect(mirror().characters).toBe('Click me');
    expect(editor.devPreview).toBeNull();
  });
});
