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
import { IdGenerator } from '@/core/ids/ids';
import type { TextNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { applyScale, captureScale } from '../interactions/scale';
import { setSize } from './properties';
import {
  resizedTextMode,
  setFontFamily,
  setFontSize,
  setFontStyle,
  setLetterSpacing,
  setLineHeight,
  setTextAlignHorizontal,
  setTextAutoResize,
  setMaxLines,
  setParagraphIndent,
  setParagraphSpacing,
  setTextCase,
  setTextFills,
  stepTextProperty,
  textStyleValue,
  toggleFontStyle,
  toggleTextDecoration,
} from './text';

let editor: Editor;
let id: string;
const get = () => editor.doc.getOrThrow(id) as TextNode;
const fonts = [
  { family: 'Inter', styles: ['Regular', 'Bold', 'Italic'] },
  { family: 'Serif', styles: ['Book', 'Bold'] },
];

beforeEach(() => {
  const ids = new IdGenerator('y');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  id = editor.history.run('seed', (tx) => {
    const next = editor.ids.next();
    tx.create({ ...makeText({ id: next, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'T', x: 0, y: 0, width: 50, height: 15 }), characters: 'Hi' });
    return next;
  });
});

describe('text properties', () => {
  test('font family keeps the style when available; style, size and spacing set directly', () => {
    editor.history.run('style', (tx) => setFontStyle(tx, get(), 'Bold'));
    editor.history.run('family', (tx) => setFontFamily(tx, get(), 'Serif', fonts));
    expect(get().fontName).toEqual({ family: 'Serif', style: 'Bold' });
    editor.history.run('style', (tx) => setFontStyle(tx, get(), 'Book'));
    editor.history.run('family', (tx) => setFontFamily(tx, get(), 'Inter', fonts));
    expect(get().fontName).toEqual({ family: 'Inter', style: 'Regular' });
    editor.history.run('size', (tx) => setFontSize(tx, get(), 0));
    expect(get().fontSize).toBe(1);
    editor.history.run('size', (tx) => setFontSize(tx, get(), 24.567));
    expect(get().fontSize).toBe(24.57);
    editor.history.run('spacing', (tx) => {
      setLineHeight(tx, get(), { unit: 'PERCENT', value: 150 });
      setLetterSpacing(tx, get(), { unit: 'PIXELS', value: -1 });
      setTextAlignHorizontal(tx, get(), 'CENTER');
      setTextAutoResize(tx, get(), 'NONE');
    });
    expect(get()).toMatchObject({ lineHeight: { unit: 'PERCENT', value: 150 }, letterSpacing: { unit: 'PIXELS', value: -1 }, textAlignHorizontal: 'CENTER', textAutoResize: 'NONE' });
    // Non-text layers are ignored.
    const rect = editor.history.run('rect', (tx) => {
      const next = editor.ids.next();
      tx.create(makeRectangle({ id: next, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, width: 5, height: 5 }));
      return next;
    });
    editor.history.run('size', (tx) => setFontSize(tx, editor.doc.getOrThrow(rect) as never, 30));
    expect('fontSize' in editor.doc.getOrThrow(rect)).toBe(false);
  });

  test('typing a width wraps auto-width text; typing a height fixes the box', () => {
    expect(resizedTextMode('WIDTH_AND_HEIGHT', { width: true, height: false })).toBe('HEIGHT');
    expect(resizedTextMode('HEIGHT', { width: true, height: false })).toBe('HEIGHT');
    expect(resizedTextMode('HEIGHT', { width: false, height: true })).toBe('NONE');
    expect(resizedTextMode('TRUNCATE', { width: true, height: true })).toBe('TRUNCATE');
    editor.history.run('w', (tx) => setSize(tx, get(), 'width', 30));
    expect(get()).toMatchObject({ textAutoResize: 'HEIGHT', size: { width: 30 } });
    editor.history.run('h', (tx) => setSize(tx, get(), 'height', 90));
    expect(get()).toMatchObject({ textAutoResize: 'NONE', size: { width: 30, height: 90 } });
  });

  test('with a range, style properties change those characters; without one, the whole layer', () => {
    const boldName = { family: 'Inter', style: 'Bold' };
    editor.history.run('type', (tx) => tx.set(id, 'characters', 'Hello world'));
    editor.history.run('bold', (tx) => toggleFontStyle(tx, get(), 'bold', fonts, { start: 6, end: 11 }));
    expect(get().styleRuns).toEqual([{ start: 6, end: 11, style: { fontName: boldName } }]);
    expect(textStyleValue(get(), 'fontName')).toBeUndefined();
    expect(textStyleValue(get(), 'fontName', { start: 6, end: 11 })).toEqual(boldName);
    editor.history.run('size', (tx) => setFontSize(tx, get(), 30, { start: 0, end: 5 }));
    expect(textStyleValue(get(), 'fontSize', { start: 0, end: 5 })).toBe(30);
    expect(textStyleValue(get(), 'fontSize', { start: 5, end: 11 })).toBe(12);
    // A whole-layer size replaces the range sizes and keeps the bold word.
    editor.history.run('size', (tx) => setFontSize(tx, get(), 16));
    expect(get()).toMatchObject({ fontSize: 16, styleRuns: [{ start: 6, end: 11, style: { fontName: boldName } }] });
    // A range covering all the text is a whole-layer change.
    editor.history.run('italic', (tx) => toggleFontStyle(tx, get(), 'italic', fonts, { start: 0, end: 11 }));
    expect(get().fontName).toEqual({ family: 'Inter', style: 'Italic' });
    expect(get().styleRuns).toBeUndefined();
    // Range fills.
    const red = [{ type: 'SOLID' as const, color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' as const }];
    editor.history.run('fill', (tx) => setTextFills(tx, get(), red, { start: 0, end: 1 }));
    expect(textStyleValue(get(), 'fills', { start: 0, end: 1 })).toEqual(red);
    expect(textStyleValue(get(), 'fills')).toBeUndefined();
    editor.history.undo();
    expect(get().styleRuns).toBeUndefined();
  });

  test('decoration, letter case, max lines and typography steps', () => {
    editor.history.run('type', (tx) => tx.set(id, 'characters', 'Hello world'));
    editor.history.run('u', (tx) => toggleTextDecoration(tx, get(), 'UNDERLINE', { start: 0, end: 5 }));
    expect(textStyleValue(get(), 'textDecoration', { start: 0, end: 5 })).toBe('UNDERLINE');
    expect(textStyleValue(get(), 'textDecoration')).toBeUndefined();
    editor.history.run('u', (tx) => toggleTextDecoration(tx, get(), 'UNDERLINE', { start: 0, end: 5 }));
    expect(get().styleRuns).toBeUndefined();
    editor.history.run('case', (tx) => setTextCase(tx, get(), 'UPPER'));
    expect(get().textCase).toBe('UPPER');
    editor.history.run('case', (tx) => setTextCase(tx, get(), 'ORIGINAL'));
    expect('textCase' in get()).toBe(false);
    editor.history.run('max', (tx) => setMaxLines(tx, get(), 2.4));
    expect(get().maxLines).toBe(2);
    editor.history.run('max', (tx) => setMaxLines(tx, get(), undefined));
    expect('maxLines' in get()).toBe(false);
    editor.history.run('paragraphs', (tx) => {
      setParagraphSpacing(tx, get(), 12.345);
      setParagraphIndent(tx, get(), -4);
    });
    expect(get().paragraphSpacing).toBe(12.35);
    expect('paragraphIndent' in get()).toBe(false);
    editor.history.run('paragraphs', (tx) => setParagraphSpacing(tx, get(), 0));
    expect('paragraphSpacing' in get()).toBe(false);

    const context = { fonts, autoLineHeight: (size: number) => size * 1.2 };
    // Mixed sizes step individually.
    editor.history.run('size', (tx) => setFontSize(tx, get(), 20, { start: 0, end: 5 }));
    editor.history.run('step', (tx) => stepTextProperty(tx, get(), 'fontSize', 1, context));
    expect(textStyleValue(get(), 'fontSize', { start: 0, end: 5 })).toBe(21);
    expect(textStyleValue(get(), 'fontSize', { start: 5, end: 11 })).toBe(13);
    expect(editor.history.run('weight', (tx) => stepTextProperty(tx, get(), 'fontWeight', 1, context))).toBe(true);
    expect(get().fontName.style).toBe('Bold');
    expect(editor.history.run('weight', (tx) => stepTextProperty(tx, get(), 'fontWeight', 1, context))).toBe(false);
    editor.history.run('spacing', (tx) => stepTextProperty(tx, get(), 'letterSpacing', -1, context));
    expect(get().letterSpacing).toEqual({ unit: 'PERCENT', value: -0.1 });
    editor.history.run('lh', (tx) => stepTextProperty(tx, get(), 'lineHeight', 1, context));
    expect(get().lineHeight).toEqual({ unit: 'PIXELS', value: 26 });
  });

  test('the Scale tool scales font size and pixel spacing', () => {
    editor.history.run('spacing', (tx) => {
      setFontSize(tx, get(), 10);
      setLineHeight(tx, get(), { unit: 'PIXELS', value: 12 });
      setLetterSpacing(tx, get(), { unit: 'PERCENT', value: 5 });
    });
    const snapshot = captureScale(editor.doc, editor.scene, [id]);
    editor.history.run('scale', (tx) => applyScale(tx, snapshot, 2, { x: 0, y: 0 }));
    expect(get()).toMatchObject({ fontSize: 20, lineHeight: { unit: 'PIXELS', value: 24 }, letterSpacing: { unit: 'PERCENT', value: 5 } });
  });
});
