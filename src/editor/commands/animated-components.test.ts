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
import { createComponent } from './components';
import { insertInstance } from './insert-instance';
import { addKeyframe, animatedInstances, instanceTracks, setInstanceOffset, shownAnimation } from './motion';

let editor: Editor;
let rect: string;
let main: string;
let instance: string;

/** A component holding one animated rectangle, and an instance of it beside it. */
beforeEach(() => {
  const ids = new IdGenerator('c');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x: 0, y: 0, width: 60, height: 40 }));
    return id;
  });
  // The rectangle slides from x 0 to x 100 over the first second, before it becomes a component.
  addKeyframe(editor, [rect], 'x', 0, 0);
  addKeyframe(editor, [rect], 'x', 1000, 100);

  editor.state.select([rect]);
  main = createComponent(editor)!;
  instance = insertInstance(editor, main, { x: 400, y: 400 })!;
});

const layer = (id: string) => editor.doc.getOrThrow(id) as SceneNode;

/** The instance's own copy of the animated rectangle: the layer mirroring it. */
const mirror = () => editor.doc.children(instance).map((id) => layer(id)).find((node) => 'source' in node && node.source === rect)!;

describe('an animated component', () => {
  test('lends its animation to its instances, on their own layers', () => {
    expect(animatedInstances(editor.doc, shownAnimation(editor), editor.pageId)).toEqual([instance]);
    const tracks = instanceTracks(editor.doc, shownAnimation(editor), instance);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.nodeId).toBe(mirror().id);
    expect(tracks[0]!.keyframes.map((k) => k.time)).toEqual([0, 1000]);
  });

  test('the instance moves on the canvas as the animation plays', () => {
    const before = mirror().transform[4];
    const preview = new MotionPreview(editor);
    preview.show(500);
    // Halfway through the slide, the instance's own rectangle is halfway along it.
    expect(mirror().transform[4]).toBe(50);
    preview.clear();
    expect(mirror().transform[4]).toBe(before);
  });

  test('dragging the instance along the timeline delays its animation without touching the component', () => {
    expect(setInstanceOffset(editor, instance, 500)).toBe(true);
    expect(instanceTracks(editor.doc, shownAnimation(editor), instance)[0]!.keyframes.map((k) => k.time)).toEqual([500, 1500]);
    // The component itself is untouched: it still starts at the beginning.
    expect(trackFor(shownAnimation(editor), rect, 'x')!.keyframes.map((k) => k.time)).toEqual([0, 1000]);

    // Delayed half a second, the instance has not started moving when the component is already halfway.
    const preview = new MotionPreview(editor);
    preview.show(500);
    expect(mirror().transform[4]).toBe(0);
    preview.show(1000);
    expect(mirror().transform[4]).toBe(50);
    preview.clear();
  });

  test('a layer that is not an instance takes no offset, and an offset of nothing is not kept', () => {
    expect(setInstanceOffset(editor, rect, 500)).toBe(false);
    expect(setInstanceOffset(editor, instance, 0)).toBe(false);
    setInstanceOffset(editor, instance, 400);
    expect(setInstanceOffset(editor, instance, 0)).toBe(true);
    expect((layer(instance) as SceneNode & { animationOffset?: number }).animationOffset).toBeUndefined();
  });
});
