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
import { createEmptyDocument, keyOnTop, makeEllipse, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { insertInstance } from './insert-instance';

let editor: Editor;
let main: string;
let rect: string;
let instance: string;
let child: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;
const sources = (id: string) => editor.doc.children(id).map((c) => node(c).source);

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
  [child] = editor.doc.children(instance) as [string];
});

describe('instances follow a drag before it commits', () => {
  test('moving a layer of a main component moves it in its instances on every preview', () => {
    const tx = editor.history.begin('Drag');
    tx.set(rect, 'transform', [1, 0, 0, 1, 5, 0]);
    tx.flushPreview();
    expect(node(child).transform).toEqual([1, 0, 0, 1, 5, 0]);
    tx.set(rect, 'transform', [1, 0, 0, 1, 12, 0]);
    tx.flushPreview();
    expect(node(child).transform).toEqual([1, 0, 0, 1, 12, 0]);
    editor.history.commit(tx);
    expect(node(child).transform).toEqual([1, 0, 0, 1, 12, 0]);
    expect(node(child).overrides).toBeUndefined();
    editor.history.undo();
    expect(node(child).transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  test('resizing a main component resizes its instances throughout the drag', () => {
    const tx = editor.history.begin('Resize');
    tx.set(main, 'size', { width: 60, height: 40 });
    tx.flushPreview();
    expect(node(instance).size).toEqual({ width: 60, height: 40 });
    tx.set(main, 'size', { width: 80, height: 40 });
    tx.flushPreview();
    expect(node(instance).size).toEqual({ width: 80, height: 40 });
    editor.history.commit(tx);
    expect(node(instance).size).toEqual({ width: 80, height: 40 });
  });

  test('a layer dragged into a main component and out again leaves no copies; dragged in, it has exactly one', () => {
    const loose = editor.history.run('create', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Loose', x: 200, y: 0, width: 10, height: 10 }));
      return id;
    });
    const tx = editor.history.begin('Drag');
    tx.set(loose, 'parent', { id: main, key: keyOnTop(tx.store, main) });
    tx.flushPreview();
    expect(sources(instance)).toEqual([rect, loose]);
    tx.set(loose, 'transform', [1, 0, 0, 1, 3, 3]);
    tx.flushPreview();
    expect(sources(instance)).toEqual([rect, loose]);
    tx.set(loose, 'parent', { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) });
    tx.flushPreview();
    expect(sources(instance)).toEqual([rect]);
    tx.set(loose, 'parent', { id: main, key: keyOnTop(tx.store, main) });
    tx.flushPreview();
    editor.history.commit(tx);
    expect(sources(instance)).toEqual([rect, loose]);
  });

  test('a layer created during a drag is copied once, and cancelling puts the instances back', () => {
    const tx = editor.history.begin('Draw');
    const dot = editor.ids.next();
    tx.create(makeEllipse({ id: dot, parent: { id: main, key: keyOnTop(tx.store, main) }, name: 'Dot', x: 0, y: 0, width: 1, height: 1 }));
    tx.flushPreview();
    tx.set(dot, 'size', { width: 10, height: 10 });
    tx.flushPreview();
    expect(sources(instance)).toEqual([rect, dot]);
    expect(node(editor.doc.children(instance)[1]!).size).toEqual({ width: 10, height: 10 });
    editor.history.cancel(tx);
    expect(sources(instance)).toEqual([rect]);
  });

  test('a layer inside an instance stays in place while it is dragged', () => {
    const tx = editor.history.begin('Drag');
    tx.set(child, 'transform', [1, 0, 0, 1, 9, 9]);
    tx.flushPreview();
    expect(node(child).transform).toEqual([1, 0, 0, 1, 0, 0]);
    editor.history.commit(tx);
    expect(node(child).transform).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
