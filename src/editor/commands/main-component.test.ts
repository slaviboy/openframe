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
import { canGoToMainComponent, canRestoreMainComponent, goToMainComponent, pushChangesToMain, restoreMainComponent } from './main-component';

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
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  child = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Shape', x: 0, y: 0, width: 50, height: 50 }));
    return id;
  });
  editor.history.run('Fill', (tx) => tx.set(child, 'fills', [red]));
  editor.state.select([child]);
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
  editor.commands.run('edit.duplicate');
  instance = editor.selection[0]!;
  instanceChild = editor.doc.children(instance)[0]!;
});

describe('main component commands', () => {
  test('go to main component selects it, from the instance or a layer inside it', () => {
    editor.state.select([instanceChild]);
    expect(canGoToMainComponent(editor)).toBe(true);
    expect(goToMainComponent(editor)).toBe(true);
    expect(editor.selection).toEqual([main]);
  });

  test("push changes to main component passes an instance's changes to the component and its other instances", () => {
    editor.state.select([instance]);
    editor.commands.run('edit.duplicate');
    const other = editor.selection[0]!;
    const otherChild = editor.doc.children(other)[0]!;
    editor.history.run('Override', (tx) => tx.set(instanceChild, 'fills', [blue]));
    editor.state.select([instance]);
    expect(pushChangesToMain(editor)).toBe(true);
    expect(node(child).fills).toEqual([blue]);
    expect(node(otherChild).fills).toEqual([blue]);
    expect(node(instanceChild).overrides).toBeUndefined();
    editor.history.undo();
    expect(node(child).fills).toEqual([red]);
  });

  test('restore main component rebuilds a deleted component from an instance and links the instance to it', () => {
    editor.history.run('Delete main', (tx) => tx.delete(main));
    editor.state.select([instance]);
    expect(canGoToMainComponent(editor)).toBe(false);
    expect(canRestoreMainComponent(editor)).toBe(true);
    const restored = restoreMainComponent(editor)!;
    expect(node(restored)).toMatchObject({ type: 'FRAME', component: {}, name: 'Component 1' });
    expect(node(instance).instance).toEqual({ mainId: restored });
    const restoredChild = editor.doc.children(restored)[0]!;
    expect(node(instanceChild).source).toBe(restoredChild);
    // The restored component drives the instance again.
    editor.history.run('Fill', (tx) => tx.set(restoredChild, 'fills', [blue]));
    expect(node(instanceChild).fills).toEqual([blue]);
  });
});
