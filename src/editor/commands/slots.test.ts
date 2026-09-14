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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { canConvertToSlot, convertToSlot, createSlotProperty, deleteComponentProperty, setSlotSettings, wrapInNewSlot } from './component-properties';
import { insertInstance } from './insert-instance';

let editor: Editor;
let main: string;
let content: string;
let label: string;
let icon: string;
let other: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  // A card component with a Content frame (holding a rectangle), a label and an icon.
  [content, label, icon] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const frame = editor.ids.next();
    tx.create(makeFrame({ id: frame, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Content', x: 0, y: 0, width: 100, height: 60 }));
    const rect = editor.ids.next();
    tx.create(makeRectangle({ id: rect, parent: { id: frame, key: keyOnTop(tx.store, frame) }, name: 'Placeholder', x: 10, y: 10, width: 20, height: 20 }));
    const text = editor.ids.next();
    tx.create(makeText({ id: text, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Label', x: 0, y: 70, width: 60, height: 20 }));
    const iconId = editor.ids.next();
    tx.create(makeRectangle({ id: iconId, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Icon', x: 70, y: 70, width: 20, height: 20 }));
    return [frame, text, iconId];
  });
  editor.state.select([content, label, icon]);
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
  other = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Avatar', x: 300, y: 0, width: 20, height: 20 }));
    return id;
  });
  editor.state.select([other]);
  editor.commands.run('object.createComponent');
  other = editor.selection[0]!;
});

describe('slots', () => {
  test('Convert to slot makes a nested frame a slot with a new slot property; only frames nested in components convert', () => {
    expect(canConvertToSlot(editor, main)).toBe(false);
    expect(canConvertToSlot(editor, label)).toBe(false);
    editor.state.select([content]);
    expect(editor.commands.get('object.convertToSlot')?.shortcuts).toEqual(['Mod+Shift+S']);
    editor.commands.run('object.convertToSlot');
    expect(node(main).componentPropertyDefinitions).toEqual({ Slot: { type: 'SLOT' } });
    expect(node(content).componentPropertyReferences).toEqual({ slot: 'Slot' });
    expect(canConvertToSlot(editor, content)).toBe(false);

    // Instances copy the slot.
    const instance = insertInstance(editor, main)!;
    const contentCopy = editor.doc.children(instance).find((id) => node(id).source === content)!;
    expect(node(contentCopy).componentPropertyReferences).toEqual({ slot: 'Slot' });

    editor.history.undo();
    editor.history.undo();
    expect(node(main).componentPropertyDefinitions).toBeUndefined();
    expect(node(content).componentPropertyReferences).toBeUndefined();
  });

  test('a frame converts to an existing slot property, and new ones are numbered', () => {
    expect(createSlotProperty(editor, main, 'Body')).toBe(true);
    expect(convertToSlot(editor, content, 'Missing')).toBeNull();
    expect(convertToSlot(editor, content, 'Body')).toBe('Body');
    expect(node(main).componentPropertyDefinitions).toEqual({ Body: { type: 'SLOT' } });

    editor.state.select([label, icon]);
    const slot = wrapInNewSlot(editor)!;
    expect(node(main).componentPropertyDefinitions).toEqual({ Body: { type: 'SLOT' }, Slot: { type: 'SLOT' } });
    editor.state.select([editor.doc.children(slot)[0]!]);
    expect(wrapInNewSlot(editor)).not.toBeNull();
    expect(Object.keys(node(main).componentPropertyDefinitions as object)).toEqual(['Body', 'Slot', 'Slot 2']);
  });

  test('Wrap in new slot puts the selected layers in a new slot frame where they are, as one undo step', () => {
    editor.state.select([label, icon]);
    const slot = wrapInNewSlot(editor)!;
    expect(editor.selection).toEqual([slot]);
    // New frames are numbered like other new layers; the slot property is named Slot.
    expect(node(slot)).toMatchObject({ type: 'FRAME', name: 'Slot 1', fills: [], componentPropertyReferences: { slot: 'Slot' }, transform: [1, 0, 0, 1, 0, 70] });
    expect(editor.doc.parentOf(slot)).toBe(main);
    expect(editor.doc.children(slot)).toEqual([label, icon]);
    editor.history.undo();
    expect(editor.doc.parentOf(label)).toBe(main);
    expect(node(main).componentPropertyDefinitions).toBeUndefined();
  });

  test('slot settings: description, layer limits and preferred instances', () => {
    convertToSlot(editor, content);
    expect(setSlotSettings(editor, main, 'Slot', { description: ' Cards go here ', minLayers: 1, maxLayers: 5, preferredValues: [other], onlyPreferred: true, showEmpty: true, fillCounterAxis: true })).toBe(true);
    expect(node(main).componentPropertyDefinitions).toEqual({
      Slot: { type: 'SLOT', description: 'Cards go here', minLayers: 1, maxLayers: 5, preferredValues: [other], onlyPreferred: true, showEmpty: true, fillCounterAxis: true },
    });
    // Invalid settings are refused: a minimum above the maximum, fractional limits, preferred layers that aren't components.
    expect(setSlotSettings(editor, main, 'Slot', { minLayers: 6 })).toBe(false);
    expect(setSlotSettings(editor, main, 'Slot', { maxLayers: 2.5 })).toBe(false);
    expect(setSlotSettings(editor, main, 'Slot', { preferredValues: [label] })).toBe(false);
    // Settings are cleared with undefined or false.
    expect(setSlotSettings(editor, main, 'Slot', { minLayers: undefined, maxLayers: undefined, preferredValues: [], onlyPreferred: false, showEmpty: false, fillCounterAxis: false, description: '' })).toBe(true);
    expect(node(main).componentPropertyDefinitions).toEqual({ Slot: { type: 'SLOT' } });
  });

  test('deleting a slot property keeps the frame and its contents', () => {
    convertToSlot(editor, content);
    const [placeholder] = editor.doc.children(content);
    expect(deleteComponentProperty(editor, main, 'Slot')).toBe(true);
    expect(node(main).componentPropertyDefinitions).toBeUndefined();
    expect(node(content).componentPropertyReferences).toBeUndefined();
    expect(editor.doc.children(content)).toEqual([placeholder]);
  });
});
