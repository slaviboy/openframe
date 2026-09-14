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
import { containerAt } from '../tools/draw-helpers';
import { BUILTIN_COMMANDS } from './builtin';
import { convertToSlot } from './component-properties';
import { insertInstance } from './insert-instance';

let editor: Editor;
/** A card component: a Content slot holding a Placeholder rectangle, and a Label rectangle. */
let main: string;
let content: string;
let placeholder: string;
let label: string;
/** Two instances of it, side by side. */
let instance: string;
let other: string;

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
  other = insertInstance(editor, main)!;
  editor.history.run('Move other', (tx) => tx.set(other, 'transform', [1, 0, 0, 1, 400, 0]));
});

describe('slot content in instances', () => {
  test('new layers go into an instance only inside its slot', () => {
    editor.scene.ensure(editor.pageId);
    const slot = editor.scene.worldBounds(slotIn(instance))!;
    const box = editor.scene.worldBounds(instance)!;
    expect(containerAt(editor, { x: slot.x + 5, y: slot.y + 5 })).toBe(slotIn(instance));
    // Inside the instance but outside its slot, new layers go beside the instance.
    expect(containerAt(editor, { x: box.x + 5, y: box.y + 65 })).toBe(editor.pageId);
    // The main component's slot is a regular frame.
    expect(containerAt(editor, { x: 5, y: 5 })).toBe(content);
  });

  test('moving content in an instance slot is kept and marks the slot changed; the main component stops reaching it', () => {
    const slot = slotIn(instance);
    const [placeholderCopy] = children(slot) as [string];
    editor.history.run('Move', (tx) => tx.set(placeholderCopy, 'transform', [1, 0, 0, 1, 30, 30]));
    expect(node(placeholderCopy).transform).toEqual([1, 0, 0, 1, 30, 30]);
    expect(node(slot).overrides).toEqual(['slotContent']);
    expect(node(slotIn(other)).overrides).toBeUndefined();

    // Content added to the main component's slot reaches the untouched instance only, without marking it.
    const added = addRect(content, 'Added');
    expect(sources(slotIn(other))).toEqual([placeholder, added]);
    expect(node(slotIn(other)).overrides).toBeUndefined();
    expect(sources(slot)).toEqual([placeholder]);

    // Moving the main component's placeholder leaves the changed slot's copy where it was.
    editor.history.run('Move main', (tx) => tx.set(placeholder, 'transform', [1, 0, 0, 1, 2, 2]));
    expect(node(placeholderCopy).transform).toEqual([1, 0, 0, 1, 30, 30]);
    const [otherPlaceholder] = children(slotIn(other)) as [string];
    expect(node(otherPlaceholder).transform).toEqual([1, 0, 0, 1, 2, 2]);

    editor.history.undo();
    editor.history.undo();
    editor.history.undo();
    expect(node(placeholderCopy).transform).toEqual([1, 0, 0, 1, 10, 10]);
    expect(node(slot).overrides).toBeUndefined();
  });

  test('layers added to or deleted from an instance slot stay, and the main component deleting its content leaves changed slots alone', () => {
    const slot = slotIn(instance);
    const mine = addRect(slot, 'Mine');
    expect(children(slot)).toContain(mine);
    expect(node(slot).overrides).toEqual(['slotContent']);

    const otherSlot = slotIn(other);
    const [otherPlaceholder] = children(otherSlot) as [string];
    editor.history.run('Delete', (tx) => tx.delete(otherPlaceholder));
    expect(children(otherSlot)).toEqual([]);
    expect(node(otherSlot).overrides).toEqual(['slotContent']);

    editor.history.run('Delete main', (tx) => tx.delete(placeholder));
    expect(children(slot).map((id) => node(id).name)).toEqual(['Placeholder', 'Mine']);
  });

  test('outside its slots an instance keeps its structure', () => {
    const labelCopy = children(instance).find((id) => node(id).source === label)!;
    editor.history.run('Move label', (tx) => tx.set(labelCopy, 'transform', [1, 0, 0, 1, 50, 50]));
    expect(node(labelCopy).transform).toEqual([1, 0, 0, 1, 0, 70]);
    expect(node(instance).overrides).toBeUndefined();
  });
});
