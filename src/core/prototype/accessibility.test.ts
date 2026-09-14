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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, makeText } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { Reaction } from '../schema/document';
import { accessibleContent } from './accessibility';

const onClick = (action: Reaction['actions'][number]): Reaction[] => [{ trigger: { type: 'ON_CLICK' }, actions: [action] }];

describe('accessible prototypes', () => {
  test('a screen reads as a section of text, images, links, buttons and labelled components, top layer first', () => {
    const ids = new IdGenerator('a');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
    const shape = (id: string, parent: string) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x: 0, y: 0, width: 10, height: 10 });
    history.run('Build', (tx) => {
      tx.create(makeFrame(shape('home', page)));
      tx.create(makeText(shape('title', 'home')));
      tx.set('title', 'characters', 'Welcome');
      tx.create({ ...makeRectangle(shape('photo', 'home')), fills: [{ type: 'IMAGE', imageHash: 'a'.repeat(64), scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' }] });
      tx.create({ ...makeRectangle(shape('buy', 'home')), reactions: onClick({ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'home', transition: { type: 'INSTANT' } }) });
      tx.create({ ...makeFrame(shape('more', 'home')), reactions: onClick({ type: 'BACK' }) });
      tx.create(makeText(shape('more-label', 'more')));
      tx.set('more-label', 'characters', 'Show more');
      tx.create({ ...makeFrame(shape('card', 'home')), instance: { mainId: 'main' } });
      tx.create(makeText(shape('card-text', 'card')));
      tx.set('card-text', 'characters', 'Card');
      tx.create({ ...makeRectangle(shape('hidden', 'home')), visible: false, reactions: onClick({ type: 'BACK' }) });
    });
    expect(accessibleContent(store, 'home')).toEqual([
      {
        kind: 'section',
        nodeId: 'home',
        label: 'home',
        children: [
          { kind: 'section', nodeId: 'card', label: 'card', children: [{ kind: 'text', nodeId: 'card-text', text: 'Card' }] },
          // A button is named by the text in it.
          { kind: 'button', nodeId: 'more', label: 'Show more' },
          { kind: 'link', nodeId: 'buy', label: 'buy' },
          { kind: 'image', nodeId: 'photo', label: 'photo' },
          { kind: 'text', nodeId: 'title', text: 'Welcome' },
        ],
      },
    ]);
  });
});
