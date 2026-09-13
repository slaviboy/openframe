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
import { createEmptyDocument, keyOnTop, makeFrame, makeGroup, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Node, RectangleNode } from '@/core/schema/document';
import { evaluateMath, formatNumber } from '@/ui/primitives/math';
import { Editor } from '../editor';
import { moveLayers } from './layers';
import { MIXED, rotationDegrees, sceneNodes, setRotation, shared, updatePaint } from './properties';

let editor: Editor;

const add = <T extends Node>(build: (id: string, parent: { id: string; key: string }) => T, parent?: string): string =>
  editor.history.run('seed', (tx) => {
    const p = parent ?? editor.pageId;
    const id = editor.ids.next();
    tx.create(build(id, { id: p, key: keyOnTop(editor.doc, p) }));
    return id;
  });

beforeEach(() => {
  const ids = new IdGenerator('l');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

describe('moveLayers', () => {
  test('reorders within parent (above = higher z)', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 1, height: 1 }));
    const b = add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 0, y: 0, width: 1, height: 1 }));
    const c = add((id, parent) => makeRectangle({ id, parent, name: 'C', x: 0, y: 0, width: 1, height: 1 }));
    editor.history.run('move', (tx) => moveLayers(tx, editor.scene, [a], c, 'above'));
    expect([...editor.doc.children(editor.pageId)]).toEqual([b, c, a]);
    editor.history.run('move', (tx) => moveLayers(tx, editor.scene, [a, c], b, 'below'));
    expect([...editor.doc.children(editor.pageId)]).toEqual([c, a, b]);
  });

  test('reparenting preserves world position and rejects moving into own descendant', () => {
    const frame = add((id, parent) => makeFrame({ id, parent, name: 'F', x: 100, y: 50, width: 300, height: 300 }));
    const r = add((id, parent) => makeRectangle({ id, parent, name: 'R', x: 120, y: 60, width: 10, height: 10 }));
    editor.history.run('into', (tx) => moveLayers(tx, editor.scene, [r], frame, 'inside'));
    const moved = editor.doc.getOrThrow(r) as RectangleNode;
    expect(moved.parent.id).toBe(frame);
    expect(moved.transform.slice(4)).toEqual([20, 10]);
    const ok = editor.history.run('bad', (tx) => moveLayers(tx, editor.scene, [frame], r, 'above'));
    expect(ok).toBe(false);
  });

  test('cannot drop inside a rectangle', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 1, height: 1 }));
    const b = add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 0, y: 0, width: 1, height: 1 }));
    expect(editor.history.run('x', (tx) => moveLayers(tx, editor.scene, [a], b, 'inside'))).toBe(false);
  });

  test('moving the last child out of a group removes the emptied group (group finalizer)', () => {
    const frame = add((id, parent) => makeFrame({ id, parent, name: 'F', x: 0, y: 0, width: 10, height: 10 }));
    // A group and its first child must be created in one transaction (groups can never be empty).
    const [g, child] = editor.history.run('group', (tx) => {
      const groupId = editor.ids.next();
      const childId = editor.ids.next();
      tx.create(makeGroup({ id: groupId, parent: { id: frame, key: 'V' }, name: 'G', x: 0, y: 0, width: 10, height: 10 }));
      tx.create(makeRectangle({ id: childId, parent: { id: groupId, key: 'V' }, name: 'R', x: 0, y: 0, width: 1, height: 1 }));
      return [groupId, childId] as const;
    });
    editor.history.run('out', (tx) => moveLayers(tx, editor.scene, [child], frame, 'inside'));
    expect(editor.doc.parentOf(child)).toBe(frame);
    expect(editor.doc.has(g)).toBe(false);
    editor.history.undo();
    expect(editor.doc.parentOf(child)).toBe(g);
  });
});

describe('properties', () => {
  test('rotation round trip about center', () => {
    const r = add((id, parent) => makeRectangle({ id, parent, name: 'R', x: 0, y: 0, width: 100, height: 50 }));
    editor.history.run('rot', (tx) => setRotation(tx, editor.doc.getOrThrow(r) as RectangleNode, 45));
    const node = editor.doc.getOrThrow(r) as RectangleNode;
    expect(rotationDegrees(node)).toBeCloseTo(45);
    editor.scene.ensure(editor.pageId);
    const b = editor.scene.worldBounds(r)!;
    expect(b.x + b.width / 2).toBeCloseTo(50);
    expect(b.y + b.height / 2).toBeCloseTo(25);
    editor.history.run('rot', (tx) => setRotation(tx, node, 0));
    expect((editor.doc.getOrThrow(r) as RectangleNode).transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  test('shared values detect mixed', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 5, height: 5 }));
    const b = add((id, parent) => makeRectangle({ id, parent, name: 'B', x: 0, y: 0, width: 5, height: 9 }));
    const nodes = sceneNodes(editor.doc, [a, b]);
    expect(shared(nodes, (n) => n.size.width)).toBe(5);
    expect(shared(nodes, (n) => n.size.height)).toBe(MIXED);
  });

  test('updatePaint patches one paint', () => {
    const a = add((id, parent) => makeRectangle({ id, parent, name: 'A', x: 0, y: 0, width: 5, height: 5 }));
    editor.history.run('p', (tx) => updatePaint(tx, editor.doc.getOrThrow(a) as RectangleNode, 'fills', 0, { opacity: 0.5 }));
    expect((editor.doc.getOrThrow(a) as RectangleNode).fills[0]!.opacity).toBe(0.5);
  });
});

describe('math fields', () => {
  test('evaluates arithmetic safely', () => {
    expect(evaluateMath('120/2+8')).toBe(68);
    expect(evaluateMath('2^3*(1+1)')).toBe(16);
    expect(evaluateMath('-5')).toBe(-5);
    expect(evaluateMath('*2', 21)).toBe(42);
    expect(evaluateMath('+10', 5)).toBe(15);
    expect(evaluateMath('alert(1)')).toBeNull();
    expect(evaluateMath('1/0')).toBeNull();
    expect(evaluateMath('')).toBeNull();
  });

  test('formats numbers', () => {
    expect(formatNumber(1.2345)).toBe('1.23');
    expect(formatNumber(1.236)).toBe('1.24');
    expect(formatNumber(-0.001)).toBe('0');
    expect(formatNumber(12)).toBe('12');
  });
});
