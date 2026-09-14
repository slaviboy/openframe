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
import type { Reaction, SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { addInteraction, removeInteraction, updateInteraction } from './prototype';

let editor: Editor;
const reactions = (id: string) => (editor.doc.getOrThrow(id) as SceneNode).reactions;

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const page = editor.pageId;
  const init = (id: string, parent: string, name: string) => ({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name, x: 0, y: 0, width: 10, height: 10 });
  editor.history.run('Build', (tx) => {
    tx.create(makeFrame(init('home', page, 'Home')));
    tx.create(makeRectangle(init('a', 'home', 'A')));
    tx.create(makeRectangle(init('b', 'home', 'B')));
    tx.create(makeFrame(init('about', page, 'About')));
  });
});

describe('prototype interaction commands', () => {
  test('adding interactions in bulk gives each layer its first free trigger, in one undo step', () => {
    addInteraction(editor, ['a'], 'about');
    expect(addInteraction(editor, ['a', 'b', editor.pageId], 'about')).toBe(true);
    expect(reactions('a')!.map((r) => r.trigger.type)).toEqual(['ON_CLICK', 'ON_DRAG']);
    expect(reactions('b')).toEqual([{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'about', transition: { type: 'INSTANT' } }] }]);
    editor.history.undo();
    expect(reactions('b')).toBeUndefined();
    expect(addInteraction(editor, [editor.pageId])).toBe(false);
  });

  test('changing an interaction keeps a trigger the layer already has elsewhere; removing the last clears the field', () => {
    addInteraction(editor, ['a']);
    addInteraction(editor, ['a']);
    const hover: Reaction = { trigger: { type: 'ON_HOVER' }, actions: [{ type: 'BACK' }] };
    updateInteraction(editor, ['a'], 1, hover);
    // While hovering can't join On click: the trigger stays On drag.
    expect(reactions('a')![1]).toEqual({ trigger: { type: 'ON_DRAG' }, actions: [{ type: 'BACK' }] });
    updateInteraction(editor, ['a'], 1, { trigger: { type: 'AFTER_TIMEOUT', timeout: 1200 }, actions: [{ type: 'URL', url: 'https://example.com' }] });
    expect(reactions('a')![1]!.trigger).toEqual({ type: 'AFTER_TIMEOUT', timeout: 1200 });
    expect(updateInteraction(editor, ['b'], 0, hover)).toBe(false);

    removeInteraction(editor, ['a'], 0);
    removeInteraction(editor, ['a'], 0);
    expect(reactions('a')).toBeUndefined();
  });
});
