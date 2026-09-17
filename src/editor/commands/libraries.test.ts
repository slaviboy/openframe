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
import type { DocumentStore } from '@/core/document/store';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { createComponent } from './components';
import { importLibrary, importedLibraries, libraryComponentsOf, removeLibrary } from './libraries';

let editor: Editor;
let library: DocumentStore;

/** Another file holding one component, made of a frame with a rectangle inside it. */
function makeLibraryFile(): DocumentStore {
  const ids = new IdGenerator('lib');
  const other = new Editor({ doc: createEmptyDocument({ name: 'Kit', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const frame = other.history.run('create', (tx) => {
    const id = other.ids.next();
    tx.create(makeFrame({ id, parent: { id: other.pageId, key: keyOnTop(tx.store, other.pageId) }, name: 'Button', x: 0, y: 0, width: 120, height: 40 }));
    return id;
  });
  other.history.run('create', (tx) => {
    const id = other.ids.next();
    tx.create(makeRectangle({ id, parent: { id: frame, key: keyOnTop(tx.store, frame) }, name: 'Face', x: 0, y: 0, width: 120, height: 40 }));
  });
  other.state.select([frame]);
  createComponent(other);
  return other.doc;
}

beforeEach(() => {
  const ids = new IdGenerator('f');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  library = makeLibraryFile();
});

describe('a library brought in from another file', () => {
  test('lends the components sitting on its pages', () => {
    expect(libraryComponentsOf(library).map((node) => node.name)).toEqual(['Button']);
    expect(libraryComponentsOf(editor.doc)).toEqual([]);
  });

  test('lands on a page of its own, marked as that library', () => {
    const result = importLibrary(editor, library, 'Kit', '2026-09-17T00:00:00.000Z');
    expect(result).toMatchObject({ components: 1 });

    const libraries = importedLibraries(editor);
    expect(libraries).toEqual([{ pageId: result!.pageId, name: 'Kit', importedAt: '2026-09-17T00:00:00.000Z', components: 1 }]);
    // The component came with what it is made of.
    const [componentId] = editor.doc.children(result!.pageId);
    expect((editor.doc.getOrThrow(componentId!) as SceneNode).name).toBe('Button');
    expect(editor.doc.children(componentId!)).toHaveLength(1);
  });

  test('everything it brings gets ids of this file, so nothing collides with what is here', () => {
    const result = importLibrary(editor, library, 'Kit')!;
    const brought = [result.pageId, ...editor.doc.children(result.pageId)];
    for (const id of brought) expect(library.get(id)).toBeUndefined();
  });

  test('a second import of the same file sits beside the first rather than over it', () => {
    importLibrary(editor, library, 'Kit');
    importLibrary(editor, library, 'Kit');
    expect(importedLibraries(editor)).toHaveLength(2);
    expect(editor.doc.pages().map((id) => editor.doc.get(id)?.name)).toContain('Kit 2');
  });

  test('a file that lends nothing is not imported', () => {
    const ids = new IdGenerator('emp');
    const empty = createEmptyDocument({ name: 'Empty', now: 'n', appVersion: 't', ids });
    expect(importLibrary(editor, empty, 'Empty')).toBeNull();
    expect(importedLibraries(editor)).toEqual([]);
  });

  test('is taken out again with the components it brought', () => {
    const result = importLibrary(editor, library, 'Kit')!;
    expect(removeLibrary(editor, result.pageId)).toBe(true);
    expect(importedLibraries(editor)).toEqual([]);
    expect(editor.doc.get(result.pageId)).toBeUndefined();
    // A page that is not a library is not something this takes away.
    expect(removeLibrary(editor, editor.pageId)).toBe(false);
  });
});
