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
import type { Node } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';

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
const bounds = (id: string) => {
  editor.scene.ensure(editor.pageId);
  return editor.scene.worldBounds(id)!;
};

beforeEach(() => {
  const ids = new IdGenerator('a');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
});

describe('align', () => {
  test('multiple layers align to their combined bounds in one undo step', () => {
    const a = rect(10, 0);
    const b = rect(50, 20);
    editor.state.select([a, b]);
    editor.commands.run('arrange.alignLeft');
    expect(bounds(a).x).toBe(10);
    expect(bounds(b).x).toBe(10);
    editor.commands.run('arrange.alignBottom');
    expect(bounds(a).y).toBe(20);
    editor.commands.run('edit.undo');
    editor.commands.run('edit.undo');
    expect(bounds(b).x).toBe(50);
  });

  test('horizontal centers use the selection center', () => {
    const a = rect(0, 0, 20, 20);
    const b = rect(100, 0, 40, 40);
    editor.state.select([a, b]);
    editor.commands.run('arrange.alignHorizontalCenters');
    expect(bounds(a).x).toBe(60);
    expect(bounds(b).x).toBe(50);
  });

  test('a single layer aligns to its parent frame; on the page nothing changes', () => {
    const frame = add((id, p) => makeFrame({ id, parent: p, name: 'F', x: 100, y: 100, width: 200, height: 200 }));
    const child = rect(10, 10, 20, 20, frame);
    editor.state.select([child]);
    editor.commands.run('arrange.alignRight');
    expect(bounds(child).x).toBe(280);
    editor.commands.run('arrange.alignVerticalCenters');
    expect(bounds(child).y).toBe(190);

    const loose = rect(5, 5);
    editor.state.select([loose]);
    const undoLabel = editor.history.undoLabel;
    editor.commands.run('arrange.alignLeft');
    expect(bounds(loose).x).toBe(5);
    expect(editor.history.undoLabel).toBe(undoLabel);
  });

  test('shift variant aligns each layer to its own parent; locked layers stay', () => {
    const frame = add((id, p) => makeFrame({ id, parent: p, name: 'F', x: 0, y: 0, width: 100, height: 100 }));
    const a = rect(30, 30, 10, 10, frame);
    const b = rect(60, 60, 10, 10, frame);
    const locked = rect(70, 10, 10, 10, frame);
    editor.history.run('lock', (tx) => tx.set(locked, 'locked', true));
    editor.state.select([a, b, locked]);
    editor.commands.run('arrange.alignTopToParent');
    expect(bounds(a).y).toBe(0);
    expect(bounds(b).y).toBe(0);
    expect(bounds(locked).y).toBe(10);
  });
});

describe('distribute', () => {
  test('equalizes gaps between the outermost layers', () => {
    const a = rect(0, 0);
    const b = rect(15, 30);
    const c = rect(100, 5);
    editor.state.select([c, a, b]);
    editor.commands.run('arrange.distributeHorizontal');
    expect(bounds(a).x).toBe(0);
    expect(bounds(b).x).toBe(50);
    expect(bounds(c).x).toBe(100);
  });

  test('vertical spacing with different heights; needs three layers', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(0, 12, 10, 30);
    const c = rect(0, 100, 10, 20);
    editor.state.select([a, b]);
    expect(editor.commands.isEnabled('arrange.distributeVertical')).toBe(false);
    editor.state.select([a, b, c]);
    editor.commands.run('arrange.distributeVertical');
    // Span 0..120, sizes 60 → gap 30: b.y = 10 + 30 = 40.
    expect(bounds(b).y).toBe(40);
  });
});
