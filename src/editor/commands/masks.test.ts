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
import { hitTestDeepest } from '@/core/scene/hit-test';
import { maskOf, maskRuns } from '@/core/scene/masks';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { setMaskType, toggleMask } from './masks';

let editor: Editor;
let ellipse: string;
let rect: string;
const get = (id: string) => editor.doc.getOrThrow(id) as SceneNode;

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  // The ellipse is below the rectangle, so it can mask it.
  [ellipse, rect] = editor.history.run('seed', (tx) => {
    const page = editor.pageId;
    const e = editor.ids.next();
    tx.create(makeEllipse({ id: e, parent: { id: page, key: keyOnTop(editor.doc, page) }, name: 'E', x: 0, y: 0, width: 100, height: 100 }));
    const r = editor.ids.next();
    tx.create(makeRectangle({ id: r, parent: { id: page, key: keyOnTop(editor.doc, page) }, name: 'R', x: 0, y: 0, width: 100, height: 100 }));
    return [e, r] as const;
  });
});

describe('masks', () => {
  test('several layers become a mask group whose bottom layer is the mask, in one undo step', () => {
    editor.state.select([rect, ellipse]);
    const group = toggleMask(editor)!;
    expect(get(group)).toMatchObject({ type: 'GROUP' });
    expect(get(group).name).toMatch(/^Mask group/);
    expect(editor.doc.children(group)).toEqual([ellipse, rect]);
    expect(get(ellipse).isMask).toBe(true);
    expect(get(rect).isMask).toBeUndefined();
    expect(maskOf(editor.doc, rect)).toBe(ellipse);
    editor.history.undo();
    expect(editor.doc.has(group)).toBe(false);
    expect(get(ellipse).isMask).toBeUndefined();
  });

  test('a single layer toggles as a mask; mask type is stored unless Alpha', () => {
    editor.state.select([ellipse]);
    toggleMask(editor);
    expect(get(ellipse).isMask).toBe(true);
    expect(maskRuns(editor.doc, editor.doc.children(editor.pageId))).toEqual([{ mask: ellipse, content: [rect] }]);
    editor.history.run('type', (tx) => setMaskType(tx, get(ellipse), 'LUMINANCE'));
    expect(get(ellipse).maskType).toBe('LUMINANCE');
    toggleMask(editor);
    expect(get(ellipse).isMask).toBeUndefined();
    expect(get(ellipse).maskType).toBeUndefined();
    // A hidden mask masks nothing.
    editor.state.select([ellipse]);
    toggleMask(editor);
    editor.history.run('hide', (tx) => tx.set(ellipse, 'visible', false));
    expect(maskOf(editor.doc, rect)).toBeNull();
  });

  test('masked layers can only be clicked inside the mask shape', () => {
    editor.state.select([ellipse]);
    toggleMask(editor);
    const hit = (x: number, y: number) => hitTestDeepest(editor.doc, editor.scene, editor.pageId, { x, y }, { tolerance: 0 });
    expect(hit(50, 50)).toBe(rect);
    // Inside the rectangle, outside the circle.
    expect(hit(4, 4)).toBeNull();
  });
});
