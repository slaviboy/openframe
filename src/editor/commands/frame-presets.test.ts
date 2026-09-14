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
import { presetById } from '@/core/document/frame-presets';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { placeFramePreset, resizeFramesToPreset } from './frame-presets';

let editor: Editor;

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

describe('frame presets', () => {
  test('a preset places a frame of its size centered on the point, named after it', () => {
    const phone = presetById('phone-iphone-16')!;
    const id = placeFramePreset(editor, phone, { x: 0, y: 0 });
    const frame = editor.doc.getOrThrow(id) as SceneNode;
    expect(frame).toMatchObject({ type: 'FRAME', size: { width: 393, height: 852 } });
    expect(frame.name).toContain('iPhone 16');
    // Centered on the point, rounded to the pixel grid like other placed layers.
    expect(frame.transform.slice(4)).toEqual([-196, -426]);
    expect(editor.selection).toEqual([id]);
    expect(editor.state.getSnapshot().tool).toBe('move');
    editor.history.undo();
    expect(editor.doc.has(id)).toBe(false);
  });

  test('the Frame dropdown resizes frames to a preset', () => {
    const id = placeFramePreset(editor, presetById('phone-iphone-16')!, { x: 0, y: 0 });
    editor.history.run('Rect', (tx) => tx.create(makeRectangle({ id: 'r', parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'R', x: 0, y: 0, width: 5, height: 5 })));
    expect(resizeFramesToPreset(editor, [id, 'r'], presetById('social-media-instagram-post')!)).toBe(true);
    expect((editor.doc.getOrThrow(id) as SceneNode).size).toEqual({ width: 1080, height: 1080 });
    expect((editor.doc.getOrThrow('r') as SceneNode).size).toEqual({ width: 5, height: 5 });
    expect(resizeFramesToPreset(editor, ['r'], presetById('paper-a4')!)).toBe(false);
  });
});
