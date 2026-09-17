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
import { createEmptyDocument, keyOnTop, makeGroup, makeRectangle, makeText } from '@/core/document/factory';
import type { PathCommand } from '@/core/geometry/corners';
import { IdGenerator } from '@/core/ids/ids';
import type { TextNode, VectorNode } from '@/core/schema/document';
import type { OutlineFont } from '@/core/text/glyph-paths';
import type { GlyphPlacement, TextLayoutService } from '@/core/text/text-layout';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { flattenSelection } from './flatten';
import { outlineStrokeSelection } from './outline-stroke';
import { outlineTextSelection } from './outline-text';

let editor: Editor;
let id: string;

/** A stand-in font: every character it knows is a 10×10 box sitting on the baseline. */
const boxFont = (known: string): OutlineFont => ({
  has: (char) => known.includes(char),
  outline: (_char, x, y, size): PathCommand[] => [{ op: 'M', x, y: y - size }, { op: 'L', x: x + size, y: y - size }, { op: 'L', x: x + size, y }, { op: 'L', x, y }, { op: 'Z' }],
});

/** A stand-in engine: each character sits 10 apart on one baseline, in the layer's own family. */
const layoutService = (placements: readonly GlyphPlacement[]): Partial<TextLayoutService> => ({
  glyphPlacements: () => placements,
  availableFonts: () => [
    { family: 'Inter', styles: [], variable: true },
    { family: 'Fallback', styles: [], variable: true },
  ],
  fontBytesOf: () => new Uint8Array([1]),
});

const placementsFor = (text: string, family = 'Inter'): GlyphPlacement[] => [...text].map((char, i) => ({ char, x: i * 10, baseline: 10, fontSize: 10, family }));

const vector = () => editor.doc.getOrThrow(editor.selection[0]!) as VectorNode;

beforeEach(() => {
  const ids = new IdGenerator('t');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  id = editor.history.run('create', (tx) => {
    const textId = editor.ids.next();
    tx.create({ ...makeText({ id: textId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'T', x: 40, y: 30, width: 30, height: 20 }), characters: 'ab' });
    return textId;
  });
  editor.state.select([id]);
});

describe('convert text to vector paths', () => {
  test('a text layer becomes a vector layer of its glyphs, keeping its fills and its place', async () => {
    const text = editor.doc.getOrThrow(id) as TextNode;
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    const made = await outlineTextSelection(editor, async () => boxFont('ab'));
    expect(made).toHaveLength(1);
    expect(editor.doc.has(id)).toBe(false);
    const node = vector();
    expect(node.type).toBe('VECTOR');
    // Two 10-wide boxes from x 0 and x 10, so the outline is 20 wide and 10 tall.
    expect(node.size).toEqual({ width: 20, height: 10 });
    expect(node.fills).toEqual(text.fills);
    // The glyphs start at the layer's own corner, so the box moves to where they were drawn.
    expect([node.transform[4], node.transform[5]]).toEqual([40, 30]);
  });

  test('characters the layer’s font can’t draw come from a fallback that has them', async () => {
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    const made = await outlineTextSelection(editor, async (family) => (family === 'Inter' ? boxFont('a') : boxFont('b')));
    expect(made).toHaveLength(1);
    // Both characters were drawn, from two different fonts, so the outline still spans them both.
    expect(vector().size).toEqual({ width: 20, height: 10 });
  });

  test('a character no font on offer can draw is left out', async () => {
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    await outlineTextSelection(editor, async () => boxFont('a'));
    expect(vector().size).toEqual({ width: 10, height: 10 });
  });

  test('text nothing can be read from is left as it is, with no undo step', async () => {
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    const before = editor.history.canUndo;
    expect(await outlineTextSelection(editor, async () => null)).toEqual([]);
    expect(editor.doc.getOrThrow(id).type).toBe('TEXT');
    expect(editor.history.canUndo).toBe(before);
  });

  test('one undo puts the text layer back', async () => {
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    await outlineTextSelection(editor, async () => boxFont('ab'));
    editor.history.undo();
    expect(editor.doc.getOrThrow(id).type).toBe('TEXT');
  });

  test('it is offered only with the engine loaded and a text layer selected', () => {
    const enabled = () => editor.commands.get('object.outlineText')!.enabled!(editor);
    expect(enabled()).toBe(false);
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    expect(enabled()).toBe(true);
    editor.state.clearSelection();
    expect(enabled()).toBe(false);
  });
});

describe('outlining a text layer’s stroke', () => {
  test('the stroke follows the glyphs, and the text is replaced by the two vector layers', async () => {
    editor.history.run('stroke', (tx) => {
      tx.set(id, 'strokes', (editor.doc.getOrThrow(id) as TextNode).fills);
      tx.set(id, 'strokeWeight', 2);
    });
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    // A stand-in engine: every stroke covers its layer's box grown by one on each side.
    editor.setGeometry({
      strokeOutline: (node) => [
        { op: 'M', x: -1, y: -1 },
        { op: 'L', x: node.size.width + 1, y: -1 },
        { op: 'L', x: node.size.width + 1, y: node.size.height + 1 },
        { op: 'L', x: -1, y: node.size.height + 1 },
        { op: 'Z' },
      ],
      regionMinusStroke: () => null,
      regionHalves: () => null,
      offsetNetwork: () => null,
    });
    await outlineStrokeSelection(editor, async () => boxFont('ab'));
    expect(editor.doc.has(id)).toBe(false);
    // The glyphs are 20 by 10, so their stroke's outline is 22 by 12.
    const outlined = editor.doc.getOrThrow(editor.selection[0]!) as VectorNode;
    expect(outlined.type).toBe('VECTOR');
    expect(outlined.size).toEqual({ width: 22, height: 12 });
  });
});

describe('flattening text', () => {
  test('a text layer flattens through its outlines, in one undo step', async () => {
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    const before = editor.history.canUndo;
    await flattenSelection(editor, async () => boxFont('ab'));
    const node = vector();
    expect(node.type).toBe('VECTOR');
    expect(node.size).toEqual({ width: 20, height: 10 });
    expect(editor.doc.has(id)).toBe(false);
    // One step: undo puts the text back rather than leaving an outlined layer behind.
    editor.history.undo();
    expect(editor.doc.getOrThrow(id).type).toBe('TEXT');
    expect(editor.history.canUndo).toBe(before);
  });

  test('a group of text and a shape flattens into one layer', async () => {
    const group = editor.history.run('group', (tx) => {
      const groupId = editor.ids.next();
      tx.create(makeGroup({ id: groupId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'G', x: 0, y: 0, width: 80, height: 40 }));
      tx.set(id, 'parent', { id: groupId, key: keyOnTop(tx.store, groupId) });
      const rectId = editor.ids.next();
      tx.create(makeRectangle({ id: rectId, parent: { id: groupId, key: keyOnTop(tx.store, groupId) }, name: 'R', x: 60, y: 0, width: 20, height: 20 }));
      return groupId;
    });
    editor.state.select([group]);
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    await flattenSelection(editor, async () => boxFont('ab'));
    expect(vector().type).toBe('VECTOR');
    expect(editor.doc.has(group)).toBe(false);
    // The glyphs span x 40 to 60 in the group's space (the text layer sits at 40) and the rectangle 60 to 80,
    // so both went into the one layer.
    expect(vector().size.width).toBe(40);
  });

  test('text whose outlines can’t be read is left alone and contributes nothing', async () => {
    editor.setTextLayout(layoutService(placementsFor('ab')) as TextLayoutService);
    await flattenSelection(editor, async () => null);
    expect(editor.doc.getOrThrow(id).type).toBe('TEXT');
  });
});
