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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createEmptyDocument, keyOnTop, makeText } from '@/core/document/factory';
import type { PathCommand } from '@/core/geometry/corners';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode, TextNode } from '@/core/schema/document';
import type { OutlineFont } from '@/core/text/glyph-paths';
import type { GlyphPlacement, TextLayoutService } from '@/core/text/text-layout';
import { Editor } from '../editor';
import { GlyphOutlineCache } from './glyph-outline-cache';

let editor: Editor;
let id: string;
let reads: number;

/** A stand-in font: every character it knows is a box the size of the text, sitting on the baseline. */
const boxFont: OutlineFont = {
  has: () => true,
  outline: (_char, x, y, size): PathCommand[] => [{ op: 'M', x, y: y - size }, { op: 'L', x: x + size, y: y - size }, { op: 'L', x: x + size, y }, { op: 'Z' }],
};

const placements = (text: string): GlyphPlacement[] => [...text].map((char, i) => ({ char, x: i * 10, baseline: 10, fontSize: 10, family: 'Inter' }));

beforeEach(() => {
  const ids = new IdGenerator('g');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  reads = 0;
  editor.setTextLayout({
    glyphPlacements: (node: TextNode) => placements(node.characters),
    availableFonts: () => [],
    fontBytesOf: () => new Uint8Array([1]),
    measure: (node: TextNode) => node.size,
  } as unknown as TextLayoutService);
  editor.glyphOutlines = new GlyphOutlineCache(editor, async () => {
    reads++;
    return async () => boxFont;
  });
  id = editor.history.run('create', (tx) => {
    const textId = editor.ids.next();
    tx.create({ ...makeText({ id: textId, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'T', x: 0, y: 0, width: 30, height: 20 }), characters: 'ab' });
    return textId;
  });
});

const text = () => editor.doc.getOrThrow(id) as SceneNode;
/** Lets the reads that were asked for finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('glyph outlines kept ready for the frame', () => {
  test('the first ask comes back empty and starts the read; the next frame has the outlines', async () => {
    expect(editor.glyphOutlines.get(text())).toBeNull();
    await settle();
    expect(editor.glyphOutlines.get(text())).toHaveLength(8);
    // The read happened once, and the answer is kept rather than asked for again.
    expect(reads).toBe(1);
    expect(editor.glyphOutlines.get(text())).toHaveLength(8);
    expect(reads).toBe(1);
  });

  test('a redraw is asked for once the outlines arrive, so the next frame can use them', async () => {
    const render = vi.fn();
    editor.onRender(render);
    editor.glyphOutlines.get(text());
    await settle();
    expect(render).toHaveBeenCalled();
  });

  test('editing the words reads them again; everything else it already holds stays', async () => {
    editor.glyphOutlines.get(text());
    await settle();
    editor.history.run('type', (tx) => tx.set(id, 'characters', 'abc'));
    expect(editor.glyphOutlines.get(text())).toBeNull();
    await settle();
    expect(editor.glyphOutlines.get(text())).toHaveLength(12);
  });

  test('a layer with no words has no outlines to read', () => {
    editor.history.run('clear', (tx) => tx.set(id, 'characters', ''));
    expect(editor.glyphOutlines.get(text())).toBeNull();
    expect(reads).toBe(0);
  });
});
