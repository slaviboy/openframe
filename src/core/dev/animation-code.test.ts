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
import type { PageAnimation } from '@/core/schema/document';
import { generateAnimationCode } from './animation-code';

/** A card that slides 100 to the right and fades in over the first second of a two-second loop. */
const animation: PageAnimation = {
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
        { time: 1000, value: 1 },
      ],
    },
  ],
};

describe('the code an animation is handed over as', () => {
  test('CSS writes the keyframes at their share of the run, and repeats it', () => {
    const css = generateAnimationCode(animation, 'a', 'Card', 'CSS')!;
    expect(css).toContain('@keyframes card {');
    expect(css).toContain('0% {');
    // A keyframe a second into a two-second animation is halfway along it.
    expect(css).toContain('50% {');
    expect(css).toContain('transform: translate(100px, 0px);');
    expect(css).toContain('opacity: 1;');
    expect(css).toContain('animation: card 2000ms linear infinite;');
  });

  test('playing once does not repeat, and ping-pong turns back', () => {
    expect(generateAnimationCode({ ...animation, playback: 'ONCE' }, 'a', 'Card', 'CSS')).toContain('linear 1;');
    expect(generateAnimationCode({ ...animation, playback: 'PING_PONG' }, 'a', 'Card', 'CSS')).toContain('infinite alternate;');
  });

  test('React writes the values as arrays against where they fall in the run', () => {
    const react = generateAnimationCode(animation, 'a', 'Card', 'REACT')!;
    expect(react).toContain('x: [0, 100],');
    expect(react).toContain('opacity: [0, 1],');
    expect(react).toContain('times: [0, 0.5],');
    expect(react).toContain('duration: 2,');
    expect(react).toContain('repeat: Infinity,');
  });

  test('JSON gives the animation as the data it is', () => {
    const json = JSON.parse(generateAnimationCode(animation, 'a', 'Card', 'JSON')!) as { name: string; duration: number; tracks: { property: string }[] };
    expect(json.name).toBe('card');
    expect(json.duration).toBe(2000);
    expect(json.tracks.map((track) => track.property)).toEqual(['x', 'opacity']);
  });

  test('a layer that is not animated has no code to give', () => {
    expect(generateAnimationCode(animation, 'zz', 'Other', 'CSS')).toBeNull();
    expect(generateAnimationCode(undefined, 'a', 'Card', 'CSS')).toBeNull();
  });

  test('a name that is no use as an identifier is made into one', () => {
    expect(generateAnimationCode(animation, 'a', '  ', 'CSS')).toContain('@keyframes layer- {');
    expect(generateAnimationCode(animation, 'a', 'Hero Banner!', 'CSS')).toContain('@keyframes hero-banner {');
  });
});
