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
import { Editor } from '../editor';
import { createComponent } from './components';
import { addDevResource, deleteDevResource, devResourceHref, devResources, ownDevResources } from './dev-resources';
import { insertInstance } from './insert-instance';

let editor: Editor;
let rect: string;

beforeEach(() => {
  const ids = new IdGenerator('l');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Card', x: 0, y: 0, width: 60, height: 40 }));
    return id;
  });
});

describe('a dev resource', () => {
  test('links a layer to what a developer needs, and comes off again', () => {
    const id = addDevResource(editor, rect, 'https://example.com/card.tsx', 'Source')!;
    expect(devResources(editor, rect)).toEqual([{ id, url: 'https://example.com/card.tsx', name: 'Source' }]);

    expect(deleteDevResource(editor, rect, id)).toBe(true);
    expect(devResources(editor, rect)).toEqual([]);
  });

  test('an address without a scheme is taken to be a web one, and what cannot be followed is not kept', () => {
    expect(devResourceHref('example.com/docs')).toBe('https://example.com/docs');
    expect(devResourceHref('https://example.com/')).toBe('https://example.com/');
    // A link a browser must not follow is no link at all.
    expect(devResourceHref('javascript:alert(1)')).toBeNull();
    expect(devResourceHref('   ')).toBeNull();
    expect(addDevResource(editor, rect, 'javascript:alert(1)')).toBeNull();
    expect(ownDevResources(editor, rect)).toEqual([]);
  });

  test('a link on a component is inherited by its instances, which keep their own besides', () => {
    editor.state.select([rect]);
    const main = createComponent(editor)!;
    addDevResource(editor, main, 'https://example.com/docs', 'Docs');
    const instance = insertInstance(editor, main, { x: 300, y: 300 })!;
    expect(devResources(editor, instance).map((resource) => resource.name)).toEqual(['Docs']);
    expect(devResources(editor, instance)[0]!.inherited).toBe(true);

    // A link added to the instance belongs to it, and the component keeps only its own.
    addDevResource(editor, instance, 'https://example.com/ticket', 'Ticket');
    expect(devResources(editor, instance).map((resource) => resource.name)).toEqual(['Docs', 'Ticket']);
    expect(devResources(editor, main).map((resource) => resource.name)).toEqual(['Docs']);
  });
});
