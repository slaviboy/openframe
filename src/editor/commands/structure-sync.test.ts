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
import { createEmptyDocument, keyOnTop, makeEllipse, makeFrame, makeRectangle } from '@/core/document/factory';
import { instantiate } from '@/core/document/instances';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { insertInstance } from './insert-instance';

let editor: Editor;
let main: string;
let rect: string;
let instance: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;
const sources = (id: string) => editor.doc.children(id).map((child) => node(child).source);

/** Adds an ellipse named Dot to `parent`, on top. */
const addDot = (parent: string) =>
  editor.history.run('Add dot', (tx) => {
    const id = editor.ids.next();
    tx.create(makeEllipse({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name: 'Dot', x: 5, y: 5, width: 10, height: 10 }));
    return id;
  });

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x: 0, y: 0, width: 40, height: 40 }));
    return id;
  });
  editor.state.select([rect]);
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
  instance = insertInstance(editor, main)!;
});

describe('instances follow the structure of their main component', () => {
  test('a layer added to a main component is added to its instances, in the same undo step', () => {
    const dot = addDot(main);
    expect(sources(instance)).toEqual([rect, dot]);
    expect(node(editor.doc.children(instance)[1]!)).toMatchObject({ type: 'ELLIPSE', name: 'Dot' });
    editor.history.undo();
    expect(editor.doc.children(instance)).toHaveLength(1);
    editor.history.redo();
    expect(sources(instance)).toEqual([rect, dot]);
  });

  test('a layer deleted from a main component is deleted from its instances', () => {
    const dot = addDot(main);
    editor.history.run('Delete', (tx) => tx.delete(rect));
    expect(sources(instance)).toEqual([dot]);
  });

  test('reordering layers, or moving one into a frame, inside a main component does the same in its instances', () => {
    const [dot, box] = editor.history.run('Add', (tx) => {
      const dotId = editor.ids.next();
      tx.create(makeEllipse({ id: dotId, parent: { id: main, key: keyOnTop(tx.store, main) }, name: 'Dot', x: 5, y: 5, width: 10, height: 10 }));
      const boxId = editor.ids.next();
      tx.create(makeFrame({ id: boxId, parent: { id: main, key: keyOnTop(tx.store, main) }, name: 'Box', x: 0, y: 0, width: 20, height: 20 }));
      return [dotId, boxId];
    });
    editor.history.run('Bring to front', (tx) => tx.set(rect, 'parent', { id: main, key: keyOnTop(tx.store, main) }));
    expect(sources(instance)).toEqual([dot, box, rect]);

    editor.history.run('Move into box', (tx) => tx.set(dot, 'parent', { id: box, key: keyOnTop(tx.store, box) }));
    expect(sources(instance)).toEqual([box, rect]);
    const boxCopy = editor.doc.children(instance).find((id) => node(id).source === box)!;
    expect(sources(boxCopy)).toEqual([dot]);
  });

  test('moving a layer into or out of a main component adds or removes it in its instances', () => {
    const loose = editor.history.run('create', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Loose', x: 200, y: 0, width: 10, height: 10 }));
      return id;
    });
    editor.history.run('Into', (tx) => tx.set(loose, 'parent', { id: main, key: keyOnTop(tx.store, main) }));
    expect(sources(instance)).toEqual([rect, loose]);
    editor.history.run('Out', (tx) => tx.set(loose, 'parent', { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }));
    expect(sources(instance)).toEqual([rect]);
  });

  test('structure changes reach instances nested in other components, and the instances of those', () => {
    const inner = insertInstance(editor, main)!;
    editor.state.select([inner]);
    editor.commands.run('object.createComponent');
    const b = editor.selection[0]!;
    const bInstance = insertInstance(editor, b)!;
    const [nested] = editor.doc.children(bInstance) as [string];

    const dot = addDot(main);
    const [innerRect, innerDot] = editor.doc.children(inner) as [string, string];
    expect(sources(inner)).toEqual([rect, dot]);
    expect(sources(nested)).toEqual([innerRect, innerDot]);

    // An instance added to a component is added, linked, to that component's instances.
    const added = editor.history.run('Add instance to B', (tx) => instantiate(tx, main, b, keyOnTop(tx.store, b), () => editor.ids.next()));
    const addedCopy = editor.doc.children(bInstance).find((id) => node(id).source === added)!;
    expect(node(addedCopy)).toMatchObject({ instance: { mainId: main }, source: added });
    expect(editor.doc.children(addedCopy)).toHaveLength(2);
  });
});
