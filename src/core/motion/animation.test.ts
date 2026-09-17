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

import { describe, expect, test } from 'vitest';
import type { PageAnimation } from '../schema/document';
import {
  DEFAULT_ANIMATION,
  animatedLayers,
  curveFor,
  curveOffsetAt,
  ease,
  keyframeAt,
  moveKeyframe,
  pathSegmentAt,
  pathTimes,
  playheadAt,
  removeKeyframe,
  setCurve,
  setKeyframe,
  setKeyframeEasing,
  trackFor,
  valueAt,
  valuesAt,
  withoutLayers,
} from './animation';

/** A square that slides from x 0 to x 100 over the first second, and fades in over half of it. */
const slide: PageAnimation = {
  duration: 2000,
  playback: 'LOOP',
  tracks: [
    {
      nodeId: 'a',
      property: 'x',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
      ],
    },
    {
      nodeId: 'a',
      property: 'opacity',
      keyframes: [
        { time: 0, value: 0 },
        { time: 500, value: 1 },
      ],
    },
  ],
};

describe('an animation', () => {
  test('starts as two seconds on a loop, with nothing animated', () => {
    expect(DEFAULT_ANIMATION).toEqual({ duration: 2000, playback: 'LOOP', tracks: [] });
  });

  test('blends a property between the keyframes either side', () => {
    const track = trackFor(slide, 'a', 'x')!;
    expect(valueAt(track, 0)).toBe(0);
    expect(valueAt(track, 250)).toBe(25);
    expect(valueAt(track, 1000)).toBe(100);
  });

  test('holds the first and last values beyond the ends', () => {
    const track = trackFor(slide, 'a', 'opacity')!;
    expect(valueAt(track, -100)).toBe(0);
    expect(valueAt(track, 1500)).toBe(1);
  });

  test('gives every animated property of every layer at a moment', () => {
    expect(valuesAt(slide, 500)).toEqual(new Map([['a', { x: 50, opacity: 1 }]]));
    expect(valuesAt(undefined, 0).size).toBe(0);
    expect(animatedLayers(slide)).toEqual(['a']);
  });

  test('a keyframe is set, replaced and removed, and a track without keyframes goes away', () => {
    const added = setKeyframe(DEFAULT_ANIMATION, 'b', 'rotation', 250, 45);
    expect(trackFor(added, 'b', 'rotation')!.keyframes).toEqual([{ time: 250, value: 45 }]);

    // A second keyframe sorts into place; one at the same moment replaces it.
    const two = setKeyframe(added, 'b', 'rotation', 0, 0);
    expect(two.tracks[0]!.keyframes.map((k) => k.time)).toEqual([0, 250]);
    const replaced = setKeyframe(two, 'b', 'rotation', 250, 90);
    expect(keyframeAt(trackFor(replaced, 'b', 'rotation'), 250)).toEqual({ time: 250, value: 90 });
    expect(replaced.tracks[0]!.keyframes).toHaveLength(2);

    const fewer = removeKeyframe(replaced, 'b', 'rotation', 250);
    expect(fewer.tracks[0]!.keyframes).toEqual([{ time: 0, value: 0 }]);
    expect(removeKeyframe(fewer, 'b', 'rotation', 0).tracks).toEqual([]);
  });

  test('the tracks of layers that are gone go with them', () => {
    expect(withoutLayers(slide, new Set(['a'])).tracks).toEqual([]);
    expect(withoutLayers(slide, new Set(['z'])).tracks).toHaveLength(2);
  });

  test('a keyframe is moved to another moment, keeping its value', () => {
    const moved = moveKeyframe(slide, 'a', 'x', 1000, 1500);
    expect(trackFor(moved, 'a', 'x')!.keyframes).toEqual([
      { time: 0, value: 0 },
      { time: 1500, value: 100 },
    ]);
    // A keyframe already at the destination gives way, and one that isn't there changes nothing.
    expect(trackFor(moveKeyframe(slide, 'a', 'x', 1000, 0), 'a', 'x')!.keyframes).toEqual([{ time: 0, value: 100 }]);
    expect(moveKeyframe(slide, 'a', 'x', 999, 0)).toBe(slide);
  });

  test('easing shapes the move between two keyframes', () => {
    // Without easing the value runs straight.
    expect(ease(undefined, 0.25)).toBe(0.25);
    // Hold waits at the first value and jumps at the end.
    expect(ease({ type: 'HOLD' }, 0.99)).toBe(0);
    expect(ease({ type: 'HOLD' }, 1)).toBe(1);
    // Ease in starts slowly, so it is behind a straight line halfway along.
    expect(ease({ type: 'EASE_IN' }, 0.5)).toBeLessThan(0.5);
    expect(ease({ type: 'EASE_OUT' }, 0.5)).toBeGreaterThan(0.5);

    const held = setKeyframeEasing(slide, 'a', 'x', 0, { type: 'HOLD' });
    const track = trackFor(held, 'a', 'x')!;
    expect(valueAt(track, 500)).toBe(0);
    expect(valueAt(track, 1000)).toBe(100);

    // Taking the easing off runs it straight again.
    expect(trackFor(setKeyframeEasing(held, 'a', 'x', 0, undefined), 'a', 'x')!.keyframes[0]!.easing).toBeUndefined();
  });

  test('the playhead follows the playback mode', () => {
    const once: PageAnimation = { ...slide, playback: 'ONCE' };
    expect(playheadAt(once, 500)).toEqual({ time: 500, done: false });
    expect(playheadAt(once, 2500)).toEqual({ time: 2000, done: true });

    expect(playheadAt(slide, 2500).time).toBe(500);
    expect(playheadAt(slide, 2500).done).toBe(false);

    const pingPong: PageAnimation = { ...slide, playback: 'PING_PONG' };
    expect(playheadAt(pingPong, 500).time).toBe(500);
    expect(playheadAt(pingPong, 2500).time).toBe(1500);
    expect(playheadAt(pingPong, 4000).time).toBe(0);
  });
});

