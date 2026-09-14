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
import { matchingInteractions, updateInteractionsAt } from './prototype';

let editor: Editor;
const navigate: Reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'end', transition: { type: 'INSTANT' } }] };
const later: Reaction = { trigger: { type: 'AFTER_TIMEOUT', timeout: 800 }, actions: [{ type: 'BACK' }] };
const reactionsOf = (id: string) => (editor.doc.getOrThrow(id) as SceneNode).reactions;

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const page = editor.pageId;
  editor.history.run('Build', (tx) => {
    const shape = (id: string, parent: string, name: string, x: number) => ({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name, x, y: 0, width: 40, height: 40 });
    tx.create(makeFrame(shape('home', page, 'home', 0)));
    tx.create(makeFrame(shape('about', page, 'about', 100)));
    tx.create(makeFrame(shape('end', page, 'end', 200)));
    // "button" in home and about match; "other" doesn't, though its interaction is the same.
    tx.create({ ...makeRectangle(shape('home-button', 'home', 'button', 0)), reactions: [navigate] });
    tx.create({ ...makeRectangle(shape('about-button', 'about', 'button', 0)), reactions: [later, navigate] });
    tx.create({ ...makeRectangle(shape('other', 'about', 'other', 0)), reactions: [navigate] });
  });
});

describe('matching interactions', () => {
  test('identical interactions on matching layers are found, wherever they are in the layer’s interactions', () => {
    expect(matchingInteractions(editor, 'home-button', 0)).toEqual([
      { sourceId: 'home-button', reactionIndex: 0, actionIndex: 0 },
      { sourceId: 'about-button', reactionIndex: 1, actionIndex: 0 },
    ]);
    expect(matchingInteractions(editor, 'home-button', 5)).toEqual([]);
  });

  test('matching interactions change together in one undo step', () => {
    const back: Reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'BACK' }] };
    expect(updateInteractionsAt(editor, matchingInteractions(editor, 'home-button', 0), back)).toBe(true);
    expect(reactionsOf('home-button')).toEqual([back]);
    expect(reactionsOf('about-button')).toEqual([later, back]);
    expect(reactionsOf('other')).toEqual([navigate]);
    editor.history.undo();
    expect(reactionsOf('about-button')).toEqual([later, navigate]);
  });
});
