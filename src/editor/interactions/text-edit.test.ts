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
import type { SceneNode, TextNode } from '@/core/schema/document';
import type { TextLayoutService } from '@/core/text/text-layout';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { applyLink, editedLink, openLinkEditor, beginTextEdit, deleteText, endTextEdit, indentListItem, insertText, moveTextCaret, selectedText, setTextSelection, textEditTarget, undoTextEdit } from './text-edit';
import { caret } from '@/core/text/text-editing';
import { paragraphListTypes, textStyleValue } from '../commands/text';

/** Monospace fake: 10 wide per character, 20 per line; no wrapping. */
const layout: TextLayoutService = {
  measure: (node) => {
    const lines = node.characters.split('\n');
    return { width: Math.max(...lines.map((l) => l.length)) * 10, height: lines.length * 20 };
  },
  offsetAt: (node, p) => {
    const lines = node.characters.split('\n');
    const row = Math.min(lines.length - 1, Math.max(0, Math.floor(p.y / 20)));
    const before = lines.slice(0, row).reduce((sum, l) => sum + l.length + 1, 0);
    return before + Math.min(lines[row]!.length, Math.max(0, Math.round(p.x / 10)));
  },
  caretAt: () => ({ x: 0, top: 0, bottom: 20 }),
  selectionRects: () => [],
  offsetOnAdjacentLine: (node, _offset, direction) => (direction < 0 ? 0 : node.characters.length),
  lineRange: (node) => [0, node.characters.length],
  availableFonts: () => [{ family: 'Inter', styles: ['Regular', 'Bold'] }],
};

let editor: Editor;
let tools: ToolManager;
const pointer = (x: number, y: number, clickCount = 1): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift: false,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount,
});
const click = (x: number, y: number, clickCount = 1) => {
  tools.pointerDown(pointer(x, y, clickCount));
  tools.pointerUp(pointer(x, y, clickCount));
};
const texts = () => [...editor.doc.nodes()].filter((n): n is TextNode => n.type === 'TEXT');

beforeEach(() => {
  const ids = new IdGenerator('x');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  editor.setTextLayout(layout);
  tools = new ToolManager(editor);
});

describe('lists while editing', () => {
  test('"- " starts a list; Return continues it and ends it on an empty item; Backspace removes a marker; Tab indents', () => {
    editor.state.setTool('text');
    click(100, 100);
    insertText(editor, '-');
    insertText(editor, ' ');
    expect(texts()[0]).toMatchObject({ characters: '', listType: 'UNORDERED' });
    insertText(editor, 'Apples');
    insertText(editor, '\n');
    insertText(editor, 'Pears');
    expect(paragraphListTypes(texts()[0]!, null)).toEqual(['UNORDERED', 'UNORDERED']);
    expect(indentListItem(editor, 1)).toBe(true);
    expect(textStyleValue(texts()[0]!, 'indentation', { start: 7, end: 12 })).toBe(2);
    // An empty item moves out a level, then ends the list.
    insertText(editor, '\n');
    insertText(editor, '\n');
    insertText(editor, '\n');
    expect(texts()[0]!.characters).toBe('Apples\nPears\n');
    expect(paragraphListTypes(texts()[0]!, null)).toEqual(['UNORDERED', 'UNORDERED', 'NONE']);
    // Backspace at the start of an item removes its marker, and undo brings it back.
    setTextSelection(editor, caret(7));
    deleteText(editor, 'backward');
    expect(texts()[0]!.characters).toBe('Apples\nPears\n');
    expect(paragraphListTypes(texts()[0]!, null)).toEqual(['UNORDERED', 'NONE', 'NONE']);
    expect(undoTextEdit(editor)).toBe(true);
    expect(paragraphListTypes(texts()[0]!, null)).toEqual(['UNORDERED', 'UNORDERED', 'NONE']);
    // Outside a list, Tab isn't an indent.
    setTextSelection(editor, caret(13));
    expect(indentListItem(editor, 1)).toBe(false);
  });
});

