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
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';

let editor: Editor;
let main: string;
let child: string;
let instance: string;
let instanceChild: string;

const red = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const blue = { ...red, color: { r: 0, g: 0, b: 1, a: 1 } } as const;
const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  child = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Shape', x: 0, y: 0, width: 50, height: 50 }));
    return id;
  });
  editor.state.select([child]);
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
  editor.commands.run('edit.duplicate');
  instance = editor.selection[0]!;
  instanceChild = editor.doc.children(instance)[0]!;
});

describe('component instances', () => {
  test('duplicating a main component creates an instance linked to it, layer by layer', () => {
    expect(node(instance)).toMatchObject({ type: 'FRAME', instance: { mainId: main }, name: 'Component 1' });
    expect(node(instance).component).toBeUndefined();
    expect(node(instanceChild)).toMatchObject({ source: child, name: 'Shape' });
  });

  test('changes to the main component reach its instances', () => {
    editor.history.run('Fill', (tx) => tx.set(child, 'fills', [red]));
    expect(node(instanceChild).fills).toEqual([red]);
    editor.history.run('Resize', (tx) => tx.set(main, 'size', { width: 80, height: 50 }));
    expect(node(instance).size).toEqual({ width: 80, height: 50 });
  });

  test('an instance keeps its overrides when the main component changes, and its own position', () => {
    editor.history.run('Override', (tx) => tx.set(instanceChild, 'fills', [blue]));
    expect(node(instanceChild).overrides).toEqual(['fills']);
    editor.history.run('Fill', (tx) => tx.set(child, 'fills', [red]));
    expect(node(instanceChild).fills).toEqual([blue]);
    const before = node(instance).transform;
    editor.history.run('Move main', (tx) => tx.set(main, 'transform', [1, 0, 0, 1, 500, 500]));
    expect(node(instance).transform).toEqual(before);
  });

  test("an instance's layers can't be moved or resized: those changes are reverted", () => {
    const before = node(instanceChild).transform;
    editor.history.run('Move layer', (tx) => tx.set(instanceChild, 'transform', [1, 0, 0, 1, 20, 20]));
    expect(node(instanceChild).transform).toEqual(before);
    expect(node(instanceChild).overrides).toBeUndefined();
  });
});
