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
import { Editor } from '../editor';
import { hitGridTrackEdge, selectedGridTracks } from './grid-tracks';

let editor: Editor;
let grid: string;
let child: string;

beforeEach(() => {
  const ids = new IdGenerator('g');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  [grid, child] = editor.history.run('seed', (tx) => {
    const frame = editor.ids.next();
    tx.create({
      ...makeFrame({ id: frame, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Grid', x: 0, y: 0, width: 10, height: 10 }),
      layoutMode: 'GRID',
      layoutSizingHorizontal: 'HUG',
      layoutSizingVertical: 'HUG',
      gridColumnSizes: [
        { type: 'FIXED', value: 100 },
        { type: 'FIXED', value: 50 },
      ],
    });
    const rect = editor.ids.next();
    tx.create(makeRectangle({ id: rect, parent: { id: frame, key: keyOnTop(editor.doc, frame) }, name: 'R', x: 0, y: 0, width: 20, height: 20 }));
    return [frame, rect] as const;
  });
});

describe('grid track handles in the editor', () => {
  test('only a single selected grid frame has track handles', () => {
    expect(selectedGridTracks(editor)).toBeNull();
    editor.state.select([child]);
    expect(selectedGridTracks(editor)).toBeNull();
    editor.state.select([grid]);
    expect(selectedGridTracks(editor)?.columns).toEqual([
      { start: 0, length: 100 },
      { start: 100, length: 50 },
    ]);
  });

  test('track edges can be grabbed near the top side (columns) or left side (rows)', () => {
    editor.state.select([grid]);
    expect(hitGridTrackEdge(editor, { x: 101, y: 8 }, 4)).toMatchObject({ axis: 'column', index: 0 });
    expect(hitGridTrackEdge(editor, { x: 150, y: 2 }, 4)).toMatchObject({ axis: 'column', index: 1 });
    // Deeper inside the frame the edge belongs to the cells.
    expect(hitGridTrackEdge(editor, { x: 100, y: 40 }, 4)).toBeNull();
    expect(hitGridTrackEdge(editor, { x: 8, y: 20 }, 4)).toMatchObject({ axis: 'row', index: 0 });
  });
});
