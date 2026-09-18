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
import { createEmptyDocument, keyOnTop, makeFrame } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { quickAddFrame } from './quick-add-frame';

let editor: Editor;
let first: string;
let second: string;

const xOf = (id: string) => (editor.doc.getOrThrow(id) as SceneNode).transform[4];
const frames = () => editor.doc.children(editor.pageId);

beforeEach(() => {
  const ids = new IdGenerator('q');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  // Two frames in a row: 0–200 and 300–500.
  const make = (name: string, x: number) =>
    editor.history.run('frame', (tx) => {
      const id = editor.ids.next();
      tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name, x, y: 0, width: 200, height: 200 }));
      return id;
    });
  first = make('Frame 1', 0);
  second = make('Frame 2', 300);
});

describe('quick-adding a frame beside another', () => {
  test('the copy lands to the right, and the frames beyond it move over to make room', () => {
    const copy = quickAddFrame(editor, first, 'right')!;
    expect(frames()).toHaveLength(3);
    // The copy sits a frame and a gap to the right of the original.
    expect(xOf(copy)).toBe(300);
    expect(xOf(first)).toBe(0);
    // The frame that was there is pushed along by the same distance.
    expect(xOf(second)).toBe(600);
    expect(editor.selection).toEqual([copy]);
  });

  test('to the left it goes the other way', () => {
    const copy = quickAddFrame(editor, second, 'left')!;
    expect(xOf(copy)).toBe(0);
    expect(xOf(second)).toBe(300);
    // The frame to its left is pushed further left.
    expect(xOf(first)).toBe(-300);
  });

  test('one undo takes the copy and the shuffling back together', () => {
    quickAddFrame(editor, first, 'right');
    editor.history.undo();
    expect(frames()).toHaveLength(2);
    expect(xOf(second)).toBe(300);
  });

  test('a locked frame is not quick-added from', () => {
    editor.history.run('lock', (tx) => tx.set(first, 'locked', true));
    expect(quickAddFrame(editor, first, 'right')).toBeNull();
  });
});
