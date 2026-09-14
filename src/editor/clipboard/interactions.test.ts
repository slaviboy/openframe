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

import { describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeFrame } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Reaction } from '@/core/schema/document';
import { Editor } from '../editor';
import { copiedInteractions, decodeInteractionsHtml, encodeInteractionsHtml } from './interactions';
import { ClipboardError } from './payload';

// Layer ids in documents look like "c:2"; clipboard content is checked against that.
const navigate: Reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'c:2', transition: { type: 'INSTANT' } }] };
const back: Reaction = { trigger: { type: 'AFTER_TIMEOUT', timeout: 800 }, actions: [{ type: 'BACK' }] };

describe('copying interaction details', () => {
  test('the selected connections copy their interactions, each once', () => {
    const ids = new IdGenerator('c');
    const editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
    const page = editor.pageId;
    editor.history.run('Build', (tx) => {
      tx.create({ ...makeFrame({ id: 'home', parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'home', x: 0, y: 0, width: 40, height: 40 }), reactions: [navigate, back] });
      tx.create(makeFrame({ id: 'next', parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'next', x: 100, y: 0, width: 40, height: 40 }));
    });
    expect(copiedInteractions(editor)).toBeNull();
    editor.state.selectConnections([
      { sourceId: 'home', reactionIndex: 1, actionIndex: 0 },
      { sourceId: 'home', reactionIndex: 0, actionIndex: 0 },
      { sourceId: 'home', reactionIndex: 1, actionIndex: 0 },
    ]);
    expect(copiedInteractions(editor)).toEqual([back, navigate]);
  });

  test('interaction details survive the clipboard; other content is ignored and damaged content refused', () => {
    expect(decodeInteractionsHtml(encodeInteractionsHtml([navigate, back]))).toEqual([navigate, back]);
    expect(decodeInteractionsHtml('<p>Hello</p>')).toBeNull();
    expect(() => decodeInteractionsHtml('<div data-openframe-interactions="v1:!!!"></div>')).toThrow(ClipboardError);
    expect(() => decodeInteractionsHtml(`<div data-openframe-interactions="v1:${btoa('{"kind":"interactions","reactions":[]}')}"></div>`)).toThrow(ClipboardError);
  });
});
