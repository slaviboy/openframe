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
import { commandsToNetwork } from './shape-networks';
import { simplifyNetworkCommands } from './simplify';
import { networkBounds, straightSegment, type VectorNetwork } from './vector-network';

/** An open zigzag along a 100-wide line: many points saying very little. */
function zigzag(points: number): VectorNetwork {
  const vertices = Array.from({ length: points }, (_, i) => ({ x: (i * 100) / (points - 1), y: i % 2 === 0 ? 0 : 1 }));
  return { vertices, segments: vertices.slice(1).map((_, i) => straightSegment(i, i + 1)), regions: [] };
}

/** A closed square of 40, with a point added along each side. */
const square: VectorNetwork = (() => {
  const corners = [
    [0, 0],
    [20, 0],
    [40, 0],
    [40, 20],
    [40, 40],
    [20, 40],
    [0, 40],
    [0, 20],
  ] as const;
  const vertices = corners.map(([x, y]) => ({ x, y }));
  const segments = vertices.map((_, i) => straightSegment(i, (i + 1) % vertices.length));
  return { vertices, segments, regions: [{ loops: [segments.map((_, i) => i)], windingRule: 'NONZERO' as const }] };
})();

describe('simplify a vector path', () => {
  test('a zigzag loses the wobble it does not need, keeping where it runs', () => {
    const before = zigzag(41);
    const commands = simplifyNetworkCommands(before, 1);
    expect(commands).not.toBeNull();
    const after = commandsToNetwork(commands!);
    expect(after.vertices.length).toBeLessThan(before.vertices.length);
    const bounds = networkBounds(after)!;
    expect(bounds.width).toBeCloseTo(100, 0);
  });

  test('an amount of zero changes nothing', () => {
    expect(simplifyNetworkCommands(zigzag(41), 0)).toBeNull();
  });

  test('a closed shape stays closed, so its fill survives', () => {
    const commands = simplifyNetworkCommands(square, 0.5);
    expect(commands).not.toBeNull();
    expect(commands!.at(-1)).toEqual({ op: 'Z' });
    const after = commandsToNetwork(commands!);
    expect(after.regions.length).toBeGreaterThan(0);
    const bounds = networkBounds(after)!;
    expect(bounds.width).toBeCloseTo(40, 0);
    expect(bounds.height).toBeCloseTo(40, 0);
  });

  test('a stronger amount keeps fewer points than a gentler one', () => {
    const gentle = commandsToNetwork(simplifyNetworkCommands(zigzag(41), 0.2)!);
    const strong = commandsToNetwork(simplifyNetworkCommands(zigzag(41), 1)!);
    expect(strong.vertices.length).toBeLessThanOrEqual(gentle.vertices.length);
  });

  test('a branching network is left alone, since its contours can’t be told apart', () => {
    const branching: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 10 },
        { x: 20, y: -10 },
      ],
      segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(1, 3)],
      regions: [],
    };
    expect(simplifyNetworkCommands(branching, 1)).toBeNull();
  });
});
