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
import type { PrototypeAction, Reaction, SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { hasInteractions, removeAllInteractions, removeOverlayInteractions } from './prototype-remove';

let editor: Editor;
const node = (navigation: 'OVERLAY' | 'SWAP' | 'NAVIGATE', destinationId: string): PrototypeAction => ({ type: 'NODE', navigation, destinationId, transition: { type: 'INSTANT' } });
const later: Reaction = { trigger: { type: 'AFTER_TIMEOUT', timeout: 800 }, actions: [node('NAVIGATE', 'next')] };
const reactionsOf = (id: string) => (editor.doc.getOrThrow(id) as SceneNode).reactions;

beforeEach(() => {
  const ids = new IdGenerator('r');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const page = editor.pageId;
  editor.history.run('Build', (tx) => {
    const shape = (id: string, parent: string, x: number) => ({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name: id, x, y: 0, width: 40, height: 40 });
    tx.create(makeFrame(shape('home', page, 0)));
    tx.create(makeFrame(shape('menu', page, 100)));
    tx.create(makeFrame(shape('next', page, 200)));
    tx.create({ ...makeRectangle(shape('open', 'home', 0)), reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [node('OVERLAY', 'menu')] }, later] });
    tx.create({ ...makeRectangle(shape('swap', 'home', 0)), reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [node('SWAP', 'menu')] }] });
    tx.create({
      ...makeRectangle(shape('choose', 'home', 0)),
      reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'CONDITIONAL', blocks: [{ condition: 'true', actions: [node('OVERLAY', 'menu'), { type: 'BACK' }] }, { condition: null, actions: [] }] }] }],
    });
  });
});

describe('removing interactions', () => {
  test('deleting an overlay removes the actions opening it, and the interactions left empty, but keeps the frame', () => {
    expect(removeOverlayInteractions(editor, 'menu')).toBe(true);
    expect(reactionsOf('open')).toEqual([later]);
    expect(reactionsOf('swap')).toBeUndefined();
    expect(reactionsOf('choose')).toEqual([{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'CONDITIONAL', blocks: [{ condition: 'true', actions: [{ type: 'BACK' }] }, { condition: null, actions: [] }] }] }]);
    expect(editor.doc.has('menu')).toBe(true);
    expect(removeOverlayInteractions(editor, 'menu')).toBe(false);
    editor.history.undo();
    expect(reactionsOf('swap')).toEqual([{ trigger: { type: 'ON_CLICK' }, actions: [node('SWAP', 'menu')] }]);
  });

  test('Remove all interactions clears every interaction on the page in one undo step', () => {
    expect(hasInteractions(editor)).toBe(true);
    expect(removeAllInteractions(editor)).toBe(true);
    expect(['open', 'swap', 'choose'].map(reactionsOf)).toEqual([undefined, undefined, undefined]);
    expect(hasInteractions(editor)).toBe(false);
    expect(removeAllInteractions(editor)).toBe(false);
    editor.history.undo();
    expect(reactionsOf('open')).toHaveLength(2);
  });
});
