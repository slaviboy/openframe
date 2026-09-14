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
import { createEmptyDocument, keyOnTop, makeFrame } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { convertToSlot } from '../commands/component-properties';
import { insertInstance } from '../commands/insert-instance';
import { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';
import { addInstancesButtonRect, hitAddInstancesButton, hoveredInstanceSlots } from './selection-geometry';

let editor: Editor;
let main: string;
let content: string;
let instance: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  content = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Content', x: 0, y: 0, width: 200, height: 80 }));
    return id;
  });
  editor.state.select([content]);
  editor.commands.run('object.frameSelection');
  editor.commands.run('object.createComponent');
  main = editor.selection[0]!;
  convertToSlot(editor, content);
  instance = insertInstance(editor, main)!;
  editor.scene.ensure(editor.pageId);
});

describe('Add instances on the canvas', () => {
  test('hovering an instance shows a pill in the top-left corner of each of its slots, which hits its slot', () => {
    editor.state.setHover(null);
    expect(hoveredInstanceSlots(editor)).toEqual([]);

    const [slot] = editor.doc.children(instance) as [string];
    editor.state.setHover(instance);
    expect(hoveredInstanceSlots(editor)).toEqual([slot]);
    const rect = addInstancesButtonRect(editor, slot)!;
    const origin = worldToScreen(editor.state.viewport, { x: node(instance).transform[4], y: node(instance).transform[5] });
    expect(rect.x).toBeCloseTo(origin.x + 8, 5);
    expect(rect.y).toBeCloseTo(origin.y + 8, 5);
    expect(hitAddInstancesButton(editor, { x: rect.x + 4, y: rect.y + 4 })).toBe(slot);
    expect(hitAddInstancesButton(editor, { x: rect.x - 20, y: rect.y - 20 })).toBeNull();

    // The main component's slot is edited directly, so it shows no pill.
    editor.state.setHover(main);
    expect(hoveredInstanceSlots(editor)).toEqual([]);
  });
});
