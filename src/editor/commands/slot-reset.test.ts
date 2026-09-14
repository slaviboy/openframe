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
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { convertToSlot } from './component-properties';
import { insertInstance } from './insert-instance';
import { overrideLabel, resetSelectedOverride, selectionOverriddenFields } from './reset-overrides';

let editor: Editor;
/** A card component: a Content slot holding a Placeholder rectangle, and a Label rectangle; and one instance of it. */
let main: string;
let content: string;
let placeholder: string;
let instance: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;
const children = (id: string) => editor.doc.children(id);
const sources = (id: string) => children(id).map((child) => node(child).source);
const slotIn = (id: string) => children(id).find((child) => node(child).source === content)!;

/** Adds a 10 × 10 rectangle named `name` to `parent`. */
const addRect = (parent: string, name: string) =>
  editor.history.run('Add', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name, x: 40, y: 20, width: 10, height: 10 }));
    return id;
  });

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  let label: string;
  [content, placeholder, label] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const frame = editor.ids.next();
    tx.create(makeFrame({ id: frame, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Content', x: 0, y: 0, width: 100, height: 60 }));
    const rect = editor.ids.next();
    tx.create(makeRectangle({ id: rect, parent: { id: frame, key: keyOnTop(tx.store, frame) }, name: 'Placeholder', x: 10, y: 10, width: 20, height: 20 }));
    const labelId = editor.ids.next();
    tx.create(makeRectangle({ id: labelId, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Label', x: 0, y: 70, width: 60, height: 20 }));
    return [frame, rect, labelId];
  });
  editor.state.select([content, label]);
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
  convertToSlot(editor, content);
  instance = insertInstance(editor, main)!;
});

describe('reset slot and delete contents', () => {
  test('Reset slot brings back the main component slot content, which the slot follows again', () => {
    const slot = slotIn(instance);
    const [placeholderCopy] = children(slot) as [string];
    editor.history.run('Move', (tx) => tx.set(placeholderCopy, 'transform', [1, 0, 0, 1, 30, 30]));
    addRect(slot, 'Mine');
    expect(node(slot).overrides).toEqual(['slotContent']);

    editor.state.select([slot]);
    expect(selectionOverriddenFields(editor)).toEqual(['slotContent']);
    expect(overrideLabel('slotContent')).toBe('slot');
    expect(resetSelectedOverride(editor, 'slotContent')).toBe(true);
    expect(node(slot).overrides).toBeUndefined();
    expect(sources(slot)).toEqual([placeholder]);
    const [fresh] = children(slot) as [string];
    expect(node(fresh).transform).toEqual(node(placeholder).transform);

    // The slot follows the main component again.
    const added = addRect(content, 'Added');
    expect(sources(slot)).toEqual([placeholder, added]);
    expect(node(slot).overrides).toBeUndefined();

    // Undo brings the changed content back.
    editor.history.undo();
    editor.history.undo();
    expect(children(slot).map((id) => node(id).name)).toEqual(['Placeholder', 'Mine']);
    expect(node(slot).overrides).toEqual(['slotContent']);
  });

  test('Reset all changes on the instance resets its slots too', () => {
    const slot = slotIn(instance);
    addRect(slot, 'Mine');
    editor.state.select([instance]);
    editor.commands.run('object.resetOverrides');
    expect(sources(slot)).toEqual([placeholder]);
    expect(node(slot).overrides).toBeUndefined();
  });

  test('Delete contents empties a slot of an instance and marks it changed', () => {
    const slot = slotIn(instance);
    editor.state.select([slot]);
    expect(editor.commands.isEnabled('object.deleteSlotContents')).toBe(true);
    editor.commands.run('object.deleteSlotContents');
    expect(children(slot)).toEqual([]);
    expect(node(slot).overrides).toEqual(['slotContent']);
    expect(editor.commands.isEnabled('object.deleteSlotContents')).toBe(false);
    // The main component's slot is edited directly instead.
    editor.state.select([content]);
    expect(editor.commands.isEnabled('object.deleteSlotContents')).toBe(false);
  });
});
