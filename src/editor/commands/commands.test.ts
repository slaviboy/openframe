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
import { formatShortcut, Keymap, matches, parseChord, type KeyEventLike } from '../keymap/keymap';
import { BUILTIN_COMMANDS } from './builtin';

let editor: Editor;

const add = (build: (id: string, parent: string) => Node, parent?: string) => {
  const p = parent ?? editor.pageId;
  return editor.history.run('add', (tx) => {
    const id = editor.ids.next();
    tx.create(build(id, p));
    return id;
  });
};
const rect = (parent?: string) =>
  add((id, p) => makeRectangle({ id, parent: { id: p, key: keyOnTop(editor.doc, p) }, name: id, x: 0, y: 0, width: 10, height: 10 }), parent);

beforeEach(() => {
  const ids = new IdGenerator('c');
  const doc = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  editor = new Editor({ doc, ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
});

describe('builtin commands', () => {
  test('delete + undo restores selection', () => {
    const a = rect();
    editor.state.select([a]);
    editor.commands.run('edit.delete');
    expect(editor.doc.has(a)).toBe(false);
    expect(editor.selection).toEqual([]);
    editor.commands.run('edit.undo');
    expect(editor.doc.has(a)).toBe(true);
    expect(editor.selection).toEqual([a]);
  });

  test('registration returns a disposer; duplicates are rejected atomically', () => {
    let runs = 0;
    const dispose = editor.commands.register({ id: 'test.one', label: 'One', category: 'View', run: () => runs++ });
    expect(() =>
      editor.commands.register(
        { id: 'test.two', label: 'Two', category: 'View', run: () => undefined },
        { id: 'test.one', label: 'Again', category: 'View', run: () => undefined },
      ),
    ).toThrow(/Duplicate/);
    expect(editor.commands.get('test.two')).toBeUndefined();
    editor.commands.run('test.one');
    dispose();
    expect(editor.commands.get('test.one')).toBeUndefined();
    expect(runs).toBe(1);
    expect(() => editor.commands.register({ id: 'test.one', label: 'One', category: 'View', run: () => undefined })).not.toThrow();
  });

  test('disabled commands do not run', () => {
    expect(editor.commands.isEnabled('edit.delete')).toBe(false);
    expect(editor.commands.run('edit.delete')).toBe(false);
  });

  test('select all within the selection parent', () => {
    const frame = add((id, p) => makeFrame({ id, parent: { id: p, key: keyOnTop(editor.doc, p) }, name: 'F', x: 0, y: 0, width: 50, height: 50 }));
    const a = rect(frame);
    const b = rect(frame);
    rect();
    editor.state.select([a]);
    editor.commands.run('edit.selectAll');
    expect(editor.selection).toEqual([a, b]);
  });

  test('visibility toggle is one undo step', () => {
    const a = rect();
    const b = rect();
    editor.state.select([a, b]);
    editor.commands.run('object.toggleVisible');
    expect([a, b].map((id) => (editor.doc.get(id) as { visible: boolean }).visible)).toEqual([false, false]);
    editor.commands.run('edit.undo');
    expect([a, b].map((id) => (editor.doc.get(id) as { visible: boolean }).visible)).toEqual([true, true]);
  });

  test('ordering: forward, backward, front, back with multi-selection', () => {
    const [a, b, c, d] = [rect(), rect(), rect(), rect()];
    const order = () => [...editor.doc.children(editor.pageId)];
    editor.state.select([a]);
    editor.commands.run('arrange.bringForward');
    expect(order()).toEqual([b, a, c, d]);
    editor.state.select([a, b]);
    editor.commands.run('arrange.bringToFront');
    expect(order()).toEqual([c, d, b, a]);
    editor.state.select([d]);
    editor.commands.run('arrange.sendToBack');
    expect(order()).toEqual([d, c, b, a]);
    editor.state.select([a]);
    editor.commands.run('arrange.sendBackward');
    expect(order()).toEqual([d, c, a, b]);
  });

  test('pages: add, duplicate with content, delete, undo', () => {
    const first = editor.pageId;
    rect();
    editor.commands.run('page.duplicate');
    const copy = editor.pageId;
    expect(copy).not.toBe(first);
    expect(editor.doc.children(copy)).toHaveLength(1);
    editor.commands.run('page.delete');
    expect(editor.doc.has(copy)).toBe(false);
    editor.commands.run('edit.undo');
    expect(editor.doc.children(copy)).toHaveLength(1);
    editor.commands.run('page.add');
    expect(editor.doc.pages()).toHaveLength(3);
  });

  test('hierarchy navigation: children, parent, and siblings in layers-panel order with wrap-around', () => {
    const frame = add((id, p) => makeFrame({ id, parent: { id: p, key: keyOnTop(editor.doc, p) }, name: 'F', x: 0, y: 0, width: 100, height: 100 }));
    const bottom = rect(frame);
    const top = rect(frame);
    editor.state.select([frame]);
    editor.commands.run('edit.selectChildren');
    expect(editor.selection).toEqual([bottom, top]);

    editor.state.select([top]);
    editor.commands.run('edit.selectNextSibling');
    expect(editor.selection).toEqual([bottom]);
    editor.commands.run('edit.selectNextSibling');
    expect(editor.selection).toEqual([top]);
    editor.commands.run('edit.selectPreviousSibling');
    expect(editor.selection).toEqual([bottom]);

    editor.commands.run('edit.selectParent');
    expect(editor.selection).toEqual([frame]);
    expect(editor.commands.isEnabled('edit.selectParent')).toBe(false);
    editor.state.clearSelection();
    expect(editor.commands.isEnabled('edit.selectNextSibling')).toBe(false);
  });

  test('arrow nudges move selection (shift = big) as separate undo steps; pan when empty', () => {
    const a = rect();
    editor.state.select([a]);
    editor.commands.run('object.nudgeRight');
    editor.commands.run('object.nudgeDownBig');
    expect((editor.doc.get(a) as { transform: number[] }).transform.slice(4)).toEqual([1, 10]);
    editor.commands.run('edit.undo');
    expect((editor.doc.get(a) as { transform: number[] }).transform.slice(4)).toEqual([1, 0]);
    editor.state.clearSelection();
    const before = editor.state.viewport.x;
    editor.commands.run('object.nudgeRight');
    expect(editor.state.viewport.x).toBeGreaterThan(before);
  });

  test('zoom commands', () => {
    editor.canvasSize = { width: 1000, height: 800 };
    editor.commands.run('view.zoomIn');
    expect(editor.state.viewport.zoom).toBe(2);
    const a = rect();
    editor.state.select([a]);
    editor.commands.run('view.zoomToSelection');
    expect(editor.state.viewport.zoom).toBeGreaterThan(10);
  });
});

describe('keymap', () => {
  const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  });

  test('Mod maps to meta on mac and ctrl elsewhere', () => {
    const chord = parseChord('Mod+Shift+H');
    expect(matches(chord, ev({ code: 'KeyH', key: 'H', metaKey: true, shiftKey: true }), true)).toBe(true);
    expect(matches(chord, ev({ code: 'KeyH', key: 'H', ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(matches(chord, ev({ code: 'KeyH', key: 'H', ctrlKey: true, shiftKey: true }), true)).toBe(false);
  });

  test('Alt combos match by physical code even when key is a symbol', () => {
    expect(matches(parseChord('Alt+A'), ev({ code: 'KeyA', key: 'å', altKey: true }), true)).toBe(true);
  });

  test('keymap resolves defaults and overrides and reports conflicts', () => {
    const km = new Keymap(true);
    km.setBindings(new Map([['a', ['Mod+K']], ['b', ['Shift+1']]]), new Map([['b', ['Mod+K']]]));
    expect(km.resolve(ev({ code: 'KeyK', metaKey: true }))).toBe('a');
    expect([...km.conflicts().values()][0]).toEqual(['a', 'b']);
  });

  test('formats labels', () => {
    expect(formatShortcut('Mod+Shift+H', true)).toBe('⇧⌘H');
    expect(formatShortcut('Mod+Alt+]', false)).toBe('Ctrl+Alt+]');
  });

  test('all builtin shortcuts parse', () => {
    for (const c of BUILTIN_COMMANDS) for (const s of c.shortcuts ?? []) expect(() => parseChord(s)).not.toThrow();
  });
});
