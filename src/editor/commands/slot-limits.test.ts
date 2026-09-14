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
import { slotIndicators, slotLimits, slotLimitWarning } from '@/core/document/component-properties';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { convertToSlot, deleteSlotContents, setSlotSettings } from './component-properties';
import { insertInstance, insertInstanceInto } from './insert-instance';

let editor: Editor;
/** A card component: a Content slot holding a Placeholder rectangle; an Avatar component; and an instance of the card. */
let main: string;
let content: string;
let avatar: string;
let instance: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;
const children = (id: string) => editor.doc.children(id);
const slotIn = (id: string) => children(id).find((child) => node(child).source === content)!;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  [content] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const frame = editor.ids.next();
    tx.create(makeFrame({ id: frame, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Content', x: 0, y: 0, width: 100, height: 60 }));
    const rect = editor.ids.next();
    tx.create(makeRectangle({ id: rect, parent: { id: frame, key: keyOnTop(tx.store, frame) }, name: 'Placeholder', x: 10, y: 10, width: 20, height: 20 }));
    return [frame];
  });
  editor.state.select([content]);
  editor.commands.run('object.frameSelection');
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
  convertToSlot(editor, content);
  avatar = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Avatar', x: 300, y: 0, width: 20, height: 20 }));
    return id;
  });
  editor.state.select([avatar]);
  editor.commands.run('object.createComponent');
  avatar = editor.selection[0]!;
  instance = insertInstance(editor, main)!;
});

describe('slot limits', () => {
  test('count the layers of a slot and check preferred instances', () => {
    expect(setSlotSettings(editor, main, 'Slot', { minLayers: 2, maxLayers: 3, onlyPreferred: true, preferredValues: [avatar] })).toBe(true);
    const slot = slotIn(instance);
    expect(slotLimits(editor.doc, slot)).toMatchObject({ name: 'Slot', count: 1, minLayers: 2, maxLayers: 3, onlyPreferred: true, preferred: [avatar] });
    // The placeholder rectangle isn't a preferred instance.
    expect(slotLimits(editor.doc, slot)!.notPreferred).toEqual(children(slot));
    expect(slotLimitWarning(editor.doc, slot)).toBe('Slot has 1 layer, fewer than its minimum of 2.');
    expect(slotLimits(editor.doc, instance)).toBeNull();
  });

  test('Add instances inserts into the slot, which is then changed, filling its counter-axis when set', () => {
    editor.history.run('Auto layout', (tx) => tx.set(content, 'layoutMode', 'VERTICAL'));
    setSlotSettings(editor, main, 'Slot', { fillCounterAxis: true, maxLayers: 1 });
    const slot = slotIn(instance);
    const added = insertInstanceInto(editor, avatar, slot)!;
    expect(editor.doc.parentOf(added)).toBe(slot);
    expect(node(added)).toMatchObject({ instance: { mainId: avatar }, layoutSizingHorizontal: 'FILL' });
    expect(editor.selection).toEqual([added]);
    expect(node(slot).overrides).toEqual(['slotContent']);
    expect(slotLimitWarning(editor.doc, slot)).toBe('Slot has 2 layers, more than its maximum of 1.');

    // Not into an instance outside its slots, and not a component into itself.
    expect(insertInstanceInto(editor, avatar, instance)).toBeNull();
    expect(insertInstanceInto(editor, main, content)).toBeNull();
  });

  test('the canvas marks the slots of a hovered instance, and empty slots set to show', () => {
    const slot = slotIn(instance);
    expect(slotIndicators(editor.doc, editor.pageId, null)).toEqual([]);
    expect(slotIndicators(editor.doc, editor.pageId, instance)).toEqual([slot]);
    expect(slotIndicators(editor.doc, editor.pageId, children(slot)[0]!)).toEqual([slot]);
    setSlotSettings(editor, main, 'Slot', { showEmpty: true });
    deleteSlotContents(editor, slot);
    expect(slotIndicators(editor.doc, editor.pageId, null)).toEqual([slot]);
  });
});