describe('multi-edit text', () => {
  test('Return with several text layers selected edits them together; undo restores each; empty layers go at the end', () => {
    editor.state.setTool('text');
    click(100, 100);
    insertText(editor, 'first');
    endTextEdit(editor);
    editor.state.setTool('text');
    click(100, 300);
    insertText(editor, 'second one');
    endTextEdit(editor);
    const [a, b] = texts();
    editor.state.select([a!.id, b!.id]);
    expect(editor.commands.run('text.edit')).toBe(true);
    // Both stay selected; typing over the selected text replaces it in every layer.
    expect(editor.selection).toEqual([a!.id, b!.id]);
    insertText(editor, 'Shared');
    expect(texts().map((t) => t.characters)).toEqual(['Shared', 'Shared']);
    insertText(editor, '!');
    expect(texts().map((t) => t.characters)).toEqual(['Shared!', 'Shared!']);
    expect(undoTextEdit(editor)).toBe(true);
    expect(undoTextEdit(editor)).toBe(true);
    expect(texts().map((t) => t.characters)).toEqual(['first', 'second one']);
    // The whole session is one undo step after it ends.
    insertText(editor, 'Done');
    endTextEdit(editor);
    expect(texts().map((t) => t.characters)).toEqual(['Done', 'Done']);
    editor.history.undo();
    expect(texts().map((t) => t.characters)).toEqual(['first', 'second one']);
    // Emptied layers are removed when editing ends.
    editor.state.select(texts().map((t) => t.id));
    editor.commands.run('text.edit');
    deleteText(editor, 'backward');
    endTextEdit(editor);
    expect(texts()).toHaveLength(0);
  });
});

describe('smart quotes and symbols', () => {
  test('typing converts sequences and quotes only with the preference on', () => {
    editor.state.setTool('text');
    click(100, 100);
    for (const c of 'a->b') insertText(editor, c);
    expect(texts()[0]!.characters).toBe('a->b');
    insertText(editor, ' ');
    for (const c of '"x" (c)') insertText(editor, c, { smartSymbols: true });
    expect(texts()[0]!.characters).toBe('a->b “x” ©');
    for (const c of ' ->') insertText(editor, c, { smartSymbols: true });
    expect(texts()[0]!.characters).toBe('a->b “x” © →');
  });
});

describe('right-to-left editing', () => {
  test('left and right arrows follow reading order in right-to-left paragraphs', () => {
    editor.state.setTool('text');
    click(100, 100);
    insertText(editor, 'ab\nשלום');
    // In the Hebrew paragraph, ← moves forward.
    setTextSelection(editor, caret(4));
    moveTextCaret(editor, 'left', { extend: false, word: false });
    expect(textEditTarget(editor)!.selection).toEqual({ anchor: 5, focus: 5 });
    moveTextCaret(editor, 'right', { extend: false, word: false });
    expect(textEditTarget(editor)!.selection).toEqual({ anchor: 4, focus: 4 });
    // In the English paragraph, ← moves backward.
    setTextSelection(editor, caret(1));
    moveTextCaret(editor, 'left', { extend: false, word: false });
    expect(textEditTarget(editor)!.selection).toEqual({ anchor: 0, focus: 0 });
  });
});

describe('links while editing', () => {
  test('the link editor opens for selected characters or a link under the caret; links apply and remove as a whole', () => {
    editor.state.setTool('text');
    click(100, 100);
    insertText(editor, 'go to site');
    expect(openLinkEditor(editor)).toBe(false);
    setTextSelection(editor, { anchor: 6, focus: 10 });
    expect(openLinkEditor(editor)).toBe(true);
    expect(editor.state.getSnapshot().linkEditing).toBe(true);
    expect(applyLink(editor, 'https://example.com/')).toBe(true);
    setTextSelection(editor, caret(8));
    expect(editedLink(editor)).toEqual({ start: 6, end: 10, url: 'https://example.com/' });
    // Moving to another layer or ending the edit closes the link editor.
    endTextEdit(editor);
    expect(editor.state.getSnapshot().linkEditing).toBe(false);
    beginTextEdit(editor, texts()[0]!.id);
    setTextSelection(editor, caret(7));
    expect(applyLink(editor, null)).toBe(true);
    expect(editedLink(editor)).toBeNull();
    expect(texts()[0]!.styleRuns).toBeUndefined();
    setTextSelection(editor, caret(2));
    expect(applyLink(editor, null)).toBe(false);
  });
});