/** A square travelling straight from (0, 0) to (100, 0) over the first second: a motion path to bend. */
const travel: PageAnimation = {
  duration: 2000,
  playback: 'LOOP',
  tracks: [
    {
      nodeId: 'a',
      property: 'x',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
      ],
    },
    {
      nodeId: 'a',
      property: 'y',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1000, value: 0 },
      ],
    },
  ],
};

describe('a bent motion path', () => {
  test('runs between the moments the layer\u2019s position is keyframed at', () => {
    expect(pathTimes(travel, 'a')).toEqual([0, 1000]);
    expect(pathSegmentAt(travel, 'a', 400)).toEqual({ from: 0, to: 1000 });
    // Past the last keyframe there is no stretch left to bend.
    expect(pathSegmentAt(travel, 'a', 1500)).toBeUndefined();
    expect(pathTimes(travel, 'zz')).toEqual([]);
  });

  test('pulls the layer off the straight line, furthest in the middle of the stretch', () => {
    const bent = setCurve(travel, 'a', 0, { x: 0, y: 40 });
    expect(curveFor(bent, 'a', 0)).toEqual({ nodeId: 'a', time: 0, x: 0, y: 40 });
    // The middle of the curve is half as far off as the offset; the keyframes themselves do not move.
    expect(curveOffsetAt(bent, 'a', 500)).toEqual({ x: 0, y: 20 });
    expect(curveOffsetAt(bent, 'a', 0)).toEqual({ x: 0, y: 0 });
    expect(curveOffsetAt(bent, 'a', 1000)).toEqual({ x: 0, y: 0 });
    expect(valuesAt(bent, 500).get('a')).toEqual({ x: 50, y: 20 });
    // A straight path has nothing to add, and taking the bend off makes it straight again.
    expect(curveOffsetAt(travel, 'a', 500)).toEqual({ x: 0, y: 0 });
    expect(setCurve(bent, 'a', 0, undefined).curves).toBeUndefined();
  });

  test('keeps its shape under easing: the layer travels the same curve, at another pace', () => {
    const bent = setKeyframeEasing(setCurve(travel, 'a', 0, { x: 0, y: 40 }), 'a', 'x', 0, { type: 'EASE_IN' });
    const values = valuesAt(bent, 500).get('a')!;
    // Easing in holds the layer back, and the bend it has reached is the one belonging to that point of the curve.
    expect(values.x!).toBeLessThan(50);
    expect(values.y!).toBeLessThan(20);
    const u = values.x! / 100;
    expect(values.y!).toBeCloseTo(40 * 2 * u * (1 - u), 6);
  });

  test('travels with the keyframe it starts at, and goes when that keyframe does', () => {
    const bent = setCurve(travel, 'a', 0, { x: 0, y: 40 });
    const moved = moveKeyframe(moveKeyframe(bent, 'a', 'x', 0, 200), 'a', 'y', 0, 200);
    expect(curveFor(moved, 'a', 200)).toMatchObject({ time: 200, y: 40 });
    expect(curveFor(moved, 'a', 0)).toBeUndefined();

    // Removing the keyframe the bend starts at leaves nothing for it to bend.
    const fewer = removeKeyframe(removeKeyframe(bent, 'a', 'x', 0), 'a', 'y', 0);
    expect(fewer.curves).toBeUndefined();
    // So does deleting the layer.
    expect(withoutLayers(bent, new Set(['a'])).curves).toBeUndefined();
  });
});
