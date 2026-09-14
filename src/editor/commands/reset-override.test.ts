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
import { insertInstance } from './insert-instance';
import { overrideLabel, resetSelectedOverride, selectionOverriddenFields } from './reset-overrides';

const blue = { type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;

let editor: Editor;
let mainRect: string;
let instance: string;
let child: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  mainRect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x: 0, y: 0, width: 40, height: 40 }));
    return id;
  });
  editor.state.select([mainRect]);
  editor.commands.run('object.createComponent');
  instance = insertInstance(editor, editor.selection[0]!)!;
  [child] = editor.doc.children(instance) as [string];
});

describe('reset a single property', () => {
  test('Reset [property] resets one changed property of the selection and keeps the other changes', () => {
    editor.history.run('Change', (tx) => {
      tx.set(instance, 'name', 'Mine');
      tx.set(child, 'fills', [blue]);
      tx.set(child, 'opacity', 0.5);
    });
    editor.state.select([instance]);
    expect(selectionOverriddenFields(editor)).toEqual(['name', 'fills', 'opacity']);

    expect(resetSelectedOverride(editor, 'fills')).toBe(true);
    expect(node(child).fills).toEqual(node(mainRect).fills);
    expect(node(child)).toMatchObject({ opacity: 0.5, overrides: ['opacity'] });
    expect(node(instance)).toMatchObject({ name: 'Mine', overrides: ['name'] });
    expect(resetSelectedOverride(editor, 'fills')).toBe(false);

    // A layer inside the instance lists and resets its own changes only.
    editor.state.select([child]);
    expect(selectionOverriddenFields(editor)).toEqual(['opacity']);
    expect(resetSelectedOverride(editor, 'opacity')).toBe(true);
    expect(node(child).overrides).toBeUndefined();
    expect(node(instance).name).toBe('Mine');

    editor.history.undo();
    expect(node(child)).toMatchObject({ opacity: 0.5, overrides: ['opacity'] });
  });

  test('changed properties are named for the menu', () => {
    expect(overrideLabel('fills')).toBe('fill');
    expect(overrideLabel('instance')).toBe('instance swap');
    expect(overrideLabel('paragraphSpacing')).toBe('paragraph spacing');
  });
});
