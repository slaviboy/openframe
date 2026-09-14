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
import { ImagePaintSchema, type ImagePaint } from '../schema/document';
import { setGifFrame } from './image-paint';

const gif: ImagePaint = { type: 'IMAGE', imageHash: 'a'.repeat(64), scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' };

describe('the frame of a GIF the canvas shows', () => {
  test('is stored from the second frame on, and the first frame is stored as absent', () => {
    const third = setGifFrame(gif, 2);
    expect(third.gifFrame).toBe(2);
    expect(ImagePaintSchema.safeParse(third).success).toBe(true);
    expect('gifFrame' in setGifFrame(third, 0)).toBe(false);
    expect(setGifFrame(gif, 2.6).gifFrame).toBe(3);
    expect('gifFrame' in setGifFrame(gif, -4)).toBe(false);
    expect(ImagePaintSchema.safeParse({ ...gif, gifFrame: 0 }).success).toBe(false);
  });
});