describe('text editing', () => {
  test('the Text tool creates a layer, typing edits it, and the whole session undoes in one step', () => {
    editor.state.setTool('text');
    click(100, 100);
    expect(editor.state.getSnapshot().tool).toBe('move');
    const [created] = texts();
    expect(created).toMatchObject({ textAutoResize: 'WIDTH_AND_HEIGHT', characters: '' });
    // The first line is centered on the click.
    expect(created!.transform.slice(4)).toEqual([100, 90]);
    insertText(editor, 'Hello');
    insertText(editor, ' world');
    expect(texts()[0]).toMatchObject({ characters: 'Hello world', name: 'Hello world', size: { width: 110, height: 20 } });
    deleteText(editor, 'backward', 'word');
    expect(texts()[0]!.characters).toBe('Hello ');
    expect(undoTextEdit(editor)).toBe(true);
    expect(texts()[0]!.characters).toBe('Hello world');
    endTextEdit(editor);
    expect(editor.selection).toEqual([created!.id]);
    editor.history.undo();
    expect(texts()).toHaveLength(0);
    editor.history.redo();
    expect(texts()[0]!.characters).toBe('Hello world');
  });

  test('a new layer left empty disappears without an undo step; dragging makes a fixed box', () => {
    const rect = editor.history.run('seed', (tx) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 500, y: 500, width: 10, height: 10 }));
      return id;
    });
    editor.state.setTool('text');
    click(100, 100);
    expect(texts()).toHaveLength(1);
    expect(tools.cancel()).toBe(true);
    expect(texts()).toHaveLength(0);
    expect(editor.history.undoLabel).toBe('seed');
    expect(editor.doc.has(rect)).toBe(true);

    editor.state.setTool('text');
    tools.pointerDown(pointer(50, 60));
    tools.pointerMove(pointer(150, 100));
    tools.pointerUp(pointer(250, 160));
    const [box] = texts();
    expect(box).toMatchObject({ textAutoResize: 'NONE', size: { width: 200, height: 100 }, transform: [1, 0, 0, 1, 50, 60] });
    insertText(editor, 'abc');
    expect(texts()[0]!.size).toEqual({ width: 200, height: 100 });
  });

  test('Return edits with all text selected; clicks place the caret; clicking elsewhere ends editing', () => {
    editor.state.setTool('text');
    click(100, 100);
    insertText(editor, 'one two');
    endTextEdit(editor);
    const id = texts()[0]!.id;
    expect(editor.commands.run('text.edit')).toBe(true);
    expect(selectedText(editor)).toBe('one two');
    moveTextCaret(editor, 'right', { extend: false, word: false });
    expect(textEditTarget(editor)!.selection).toEqual({ anchor: 7, focus: 7 });
    // Double-click selects the word under the pointer (layer at 100, 90; "two" starts at x = 140).
    click(145, 95, 2);
    expect(selectedText(editor)).toBe('two');
    click(115, 95);
    expect(textEditTarget(editor)!.selection).toEqual({ anchor: 2, focus: 2 });
    click(700, 700);
    expect(editor.state.getSnapshot().textEdit).toBeNull();
    expect(editor.selection).toEqual([]);
    expect((editor.doc.getOrThrow(id) as SceneNode).name).toBe('one two');
    // Double-clicking the layer with the Move tool edits it again with the caret at the click.
    click(125, 95);
    click(125, 95, 2);
    expect(textEditTarget(editor)!.selection).toEqual({ anchor: 3, focus: 3 });
    expect(beginTextEdit(editor, 'x:999')).toBe(false);
  });
});
