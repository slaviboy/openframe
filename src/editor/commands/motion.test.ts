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
import { hitMotionPathKeyframe, keyframePositionAt, motionPath } from '../chrome/motion-path';
import { MotionPreview } from '../motion/preview';
import { screenToWorld } from '../viewport/viewport';
import { anchorPoint, rotationDegrees, setRotation } from './properties';
import { addKeyframe, applyMotionPreset, deleteKeyframe, hasKeyframe, isAnimated, pageAnimation, removeAnimatedProperty, moveKeyframePosition, setAnimationDuration, setAnimationPlayback, setSegmentEasing } from './motion';

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

describe('preset animations', () => {
  test('a preset writes its keyframes from the playhead, worked out from what the layer is now', () => {
    expect(applyMotionPreset(editor, [rect], 'FADE_IN', 200)).toBe(true);
    const track = trackFor(pageAnimation(editor), rect, 'opacity')!;
    // Fades from nothing at the playhead to the layer's own opacity 500 ms later, easing out of the move.
    expect(track.keyframes).toEqual([
      { time: 200, value: 0, easing: { type: 'EASE_OUT' } },
      { time: 700, value: 1 },
    ]);
  });

  test('a spin turns the layer a full circle, and a composite style animates several properties at once', () => {
    applyMotionPreset(editor, [rect], 'SPIN', 0);
    expect(trackFor(pageAnimation(editor), rect, 'rotation')!.keyframes.map((k) => k.value)).toEqual([0, -360]);

    applyMotionPreset(editor, [rect], 'POP_IN', 0);
    expect(isAnimated(editor, rect, 'opacity')).toBe(true);
    expect(isAnimated(editor, rect, 'width')).toBe(true);
    expect(isAnimated(editor, rect, 'height')).toBe(true);
    // The scale part springs into place.
    expect(trackFor(pageAnimation(editor), rect, 'width')!.keyframes[0]!.easing).toEqual({ type: 'BOUNCY' });
  });

  test('an unknown preset changes nothing, and a property\u2019s animation can be taken off again', () => {
    expect(applyMotionPreset(editor, [rect], 'NOPE', 0)).toBe(false);
    applyMotionPreset(editor, [rect], 'FADE_IN', 0);
    expect(removeAnimatedProperty(editor, [rect], 'opacity')).toBe(true);
    expect(isAnimated(editor, rect, 'opacity')).toBe(false);
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

describe('the anchor point', () => {
  test('is the middle of a layer until one is set', () => {
    expect(anchorPoint(node())).toEqual({ x: 30, y: 20 });
    editor.history.run('anchor', (tx) => tx.set(rect, 'anchor', { x: 0, y: 0 }));
    expect(anchorPoint(node())).toEqual({ x: 0, y: 0 });
  });

  test('a layer turns around it, so a corner anchor keeps that corner still', () => {
    editor.history.run('anchor', (tx) => tx.set(rect, 'anchor', { x: 0, y: 0 }));
    const before = { x: node().transform[4], y: node().transform[5] };
    editor.history.run('rotate', (tx) => setRotation(tx, node(), 90));
    expect(rotationDegrees(node())).toBeCloseTo(90, 6);
    // The top-left corner is where it was; the rest of the layer swung around it.
    expect(node().transform[4]).toBeCloseTo(before.x, 6);
    expect(node().transform[5]).toBeCloseTo(before.y, 6);
  });

  test('a layer scaling in Motion keeps its anchor still', () => {
    editor.history.run('anchor', (tx) => tx.set(rect, 'anchor', { x: 0, y: 0 }));
    addKeyframe(editor, [rect], 'width', 0, 60);
    addKeyframe(editor, [rect], 'width', 1000, 20);

    const preview = new MotionPreview(editor);
    preview.show(1000);
    // Anchored at its left edge, the layer shrinks to the right and its x stays put.
    expect(node().size.width).toBe(20);
    expect(node().transform[4]).toBe(10);
    preview.clear();
  });
});

describe('the motion path', () => {
  const show = () => {
    editor.state.setMode('motion');
    editor.state.select([rect]);
  };

  test('appears once a layer has position keyframes, with a box at each one and dots between', () => {
    show();
    expect(motionPath(editor)).toBeNull();
    addKeyframe(editor, [rect], 'x', 0, 10);
    addKeyframe(editor, [rect], 'x', 1000, 210);

    const path = motionPath(editor)!;
    expect(path.points.map((p) => p.time)).toEqual([0, 1000]);
    // The boxes trace the layer's anchor point, so at zoom 1 they stand the 200 apart that the keyframes are.
    expect(path.points[1]!.screen.x - path.points[0]!.screen.x).toBe(200);
    expect(path.points[1]!.screen.y).toBe(path.points[0]!.screen.y);
    expect(path.dots).toHaveLength(11);
    expect(hitMotionPathKeyframe(editor, path.points[1]!.screen)!.time).toBe(1000);
  });

  test('is only shown in Motion, and only for one layer at a time', () => {
    show();
    addKeyframe(editor, [rect], 'x', 0, 10);
    expect(motionPath(editor)).not.toBeNull();

    editor.state.setMode('design');
    expect(motionPath(editor)).toBeNull();
    show();
    editor.state.select([]);
    expect(motionPath(editor)).toBeNull();
  });

  test('easing shows in the path: the dots bunch up where the layer moves slowly', () => {
    show();
    addKeyframe(editor, [rect], 'x', 0, 10);
    addKeyframe(editor, [rect], 'x', 1000, 110);
    const straight = motionPath(editor)!.dots.map((dot) => dot.x);

    setSegmentEasing(editor, { nodeId: rect, property: 'x', time: 0 }, { type: 'EASE_IN' });
    const eased = motionPath(editor)!.dots.map((dot) => dot.x);
    // Easing in starts slowly, so every dot is behind where an even run would put it.
    expect(eased[0]!).toBeLessThan(straight[0]!);
    expect(eased.at(-1)!).toBeLessThan(straight.at(-1)!);
  });

  test('a box drags to another place, writing the layer’s x and y at that moment', () => {
    show();
    addKeyframe(editor, [rect], 'x', 500);
    const box = motionPath(editor)!.points[0]!.screen;
    const world = screenToWorld(editor.state.viewport, { x: box.x + 40, y: box.y + 25 });

    expect(moveKeyframePosition(editor, rect, 500, keyframePositionAt(editor, rect, world)!)).toBe(true);
    expect(trackFor(pageAnimation(editor), rect, 'x')!.keyframes).toEqual([{ time: 500, value: 50 }]);
    // The layer had no y keyframes at all; dragging the box across the canvas gives it one.
    expect(trackFor(pageAnimation(editor), rect, 'y')!.keyframes).toEqual([{ time: 500, value: 45 }]);
  });
});
