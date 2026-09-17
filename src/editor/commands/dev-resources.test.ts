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
import { createEmptyDocument, keyOnTop, makeRectangle, solid } from '@/core/document/factory';
import type { SceneNode } from '@/core/schema/document';
import { IdGenerator } from '@/core/ids/ids';
import { Editor } from '../editor';
import { createComponent } from './components';
import { addDevResource, deleteDevResource, devResourceHref, devResources, ownDevResources, suggestedVariables } from './dev-resources';
import { insertInstance } from './insert-instance';
import { createCollection, createVariable, setVariableValue } from './variables';

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

describe('the variables a value is worth naming with', () => {
  const node = () => editor.doc.getOrThrow(rect) as SceneNode;

  test('a colour a variable already carries is suggested for the fill holding it outright', () => {
    const collection = createCollection(editor, 'Tokens');
    const blue = createVariable(editor, collection, 'COLOR', 'Brand/Blue')!;
    for (const mode of (editor.doc.getOrThrow(collection) as { modes: { modeId: string }[] }).modes) {
      setVariableValue(editor, blue, mode.modeId, { r: 0, g: 0.4, b: 1, a: 1 });
    }

    // The rectangle is painted that very colour, without saying so.
    editor.history.run('fill', (tx) => tx.set(rect, 'fills', [solid({ r: 0, g: 0.4, b: 1, a: 1 })]));
    expect(suggestedVariables(editor, node()).map((entry) => entry.name)).toContain('Brand/Blue');

    // A colour no variable carries is nothing to suggest for.
    editor.history.run('fill', (tx) => tx.set(rect, 'fills', [solid({ r: 1, g: 0, b: 0, a: 1 })]));
    expect(suggestedVariables(editor, node()).map((entry) => entry.name)).not.toContain('Brand/Blue');
  });

  test('a size a number variable carries is suggested too, and a file with no variables suggests nothing', () => {
    expect(suggestedVariables(editor, node())).toEqual([]);

    const collection = createCollection(editor, 'Tokens');
    const size = createVariable(editor, collection, 'FLOAT', 'Size/Card')!;
    for (const mode of (editor.doc.getOrThrow(collection) as { modes: { modeId: string }[] }).modes) {
      setVariableValue(editor, size, mode.modeId, 60);
    }
    expect(suggestedVariables(editor, node()).find((entry) => entry.field === 'width')?.name).toBe('Size/Card');
  });
});

describe('the variables Dev Mode suggests', () => {
  test('offers a variable already carrying a colour the layer holds outright', () => {
    const collection = createCollection(editor, 'Theme');
    const variableId = createVariable(editor, collection, 'COLOR', 'Brand/Blue')!;
    const mode = (editor.doc.getOrThrow(collection) as { modes: { modeId: string }[] }).modes[0]!.modeId;
    setVariableValue(editor, variableId, mode, { r: 0, g: 0.6, b: 1, a: 1 });

    // A rectangle filled with that very colour, but not bound to it.
    editor.history.run('fill', (tx) => tx.set(rect, 'fills', [solid({ r: 0, g: 0.6, b: 1, a: 1 })]));
    const suggested = suggestedVariables(editor, editor.doc.getOrThrow(rect) as SceneNode);
    expect(suggested.map((entry) => `${entry.field}:${entry.name}`)).toEqual(['Fill 1:Brand/Blue']);
  });

  test('says nothing about a colour no variable carries, and nothing where there are no variables', () => {
    expect(suggestedVariables(editor, editor.doc.getOrThrow(rect) as SceneNode)).toEqual([]);
    const collection = createCollection(editor, 'Theme');
    const variableId = createVariable(editor, collection, 'COLOR', 'Brand/Red')!;
    const mode = (editor.doc.getOrThrow(collection) as { modes: { modeId: string }[] }).modes[0]!.modeId;
    setVariableValue(editor, variableId, mode, { r: 1, g: 0, b: 0, a: 1 });

    editor.history.run('fill', (tx) => tx.set(rect, 'fills', [solid({ r: 0, g: 1, b: 0, a: 1 })]));
    expect(suggestedVariables(editor, editor.doc.getOrThrow(rect) as SceneNode)).toEqual([]);
  });

  test('offers a number variable a size matches', () => {
    const collection = createCollection(editor, 'Sizes');
    const variableId = createVariable(editor, collection, 'FLOAT', 'Space/Card')!;
    const mode = (editor.doc.getOrThrow(collection) as { modes: { modeId: string }[] }).modes[0]!.modeId;
    setVariableValue(editor, variableId, mode, 60);
    const suggested = suggestedVariables(editor, editor.doc.getOrThrow(rect) as SceneNode);
    expect(suggested.map((entry) => entry.field)).toContain('width');
  });
});
