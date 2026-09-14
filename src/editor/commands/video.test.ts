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
import { videoFillsIn, videoOptionsOf } from '@/core/prototype/video';
import type { Paint, RectangleNode, VideoPaint } from '@/core/schema/document';
import { Editor } from '../editor';
import { setVideoOptions } from './video';

let editor: Editor;
const video: VideoPaint = { type: 'VIDEO', videoHash: 'a'.repeat(64), imageHash: 'b'.repeat(64), scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' };
const solid: Paint = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' };

beforeEach(() => {
  const ids = new IdGenerator('v');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  const page = editor.pageId;
  editor.history.run('Build', (tx) => {
    const shape = (id: string, parent: string, x: number) => ({ id, parent: { id: parent, key: keyOnTop(tx.store, parent) }, name: id, x, y: 0, width: 16, height: 9 });
    tx.create(makeFrame(shape('screen', page, 0)));
    tx.create({ ...makeRectangle(shape('clip', 'screen', 0)), fills: [solid, video] });
    tx.create({ ...makeRectangle(shape('hidden', 'screen', 20)), fills: [video], visible: false });
    tx.create(makeRectangle(shape('plain', 'screen', 40)));
  });
});

describe('video fills in prototypes', () => {
  test('a frame lists the video fills of its visible layers; options default to autoplay without loop, with sound', () => {
    expect(videoFillsIn(editor.doc, 'screen')).toEqual([{ nodeId: 'clip', index: 1, paint: video }]);
    expect(videoOptionsOf(video)).toEqual({ autoplay: true, loop: false, muted: false });
  });

  test('setting video options changes every video fill of the layers in one undo step', () => {
    expect(setVideoOptions(editor, ['plain'], { loop: true })).toBe(false);
    expect(setVideoOptions(editor, ['clip', 'plain'], { autoplay: false, loop: true })).toBe(true);
    const fills = (editor.doc.getOrThrow('clip') as RectangleNode).fills;
    expect(fills[0]).toEqual(solid);
    expect(videoOptionsOf(fills[1] as VideoPaint)).toEqual({ autoplay: false, loop: true, muted: false });
    editor.history.undo();
    expect((editor.doc.getOrThrow('clip') as RectangleNode).fills[1]).toEqual(video);
  });
});
