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
import type { GroupNode, Node, RectangleNode, SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { setRotation } from './properties';

let editor: Editor;

const add = <T extends Node>(build: (id: string, parent: { id: string; key: string }) => T, parent?: string): string =>
  editor.history.run('seed', (tx) => {
    const p = parent ?? editor.pageId;
    const id = editor.ids.next();
    tx.create(build(id, { id: p, key: keyOnTop(editor.doc, p) }));
    return id;
  });
const rect = (x: number, y: number, w = 10, h = 10, parent?: string) =>
  add((id, p) => makeRectangle({ id, parent: p, name: 'R', x, y, width: w, height: h }), parent);
const node = <T extends SceneNode>(id: string) => editor.doc.getOrThrow(id) as T;
const worldBounds = (id: string) => {
  editor.scene.ensure(editor.pageId);
  return editor.scene.worldBounds(id)!;
};

beforeEach(() => {
  const ids = new IdGenerator('s');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
});

describe('group and ungroup', () => {
  test('group hugs children, keeps world positions and z-position; one undo step', () => {
    const below = rect(0, 0);
    const a = rect(100, 50, 20, 20);
    const b = rect(150, 90, 30, 10);
    const above = rect(0, 0);
    editor.state.select([a, b]);
    editor.commands.run('object.group');
    const [groupId] = editor.selection;
    const group = node<GroupNode>(groupId!);
    expect(group.type).toBe('GROUP');
    expect(group.name).toBe('Group 1');
    expect(group.transform.slice(4)).toEqual([100, 50]);
    expect(group.size).toEqual({ width: 80, height: 50 });
    expect(worldBounds(a)).toEqual({ x: 100, y: 50, width: 20, height: 20 });
    expect(worldBounds(b)).toEqual({ x: 150, y: 90, width: 30, height: 10 });
    expect([...editor.doc.children(editor.pageId)]).toEqual([below, groupId, above]);
    expect([...editor.doc.children(groupId!)]).toEqual([a, b]);

    editor.commands.run('edit.undo');
    expect(editor.doc.has(groupId!)).toBe(false);
    expect([...editor.doc.children(editor.pageId)]).toEqual([below, a, b, above]);
  });

  test('moving a child re-hugs the group; deleting the last child removes the group', () => {
    const a = rect(0, 0);
    const b = rect(50, 0);
    editor.state.select([a, b]);
    editor.commands.run('object.group');
    const groupId = editor.selection[0]!;
    editor.history.run('Move child', (tx) => tx.set(b, 'transform', [1, 0, 0, 1, 90, 40]));
    expect(node<GroupNode>(groupId).size).toEqual({ width: 100, height: 50 });
    expect(worldBounds(b).x).toBe(90);

    editor.state.select([a]);
    editor.commands.run('edit.delete');
    editor.state.select([b]);
    editor.commands.run('edit.delete');
    expect(editor.doc.has(groupId)).toBe(false);
    editor.commands.run('edit.undo');
    expect(editor.doc.children(groupId)).toEqual([b]);
  });

  test('hugging moves a rotated group origin in its own space', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(40, 0, 10, 10);
    editor.state.select([a, b]);
    editor.commands.run('object.group');
    const groupId = editor.selection[0]!;
    editor.history.run('Rotate group', (tx) => setRotation(tx, node(groupId), 90));
    const before = worldBounds(b);
    editor.history.run('Move child', (tx) => tx.set(a, 'transform', [1, 0, 0, 1, -20, 0]));
    expect(node<GroupNode>(groupId).size.width).toBeCloseTo(70);
    const after = worldBounds(b);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test('ungroup releases children in place at the group z-position', () => {
    const a = rect(10, 10);
    const b = rect(30, 10);
    const top = rect(0, 0);
    editor.state.select([a, b]);
    editor.commands.run('object.group');
    const groupId = editor.selection[0]!;
    editor.commands.run('object.ungroup');
    expect(editor.doc.has(groupId)).toBe(false);
    expect([...editor.doc.children(editor.pageId)]).toEqual([a, b, top]);
    expect(editor.selection).toEqual([a, b]);
    expect(worldBounds(a).x).toBe(10);
  });

  test('frame selection wraps layers in a frame sized to their bounds; ungroup removes the frame', () => {
    const a = rect(12, 8, 20, 20);
    const b = rect(60, 40, 10, 10);
    editor.state.select([a, b]);
    editor.commands.run('object.frameSelection');
    const frameId = editor.selection[0]!;
    const frame = node(frameId);
    expect(frame.type).toBe('FRAME');
    expect(frame.transform.slice(4)).toEqual([12, 8]);
    expect(frame.size).toEqual({ width: 58, height: 42 });
    expect(node<RectangleNode>(a).transform.slice(4)).toEqual([0, 0]);
    editor.commands.run('object.ungroup');
    expect(editor.doc.has(frameId)).toBe(false);
    expect(worldBounds(b)).toEqual({ x: 60, y: 40, width: 10, height: 10 });
  });

  test('grouping layers from different parents places the group in the top-most layer parent', () => {
    // Created before the frame, so `outside` paints below the frame and `inside` is top-most.
    const outside = rect(0, 0);
    const frame = add((id, p) => makeFrame({ id, parent: p, name: 'F', x: 200, y: 200, width: 100, height: 100 }));
    const inside = rect(10, 10, 10, 10, frame);
    editor.state.select([outside, inside]);
    editor.commands.run('object.group');
    const groupId = editor.selection[0]!;
    expect(editor.doc.parentOf(groupId)).toBe(frame);
    expect(worldBounds(outside)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(worldBounds(inside)).toEqual({ x: 210, y: 210, width: 10, height: 10 });
  });
});

describe('duplicate', () => {
  test('duplicates in place above the original and selects the copy', () => {
    const a = rect(5, 5);
    const b = rect(50, 5);
    editor.state.select([a]);
    editor.commands.run('edit.duplicate');
    const [copy] = editor.selection;
    expect([...editor.doc.children(editor.pageId)]).toEqual([a, copy, b]);
    expect(node(copy!).transform).toEqual(node(a).transform);
    editor.commands.run('edit.undo');
    expect(editor.doc.has(copy!)).toBe(false);
  });

  test('repeats the last offset when the copy was moved', () => {
    const a = rect(0, 0);
    editor.state.select([a]);
    editor.commands.run('edit.duplicate');
    const first = editor.selection[0]!;
    editor.history.run('Move', (tx) => tx.set(first, 'transform', [1, 0, 0, 1, 20, 5]));
    editor.commands.run('edit.duplicate');
    const second = editor.selection[0]!;
    expect(node(second).transform.slice(4)).toEqual([40, 10]);
    editor.commands.run('edit.duplicate');
    expect(node(editor.selection[0]!).transform.slice(4)).toEqual([60, 15]);
  });

  test('duplicates whole subtrees with fresh ids', () => {
    const frame = add((id, p) => makeFrame({ id, parent: p, name: 'F', x: 0, y: 0, width: 100, height: 100 }));
    rect(1, 1, 5, 5, frame);
    editor.state.select([frame]);
    editor.commands.run('edit.duplicate');
    const copy = editor.selection[0]!;
    expect(editor.doc.children(copy)).toHaveLength(1);
    expect(editor.doc.children(copy)[0]).not.toBe(editor.doc.children(frame)[0]);
  });
});

describe('flip', () => {
  test('flip horizontal twice restores the transform; multi-selection mirrors around the shared center', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(90, 0, 10, 10);
    editor.state.select([a]);
    editor.commands.run('object.flipHorizontal');
    expect(node(a).transform[0]).toBe(-1);
    expect(worldBounds(a)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    editor.commands.run('object.flipHorizontal');
    expect(node(a).transform).toEqual([1, 0, 0, 1, 0, 0]);

    editor.state.select([a, b]);
    editor.commands.run('object.flipVertical');
    expect(worldBounds(a).y).toBe(0);
    editor.state.select([a, b]);
    editor.commands.run('object.flipHorizontal');
    expect(worldBounds(a).x).toBe(90);
    expect(worldBounds(b).x).toBe(0);
  });
});
