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
import { trackFor } from '@/core/motion/animation';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { MotionPreview } from '../motion/preview';
import { addKeyframe, deleteKeyframe, hasKeyframe, isAnimated, pageAnimation, setAnimationDuration, setAnimationPlayback } from './motion';

let editor: Editor;
let rect: string;

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x: 10, y: 20, width: 60, height: 40 }));
    return id;
  });
});

const node = () => editor.doc.getOrThrow(rect) as SceneNode;

describe('keyframes', () => {
  test('a keyframe records what the layer is now, at the playhead', () => {
    expect(addKeyframe(editor, [rect], 'x', 0)).toBe(true);
    expect(trackFor(pageAnimation(editor), rect, 'x')!.keyframes).toEqual([{ time: 0, value: 10 }]);
    expect(hasKeyframe(editor, rect, 'x', 0)).toBe(true);
    expect(isAnimated(editor, rect, 'opacity')).toBe(false);

    // A value given instead: how a field edited at another moment makes the next keyframe.
    addKeyframe(editor, [rect], 'x', 500, 200);
    expect(trackFor(pageAnimation(editor), rect, 'x')!.keyframes).toEqual([
      { time: 0, value: 10 },
      { time: 500, value: 200 },
    ]);
  });

  test('deleting the last keyframe of a property leaves it unanimated, and the page plain again', () => {
    addKeyframe(editor, [rect], 'opacity', 250);
    expect(deleteKeyframe(editor, [rect], 'opacity', 250)).toBe(true);
    expect(isAnimated(editor, rect, 'opacity')).toBe(false);
    // Nothing animated and nothing changed about the timing: the page carries no animation at all.
    expect(pageAnimation(editor)).toBeUndefined();
  });

  test('duration and playback are kept on the page', () => {
    expect(setAnimationDuration(editor, 3500)).toBe(true);
    expect(setAnimationPlayback(editor, 'PING_PONG')).toBe(true);
    expect(pageAnimation(editor)).toMatchObject({ duration: 3500, playback: 'PING_PONG' });
    // Out-of-range durations are brought back in.
    setAnimationDuration(editor, 0);
    expect(pageAnimation(editor)!.duration).toBe(1);
  });
});

describe('the motion preview', () => {
  test('shows the animated values at a moment, and puts the file back when it is cleared', () => {
    addKeyframe(editor, [rect], 'x', 0, 0);
    addKeyframe(editor, [rect], 'x', 1000, 100);
    addKeyframe(editor, [rect], 'opacity', 0, 0);
    addKeyframe(editor, [rect], 'opacity', 1000, 1);

    const preview = new MotionPreview(editor);
    preview.show(500);
    expect(node().transform[4]).toBe(50);
    expect(node().opacity).toBe(0.5);
    expect(preview.active).toBe(true);

    preview.show(1000);
    expect(node().transform[4]).toBe(100);

    preview.clear();
    expect(node().transform[4]).toBe(10);
    expect(node().opacity).toBe(1);
    expect(preview.active).toBe(false);
  });

  test('the preview is not an edit: it leaves no undo step', () => {
    addKeyframe(editor, [rect], 'x', 0, 0);
    addKeyframe(editor, [rect], 'x', 1000, 100);
    const preview = new MotionPreview(editor);
    preview.show(500);
    preview.clear();

    // Undo takes back the keyframes, not the preview.
    editor.history.undo();
    expect(trackFor(pageAnimation(editor), rect, 'x')!.keyframes).toEqual([{ time: 0, value: 0 }]);
  });
});
