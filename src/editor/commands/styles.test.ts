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
import { createEmptyDocument, keyOnTop, makeRectangle, makeText } from '@/core/document/factory';
import { localStyles } from '@/core/document/styles';
import { IdGenerator, ROOT_ID } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { insertInstance } from './insert-instance';
import {
  applyStyle,
  createStyle,
  createStyleFromSelection,
  deleteStyles,
  detachStyle,
  duplicateStyles,
  moveStyles,
  moveStylesToFolder,
  renameStyle,
  renameStyleFolder,
  setStyleDescription,
  setStyleValues,
  styleFolder,
  styleLeafName,
  ungroupStyleFolder,
} from './styles';

const red = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const blue = { type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const green = { type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;

let editor: Editor;
let a: string;
let b: string;
let title: string;
let body: string;

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode & Record<string, unknown>;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  [a, b, title, body] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const rect = (name: string, x: number) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: page, key: keyOnTop(tx.store, page) }, name, x, y: 0, width: 40, height: 40 }));
      return id;
    };
    const text = (name: string, y: number) => {
      const id = editor.ids.next();
      tx.create(makeText({ id, parent: { id: page, key: keyOnTop(tx.store, page) }, name, x: 0, y, width: 200, height: 40 }));
      tx.set(id, 'characters', name);
      return id;
    };
    const first = rect('A', 0);
    tx.set(first, 'fills', [red]);
    return [first, rect('B', 100), text('Title', 100), text('Body', 200)];
  });
});

