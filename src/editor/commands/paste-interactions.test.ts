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
import { pasteInteractions } from './prototype';

let editor: Editor;
const navigate: Reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'next', transition: { type: 'INSTANT' } }] };
const back: Reaction = { trigger: { type: 'ON_HOVER' }, actions: [{ type: 'BACK' }] };
const later: Reaction = { trigger: { type: 'AFTER_TIMEOUT', timeout: 800 }, actions: [{ type: 'BACK' }] };

beforeEach(() => {
  const ids = new IdGenerator('p');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const page = editor.pageId;
  editor.history.run('Build', (tx) => {
    const shape = (id: string, parent: string, x: number) => ({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name: id, x, y: 0, width: 40, height: 40 });
    tx.create(makeFrame(shape('home', page, 0)));
    tx.create(makeFrame(shape('next', page, 100)));
    tx.create({ ...makeRectangle(shape('other', 'home', 0)), reactions: [back] });
  });
});

describe('pasting interaction details', () => {
  test('pasted interactions are added to each layer, replacing ones whose trigger they can’t be combined with, in one undo step', () => {
    expect(pasteInteractions(editor, [], [navigate])).toBe(false);
    expect(pasteInteractions(editor, ['other'], [navigate, later])).toBe(true);
    // On click can't be combined with While hovering, so it takes its place.
    expect((editor.doc.getOrThrow('other') as SceneNode).reactions).toEqual([navigate, later]);
    editor.history.undo();
    expect((editor.doc.getOrThrow('other') as SceneNode).reactions).toEqual([back]);
  });
});
