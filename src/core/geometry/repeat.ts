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

import { IDENTITY, multiply, type Matrix } from '../math/matrix';
import type { RepeatTransform, Size } from '../schema/document';

/** A repeat with nothing to repeat: one copy is just the original. */
export const repeats = (repeat: RepeatTransform | undefined): repeat is RepeatTransform => repeat !== undefined && repeat.count > 1;

const rotation = (degrees: number): Matrix => {
  const radians = (degrees * Math.PI) / 180;
  return { a: Math.cos(radians), b: Math.sin(radians), c: -Math.sin(radians), d: Math.cos(radians), e: 0, f: 0 };
};

const translation = (x: number, y: number): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });

/**
 * Where each copy of a transform group's contents goes, in the group's own space, the original first.
 *
 * A radial repeat turns the contents about the middle of the group, spreading the copies evenly over the angle asked
 * for (the full circle by default). A linear repeat steps them along the group's x or y by the spacing.
 */
export function repeatMatrices(repeat: RepeatTransform, size: Size): Matrix[] {
  const out: Matrix[] = [IDENTITY];
  if (!repeats(repeat)) return out;
  const center = { x: size.width / 2, y: size.height / 2 };
  for (let i = 1; i < repeat.count; i++) {
    if (repeat.kind === 'RADIAL') {
      const spread = repeat.angle ?? 360;
      // A full circle shares the turn between all the copies; a partial spread ends on its last one.
      const step = Math.abs(spread) >= 360 ? spread / repeat.count : spread / Math.max(1, repeat.count - 1);
      out.push(multiply(multiply(translation(center.x, center.y), rotation(step * i)), translation(-center.x, -center.y)));
    } else {
      const along = repeat.spacing * i;
      out.push(repeat.direction === 'VERTICAL' ? translation(0, along) : translation(along, 0));
    }
  }
  return out;
}
