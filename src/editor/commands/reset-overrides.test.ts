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
import { canResetOverrides, resetSelectedOverrides } from './reset-overrides';

let editor: Editor;
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
  editor.history.run('Fill', (tx) => tx.set(child, 'fills', [red]));
  editor.state.select([child]);
  editor.commands.run('object.createComponent');
  editor.commands.run('edit.duplicate');
  instance = editor.selection[0]!;
  instanceChild = editor.doc.children(instance)[0]!;
});

describe('reset instance overrides', () => {
  test('reset all changes on an instance restores the main component values, and later component changes reach it again', () => {
    editor.history.run('Override', (tx) => {
      tx.set(instanceChild, 'fills', [blue]);
      tx.set(instanceChild, 'name', 'Custom');
    });
    expect(node(instanceChild).overrides).toEqual(['fills', 'name']);
    expect(canResetOverrides(editor)).toBe(true);

    expect(resetSelectedOverrides(editor)).toBe(true);
    expect(node(instanceChild).fills).toEqual([red]);
    expect(node(instanceChild).name).toBe('Shape');
    expect(node(instanceChild).overrides).toBeUndefined();
    expect(canResetOverrides(editor)).toBe(false);

    editor.history.run('Main fill', (tx) => tx.set(child, 'fills', [blue]));
    expect(node(instanceChild).fills).toEqual([blue]);
    editor.history.undo();
    editor.history.undo();
    expect(node(instanceChild).overrides).toEqual(['fills', 'name']);
  });

  test("changing a field back to the main component's value stops overriding it", () => {
    editor.history.run('Override', (tx) => tx.set(instanceChild, 'fills', [blue]));
    editor.history.run('Back', (tx) => tx.set(instanceChild, 'fills', [red]));
    expect(node(instanceChild).overrides).toBeUndefined();
  });
});
