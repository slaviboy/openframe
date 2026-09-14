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
import { swapInstanceFor } from './swap-instance';

const red = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const blue = { type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const green = { type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;

let editor: Editor;
/** Main component A: one rectangle. */
let a: string;
let aRect: string;
/** Main component B, wrapping an instance of A. */
let b: string;
let aInB: string;
let aInBRect: string;
/** An instance of B, and the copy of the nested instance of A in it. */
let bInstance: string;
let nested: string;
let nestedRect: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;
const fill = (id: string, paint: typeof red | typeof blue | typeof green) => editor.history.run('Fill', (tx) => tx.set(id, 'fills', [paint]));

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  aRect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x: 0, y: 0, width: 40, height: 40 }));
    return id;
  });
  editor.state.select([aRect]);
  editor.commands.run('object.createComponent');
  a = editor.selection[0]!;
  aInB = insertInstance(editor, a)!;
  [aInBRect] = editor.doc.children(aInB) as [string];
  editor.state.select([aInB]);
  editor.commands.run('object.createComponent');
  b = editor.selection[0]!;
  bInstance = insertInstance(editor, b)!;
  [nested] = editor.doc.children(bInstance) as [string];
  [nestedRect] = editor.doc.children(nested) as [string];
});

describe('nested instances', () => {
  test('the copy of a nested instance links to the nested instance in the component', () => {
    expect(editor.doc.parentOf(aInB)).toBe(b);
    expect(node(nested)).toMatchObject({ instance: { mainId: a }, source: aInB });
    expect(node(nestedRect).source).toBe(aInBRect);
  });

  test('a change to the inner component reaches its instances in other components and their instances', () => {
    fill(aRect, red);
    expect(node(aInBRect).fills).toEqual([red]);
    expect(node(nestedRect).fills).toEqual([red]);
    expect(node(nestedRect).overrides).toBeUndefined();
    editor.history.undo();
    expect(node(nestedRect).fills).not.toEqual([red]);
  });

  test("changing the nested instance inside a component overrides it there and reaches that component's instances", () => {
    fill(aInBRect, blue);
    expect(node(aInBRect)).toMatchObject({ fills: [blue], overrides: ['fills'] });
    expect(node(nestedRect).fills).toEqual([blue]);
    expect(node(nestedRect).overrides).toBeUndefined();
    // The inner component changing again doesn't undo the change made in the outer component.
    fill(aRect, red);
    expect(node(aInBRect).fills).toEqual([blue]);
    expect(node(nestedRect).fills).toEqual([blue]);
  });

  test('changes on the outer instance are kept, and reset all changes brings back the outer component', () => {
    fill(nestedRect, green);
    expect(node(nestedRect)).toMatchObject({ fills: [green], overrides: ['fills'] });
    fill(aInBRect, blue);
    expect(node(nestedRect).fills).toEqual([green]);
    editor.state.select([bInstance]);
    editor.commands.run('object.resetOverrides');
    expect(node(nestedRect).fills).toEqual([blue]);
    expect(node(nestedRect).overrides).toBeUndefined();
  });

  test('moving or renaming the nested instance inside its component updates its copies; the inner component placement stays out', () => {
    editor.history.run('Move nested', (tx) => tx.set(aInB, 'transform', [1, 0, 0, 1, 10, 5]));
    editor.history.run('Rename nested', (tx) => tx.set(aInB, 'name', 'Icon'));
    expect(node(nested)).toMatchObject({ transform: [1, 0, 0, 1, 10, 5], name: 'Icon' });
    expect(node(nested).overrides).toBeUndefined();
    // Moving the inner main component doesn't move its instances.
    editor.history.run('Move A', (tx) => tx.set(a, 'transform', [1, 0, 0, 1, 500, 500]));
    expect(node(aInB).transform).toEqual([1, 0, 0, 1, 10, 5]);
  });
});

/** Another main component, with a rectangle named like A's, at (x, 200). */
function component(x: number): [string, string] {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x, y: 200, width: 40, height: 40 }));
    return id;
  });
  editor.state.select([rect]);
  editor.commands.run('object.createComponent');
  return [editor.selection[0]!, rect];
}

describe('swapping nested instances', () => {
  test('a swapped copy of a nested instance stays linked, keeps the swap as its own change, and reset swaps it back', () => {
    const [other, otherRect] = component(300);
    fill(nestedRect, green);
    expect(swapInstanceFor(editor, nested, other)).toBe(true);
    const [swappedRect] = editor.doc.children(nested) as [string];
    expect(node(nested)).toMatchObject({ instance: { mainId: other }, source: aInB });
    expect(node(nested).overrides).toContain('instance');
    expect(node(swappedRect)).toMatchObject({ source: otherRect, fills: [green] });

    // The nested instance changing in its component doesn't undo the swap, but moving it still moves the copy.
    fill(aInBRect, blue);
    expect(node(nested).instance).toEqual({ mainId: other });
    editor.history.run('Move nested', (tx) => tx.set(aInB, 'transform', [1, 0, 0, 1, 10, 5]));
    expect(node(nested).transform).toEqual([1, 0, 0, 1, 10, 5]);
    // The new component's changes reach the swapped copy.
    editor.history.run('Other shape name', (tx) => tx.set(otherRect, 'opacity', 0.5));
    expect(node(swappedRect).opacity).toBe(0.5);

    editor.state.select([bInstance]);
    editor.commands.run('object.resetOverrides');
    expect(node(nested)).toMatchObject({ instance: { mainId: a }, source: aInB });
    expect(node(nested).overrides).toBeUndefined();
    const [resetRect] = editor.doc.children(nested) as [string];
    expect(node(resetRect)).toMatchObject({ source: aInBRect, fills: [blue] });
  });

  test("swapping a nested instance inside a component swaps its copies in the component's instances, unless they were swapped", () => {
    const [other, otherRect] = component(300);
    const [third] = component(600);
    const second = insertInstance(editor, b)!;
    const [secondNested] = editor.doc.children(second) as [string];
    swapInstanceFor(editor, secondNested, third);
    fill(nestedRect, green);

    expect(swapInstanceFor(editor, aInB, other)).toBe(true);
    expect(node(aInB).instance).toEqual({ mainId: other });
    expect(node(aInB).source).toBeUndefined();
    const [innerRect] = editor.doc.children(aInB) as [string];
    expect(node(innerRect).source).toBe(otherRect);
    // The copy follows, linked to the new layers, and keeps its own changes.
    expect(node(nested)).toMatchObject({ instance: { mainId: other }, source: aInB });
    expect(node(nested).overrides).toBeUndefined();
    const [copyRect] = editor.doc.children(nested) as [string];
    expect(node(copyRect)).toMatchObject({ source: innerRect, fills: [green] });
    // The instance that swapped its copy keeps its own choice.
    expect(node(secondNested).instance).toEqual({ mainId: third });

    editor.history.undo();
    expect(node(nested).instance).toEqual({ mainId: a });
    expect(node(aInB).instance).toEqual({ mainId: a });
  });
});
