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
import { makeEllipse, makeLine, makeRectangle, makeStar } from '../document/factory';
import { commandsToNetwork, ellipseCommands, shapeNetwork } from './shape-networks';
import { networkBounds } from './vector-network';

const init = { id: 'x:1', parent: { id: '0:1', key: 'a' }, name: 'n', x: 0, y: 0, width: 40, height: 20 };

describe('shape networks', () => {
  test('a closed subpath becomes a region, merging its closing point with the start', () => {
    const network = commandsToNetwork([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 10, y: 0 },
      { op: 'L', x: 0, y: 10 },
      { op: 'L', x: 0, y: 0 },
      { op: 'Z' },
    ]);
    expect(network.vertices).toHaveLength(3);
    expect(network.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
    expect(network.regions).toEqual([{ loops: [[0, 1, 2]], windingRule: 'NONZERO' }]);
  });

  test('rectangles, ellipses, stars and lines flatten to networks with their outlines', () => {
    const rect = shapeNetwork(makeRectangle(init))!;
    expect(rect.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ]);
    expect(rect.regions).toHaveLength(1);

    const ellipse = shapeNetwork(makeEllipse(init))!;
    expect(ellipse.vertices).toHaveLength(4);
    expect(networkBounds(ellipse)).toEqual({ x: 0, y: 0, width: 40, height: 20 });
    expect(commandsToNetwork(ellipseCommands(40, 20)).regions).toHaveLength(1);

    expect(shapeNetwork(makeStar(init))!.vertices).toHaveLength(10);
    const rounded = shapeNetwork({ ...makeRectangle(init), cornerRadius: 5 })!;
    expect(rounded.regions).toHaveLength(1);
    expect(networkBounds(rounded)!.width).toBeCloseTo(40);

    const line = shapeNetwork(makeLine(init))!;
    expect(line.segments).toHaveLength(1);
    expect(line.regions).toEqual([]);
  });
});
