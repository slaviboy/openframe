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
import type { GroupNode, SceneNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from './builtin';
import { Editor } from '../editor';
import { addRepeatTransform, applyTransforms, canApplyTransforms, removeRepeatTransform, setRepeatTransform } from './transforms';

let editor: Editor;
let rect: string;

beforeEach(() => {
  const ids = new IdGenerator('t');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x: 0, y: 0, width: 60, height: 40 }));
    return id;
  });
  editor.state.select([rect]);
});

const group = (id: string) => editor.doc.getOrThrow(id) as GroupNode;

describe('transforms', () => {
  test('a repeat wraps the selection in a group that carries it, without copying layers', () => {
    const id = addRepeatTransform(editor, 'RADIAL')!;
    expect(id).not.toBeNull();
    expect(group(id).type).toBe('GROUP');
    expect(group(id).repeat).toEqual({ kind: 'RADIAL', count: 6, spacing: 0 });
    expect(editor.doc.children(id)).toEqual([rect]);
    expect(editor.selection).toEqual([id]);
  });

  test('a linear repeat starts a shape’s width apart, and its settings change', () => {
    const id = addRepeatTransform(editor, 'LINEAR')!;
    expect(group(id).repeat).toMatchObject({ kind: 'LINEAR', count: 3, spacing: 60, direction: 'HORIZONTAL' });

    expect(setRepeatTransform(editor, id, { count: 5, spacing: 80 })).toBe(true);
    expect(group(id).repeat).toMatchObject({ count: 5, spacing: 80 });

    expect(removeRepeatTransform(editor, id)).toBe(true);
    expect(group(id).repeat).toBeUndefined();
    expect(canApplyTransforms(editor)).toBe(false);
  });

  test('applying a transform turns each copy into layers, where they were drawn', () => {
    const id = addRepeatTransform(editor, 'LINEAR')!;
    setRepeatTransform(editor, id, { count: 3, spacing: 100 });
    expect(canApplyTransforms(editor)).toBe(true);

    expect(applyTransforms(editor)).toBe(true);
    const children = editor.doc.children(id).map((child) => editor.doc.getOrThrow(child) as SceneNode);
    expect(children).toHaveLength(3);
    expect(children.map((child) => child.transform[4]).sort((a, b) => a - b)).toEqual([0, 100, 200]);
    expect(group(id).repeat).toBeUndefined();
    // Undo puts the transform back, with the copies gone again.
    editor.history.undo();
    expect(editor.doc.children(id)).toHaveLength(1);
    expect(group(id).repeat).toMatchObject({ count: 3 });
  });
});
