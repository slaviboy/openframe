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
import { instantiate } from '@/core/document/instances';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { instanceToSwap, relatedComponents, swapInstanceFor } from './swap-instance';

let editor: Editor;
let first: string;
let second: string;
let instance: string;

const blue = { type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

/** A component wrapping one rectangle named "Label" and, optionally, a second one named "Icon". */
function component(x: number, withIcon: boolean): string {
  const ids = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const label = editor.ids.next();
    tx.create(makeRectangle({ id: label, parent: { id: page, key: keyOnTop(editor.doc, page) }, name: 'Label', x, y: 0, width: 60, height: 20 }));
    if (!withIcon) return [label];
    const icon = editor.ids.next();
    tx.create(makeRectangle({ id: icon, parent: { id: page, key: keyOnTop(editor.doc, page) }, name: 'Icon', x, y: 30, width: 20, height: 20 }));
    return [label, icon];
  });
  editor.state.select(ids);
  editor.commands.run('object.createComponent');
  return editor.selection[0]!;
}

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  first = component(0, false);
  second = component(200, true);
  editor.state.select([first]);
  editor.commands.run('edit.duplicate');
  instance = editor.selection[0]!;
  editor.history.run('Move instance', (tx) => tx.set(instance, 'transform', [1, 0, 0, 1, 0, 300]));
  editor.history.run('Override', (tx) => tx.set(editor.doc.children(instance)[0]!, 'fills', [blue]));
});

describe('swap instance', () => {
  test('rebuilds the instance from another component, keeping its position and the changes on layers with matching names', () => {
    expect(swapInstanceFor(editor, instance, second)).toBe(true);
    expect(node(instance)).toMatchObject({ instance: { mainId: second }, name: node(second).name });
    expect(node(instance).transform).toEqual([1, 0, 0, 1, 0, 300]);
    expect(node(instance).size).toEqual(node(second).size);
    const layers = editor.doc.children(instance).map((id) => node(id));
    expect(layers.map((l) => l.name)).toEqual(['Label', 'Icon']);
    expect(layers[0]).toMatchObject({ fills: [blue], overrides: ['fills'] });
    expect(layers[1]!.overrides).toBeUndefined();
    expect(editor.selection).toEqual([instance]);
  });

  test('the swapped instance follows its new component, and undo swaps back', () => {
    swapInstanceFor(editor, instance, second);
    const icon = editor.doc.children(second)[1]!;
    editor.history.run('Icon fill', (tx) => tx.set(icon, 'fills', [blue]));
    expect(node(editor.doc.children(instance)[1]!).fills).toEqual([blue]);
    editor.history.undo();
    editor.history.undo();
    expect(node(instance).instance).toEqual({ mainId: first });
    expect(editor.doc.children(instance)).toHaveLength(1);
  });
});

describe('instance to swap on drop', () => {
  test('⌥ targets the instance under the pointer when it is not nested in a frame or component', () => {
    expect(instanceToSwap(editor, { x: 10, y: 310 }, false)).toBe(instance);
    expect(instanceToSwap(editor, { x: 10, y: 310 }, true)).toBe(instance);
    expect(instanceToSwap(editor, { x: 900, y: 900 }, false)).toBeNull();
    // A main component is not an instance, so dropping on it inserts instead.
    expect(instanceToSwap(editor, { x: 10, y: 10 }, false)).toBeNull();
  });

  test('⌥⌘ is needed to target an instance nested in a frame', () => {
    const nested = editor.history.run('Nested instance', (tx) => {
      const frame = editor.ids.next();
      tx.create(makeFrame({ id: frame, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Card', x: 400, y: 0, width: 200, height: 200 }));
      return instantiate(tx, first, frame, keyOnTop(tx.store, frame), () => editor.ids.next(), { fields: { transform: [1, 0, 0, 1, 10, 10] } });
    });
    expect(instanceToSwap(editor, { x: 420, y: 20 }, false)).toBeNull();
    expect(instanceToSwap(editor, { x: 420, y: 20 }, true)).toBe(nested);
  });
});

describe('related components', () => {
  test('are the main components next to the instance\'s main component, for the right-click Swap instance menu', () => {
    expect(relatedComponents(editor, instance).map((component) => component.id)).toEqual([first, second]);
    expect(relatedComponents(editor, first)).toEqual([]);
  });
});
