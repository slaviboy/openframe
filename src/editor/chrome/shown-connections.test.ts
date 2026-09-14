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
import type { Reaction } from '@/core/schema/document';
import { Editor } from '../editor';
import { shownConnections } from './prototype-geometry';

let editor: Editor;
const navigate: Reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'end', transition: { type: 'INSTANT' } }] };
const sources = () => shownConnections(editor, []).map((connection) => connection.sourceId);

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const page = editor.pageId;
  editor.history.run('Build', (tx) => {
    const shape = (id: string, parent: string, name: string, x: number, y = 0) => ({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name, x, y, width: 40, height: 40 });
    tx.create(makeFrame(shape('home', page, 'home', 400)));
    tx.create(makeFrame(shape('about', page, 'about', 0)));
    tx.create(makeFrame(shape('end', page, 'end', 200, 200)));
    // "button" in home and about match, with the same interaction; "other" has it too, but doesn't match.
    tx.create({ ...makeRectangle(shape('home-button', 'home', 'button', 0)), reactions: [navigate] });
    tx.create({ ...makeRectangle(shape('about-button', 'about', 'button', 0)), reactions: [navigate] });
    tx.create({ ...makeRectangle(shape('other', 'about', 'other', 0)), reactions: [navigate] });
  });
});

describe('matching connections on the canvas', () => {
  test('only the top-left of matching interactions shows its connection', () => {
    expect(sources()).toEqual(['about-button', 'other']);
  });

  test('selecting that connection shows all the matching ones', () => {
    editor.state.selectConnections([{ sourceId: 'about-button', reactionIndex: 0, actionIndex: 0 }]);
    expect(sources()).toEqual(['home-button', 'about-button', 'other']);
    // Selecting a connection selects its layer too; the matching connection in the other frame still shows.
    expect(shownConnections(editor, ['about-button']).map((connection) => connection.sourceId)).toEqual(['home-button', 'about-button', 'other']);
  });

  test('the first one in view is shown when the top-left one is out of view', () => {
    editor.setViewport({ x: 380, y: -100, zoom: 1 });
    expect(sources()).toEqual(['home-button', 'other']);
  });
});
