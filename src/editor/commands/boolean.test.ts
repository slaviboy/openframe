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
import type { BooleanOperationNode, SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { flattenSelection } from './flatten';

let editor: Editor;
let base: string;
let top: string;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  [base, top] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const a = editor.ids.next();
    tx.create(makeRectangle({ id: a, parent: { id: page, key: keyOnTop(editor.doc, page) }, name: 'base', x: 0, y: 0, width: 100, height: 100 }));
    tx.set(a, 'strokeWeight', 3);
    const b = editor.ids.next();
    tx.create(makeRectangle({ id: b, parent: { id: page, key: keyOnTop(editor.doc, page) }, name: 'top', x: 50, y: 0, width: 100, height: 100 }));
    tx.set(b, 'strokeWeight', 5);
    return [a, b];
  });
});

const selected = () => editor.doc.getOrThrow(editor.selection[0]!) as BooleanOperationNode;

describe('boolean operation commands', () => {
  test('union wraps the layers in a boolean group styled like the top layer; undo and ungroup restore', () => {
    editor.state.select([base, top]);
    expect(editor.commands.run('object.booleanUnion')).not.toBe(false);
    const group = selected();
    expect(group).toMatchObject({ type: 'BOOLEAN_OPERATION', booleanOperation: 'UNION', name: 'Union 1', strokeWeight: 5 });
    expect(group.size).toEqual({ width: 150, height: 100 });
    expect(editor.doc.children(group.id)).toEqual([base, top]);

    editor.commands.run('object.ungroup');
    expect(editor.doc.has(group.id)).toBe(false);
    expect(editor.selection).toEqual([base, top]);
    expect((editor.doc.getOrThrow(top) as SceneNode).transform.slice(4)).toEqual([50, 0]);
    editor.history.undo();
    editor.history.undo();
    expect((editor.doc.getOrThrow(base) as SceneNode).parent.id).toBe(editor.pageId);
  });

  test('subtract takes the bottom layer style, and ⌥⇧S subtracts before it aligns to the parent', () => {
    const index = (id: string) => BUILTIN_COMMANDS.findIndex((c) => c.id === id);
    expect(index('object.booleanSubtract')).toBeLessThan(index('arrange.alignBottomToParent'));
    expect(editor.commands.get('object.booleanSubtract')?.shortcuts).toEqual(['Shift+Alt+S']);
    editor.state.select([top, base]);
    editor.commands.run('object.booleanSubtract');
    expect(selected()).toMatchObject({ booleanOperation: 'SUBTRACT', name: 'Subtract 1', strokeWeight: 3 });
  });

  test('needs two unlocked layers and no frames', () => {
    editor.state.select([base]);
    expect(editor.commands.get('object.booleanIntersect')!.enabled!(editor)).toBe(false);
    const frame = editor.history.run('frame', (tx) => {
      const id = editor.ids.next();
      tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'F', x: 0, y: 200, width: 50, height: 50 }));
      return id;
    });
    editor.state.select([base, frame]);
    expect(editor.commands.get('object.booleanExclude')!.enabled!(editor)).toBe(false);
  });
});

describe('changing and flattening a boolean group', () => {
  test('a boolean group already selected takes the new operation instead of being wrapped again', () => {
    editor.state.select([base, top]);
    editor.commands.run('object.booleanUnion');
    const group = selected();
    expect(group.booleanOperation).toBe('UNION');
    expect(group.name).toBe('Union 1');

    editor.commands.run('object.booleanSubtract');
    expect(editor.selection).toEqual([group.id]);
    expect(selected().booleanOperation).toBe('SUBTRACT');
    // The group was still called after its old operation, so it takes the new one's name, number and all.
    expect(selected().name).toBe('Subtract 1');
    expect(editor.doc.children(group.id)).toHaveLength(2);

    editor.history.undo();
    expect(selected().booleanOperation).toBe('UNION');
  });

  test('a group the designer named keeps that name when its operation changes', () => {
    editor.state.select([base, top]);
    editor.commands.run('object.booleanUnion');
    const id = editor.selection[0]!;
    editor.history.run('rename', (tx) => tx.set(id, 'name', 'Badge'));
    editor.commands.run('object.booleanIntersect');
    expect(selected().name).toBe('Badge');
    expect(selected().booleanOperation).toBe('INTERSECT');
  });

  test('running the same operation again on a group leaves it as it is, with no undo step', () => {
    editor.state.select([base, top]);
    editor.commands.run('object.booleanUnion');
    const before = editor.doc.rev;
    editor.commands.run('object.booleanUnion');
    expect(editor.doc.rev).toBe(before);
  });

  test('a boolean group flattens into the shape it combines to', async () => {
    editor.state.select([base, top]);
    editor.commands.run('object.booleanUnion');
    const group = editor.selection[0]!;
    // A stand-in for the engine: the combination is a 30-wide square, whatever the children are.
    editor.setGeometry({
      strokeOutline: () => null,
      regionMinusStroke: () => null,
      regionHalves: () => null,
      offsetNetwork: () => null,
      shapeFaces: () => [],
      booleanOutline: () => [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 30, y: 0 }, { op: 'L', x: 30, y: 30 }, { op: 'L', x: 0, y: 30 }, { op: 'Z' }],
    });
    await flattenSelection(editor, async () => null);
    const flattened = editor.doc.getOrThrow(editor.selection[0]!) as SceneNode;
    expect(flattened.type).toBe('VECTOR');
    expect(flattened.size).toEqual({ width: 30, height: 30 });
    expect(editor.doc.has(group)).toBe(false);
  });
});