describe('styles', () => {
  test('styles are children of the document, not pages', () => {
    const style = createStyle(editor, 'FILL', 'Red', { paints: [red] })!;
    expect(editor.doc.parentOf(style)).toBe(ROOT_ID);
    expect(editor.doc.pages()).toEqual([editor.pageId]);
    expect(localStyles(editor.doc).map((s) => s.id)).toEqual([style]);
    expect(localStyles(editor.doc, 'TEXT')).toEqual([]);
    expect(createStyle(editor, 'FILL', '  ', { paints: [red] })).toBeNull();
    expect(createStyle(editor, 'TEXT', 'Heading', {})).toBeNull();
  });

  test('a color style made from a layer is applied to it and other layers, and editing the style updates them', () => {
    editor.state.select([a]);
    const style = createStyleFromSelection(editor, 'fill', 'Brand/Red', 'Primary actions')!;
    expect(node(style)).toMatchObject({ type: 'STYLE', styleType: 'FILL', name: 'Brand/Red', description: 'Primary actions', paints: [red] });
    expect(node(a).fillStyleId).toBe(style);

    expect(applyStyle(editor, [b], 'fill', style)).toBe(true);
    expect(node(b)).toMatchObject({ fillStyleId: style, fills: [red] });
    expect(applyStyle(editor, [b], 'stroke', style)).toBe(true);
    expect(node(b)).toMatchObject({ strokeStyleId: style, strokes: [red] });

    expect(setStyleValues(editor, style, { paints: [blue] })).toBe(true);
    expect(node(a).fills).toEqual([blue]);
    expect(node(b)).toMatchObject({ fills: [blue], strokes: [blue] });
    editor.history.undo();
    expect(node(a).fills).toEqual([red]);
  });

  test('changing a styled property directly detaches the style; detach and delete keep the values', () => {
    editor.state.select([a, b]);
    const style = createStyleFromSelection(editor, 'fill', 'Red')!;
    editor.history.run('Fill', (tx) => tx.set(b, 'fills', [green]));
    expect(node(b).fillStyleId).toBeUndefined();
    expect(node(b).fills).toEqual([green]);
    expect(node(a).fillStyleId).toBe(style);

    expect(detachStyle(editor, [a], 'fill')).toBe(true);
    expect(node(a)).toMatchObject({ fills: [red] });
    expect(node(a).fillStyleId).toBeUndefined();

    applyStyle(editor, [a], 'fill', style);
    expect(deleteStyles(editor, [style])).toBe(true);
    expect(editor.doc.get(style)).toBeUndefined();
    expect(node(a).fillStyleId).toBeUndefined();
    expect(node(a).fills).toEqual([red]);
  });

  test('a text style carries typography to text layers', () => {
    editor.history.run('Typography', (tx) => {
      tx.set(title, 'fontSize', 32);
      tx.set(title, 'letterSpacing', { unit: 'PERCENT', value: 2 });
    });
    editor.state.select([title]);
    const heading = createStyleFromSelection(editor, 'text', 'Heading')!;
    expect(node(heading)).toMatchObject({ styleType: 'TEXT', fontSize: 32, letterSpacing: { unit: 'PERCENT', value: 2 } });
    // Rectangles can't take a text style, and a color style doesn't apply as text.
    expect(applyStyle(editor, [a], 'text', heading)).toBe(false);
    expect(applyStyle(editor, [body], 'text', heading)).toBe(true);
    expect(node(body)).toMatchObject({ textStyleId: heading, fontSize: 32 });
    setStyleValues(editor, heading, { fontSize: 40 });
    expect(node(title).fontSize).toBe(40);
    expect(node(body).fontSize).toBe(40);
  });

  test('renaming and describing a style', () => {
    const style = createStyle(editor, 'FILL', 'Red', { paints: [red] })!;
    expect(renameStyle(editor, style, ' Brand / Red ')).toBe(true);
    expect(renameStyle(editor, style, '')).toBe(false);
    expect(setStyleDescription(editor, style, 'Errors')).toBe(true);
    expect(node(style)).toMatchObject({ name: 'Brand / Red', description: 'Errors' });
    expect(setStyleDescription(editor, style, '')).toBe(true);
    expect(node(style).description).toBeUndefined();
  });

  test('duplicating places the copy directly after the original, and styles are reordered', () => {
    const red1 = createStyle(editor, 'FILL', 'Red', { paints: [red] })!;
    const blue1 = createStyle(editor, 'FILL', 'Blue', { paints: [blue] })!;
    const green1 = createStyle(editor, 'FILL', 'Green', { paints: [green] })!;
    const [copy] = duplicateStyles(editor, [red1]) as [string];
    expect(localStyles(editor.doc).map((s) => s.id)).toEqual([red1, copy, blue1, green1]);
    expect(node(copy)).toMatchObject({ name: 'Red', styleType: 'FILL', paints: [red] });

    expect(moveStyles(editor, [green1], red1, 'before')).toBe(true);
    expect(localStyles(editor.doc).map((s) => s.id)).toEqual([green1, red1, copy, blue1]);
    expect(moveStyles(editor, [green1, red1], blue1, 'after')).toBe(true);
    expect(localStyles(editor.doc).map((s) => s.id)).toEqual([copy, blue1, green1, red1]);
    expect(editor.doc.pages()).toEqual([editor.pageId]);
  });

  test('folders are paths in style names: move to a folder, rename it, ungroup it', () => {
    const red1 = createStyle(editor, 'FILL', 'Red', { paints: [red] })!;
    const blue1 = createStyle(editor, 'FILL', 'Blue', { paints: [blue] })!;
    const nested = createStyle(editor, 'FILL', 'Brand/Dark/Navy', { paints: [blue] })!;
    const heading = createStyle(editor, 'TEXT', 'Brand/Heading', { fontName: { family: 'Inter', style: 'Regular' }, fontSize: 24, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 } })!;
    expect(styleFolder('Brand / Dark/Navy')).toBe('Brand/Dark');
    expect(styleLeafName('Brand/Dark/ Navy')).toBe('Navy');

    expect(moveStylesToFolder(editor, [red1, blue1], ' Brand / ')).toBe(true);
    expect([node(red1).name, node(blue1).name]).toEqual(['Brand/Red', 'Brand/Blue']);

    expect(renameStyleFolder(editor, 'FILL', 'Brand', 'Colors')).toBe(true);
    expect([node(red1).name, node(nested).name, node(heading).name]).toEqual(['Colors/Red', 'Colors/Dark/Navy', 'Brand/Heading']);
    expect(renameStyleFolder(editor, 'FILL', 'Colors/Dark', 'Night')).toBe(true);
    expect(node(nested).name).toBe('Colors/Night/Navy');

    expect(ungroupStyleFolder(editor, 'FILL', 'Colors')).toBe(true);
    expect([node(red1).name, node(blue1).name, node(nested).name]).toEqual(['Red', 'Blue', 'Night/Navy']);
    expect(moveStylesToFolder(editor, [nested], '')).toBe(true);
    expect(node(nested).name).toBe('Navy');
  });

  test('instances follow a style through their main component, and can apply their own', () => {
    editor.state.select([a]);
    const style = createStyleFromSelection(editor, 'fill', 'Red')!;
    editor.commands.run('object.createComponent');
    const main = editor.selection[0]!;
    const instance = insertInstance(editor, main)!;
    const [copy] = editor.doc.children(instance) as [string];
    expect(node(copy)).toMatchObject({ fillStyleId: style, fills: [red] });

    setStyleValues(editor, style, { paints: [blue] });
    expect(node(copy).fills).toEqual([blue]);
    expect(node(copy).fillStyleId).toBe(style);
    expect(node(copy).overrides).toBeUndefined();

    const other = createStyle(editor, 'FILL', 'Green', { paints: [green] })!;
    expect(applyStyle(editor, [copy], 'fill', other)).toBe(true);
    expect(node(copy)).toMatchObject({ fillStyleId: other, fills: [green] });
    setStyleValues(editor, style, { paints: [red] });
    expect(node(copy).fills).toEqual([green]);
  });
});
