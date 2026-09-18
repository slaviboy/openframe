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
import { flattenPath } from '../geometry/corners';
import { cornerArc, hasCornerRadii, roundNetworkCorners } from './vector-corners';
import { networkBounds, networkStrokePath, regionFillPath, straightSegment, type VectorNetwork } from './vector-network';

/** A 100 × 100 square, closed, with a region over it. */
const square = (radii: Partial<Record<number, number>> = {}): VectorNetwork => ({
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ].map((v, i) => (radii[i] === undefined ? v : { ...v, cornerRadius: radii[i] })),
  segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
  regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
});

/** How far a polyline strays from a circle of `radius` about `center`. */
const radialError = (points: { x: number; y: number }[], center: { x: number; y: number }, radius: number) =>
  Math.max(...points.map((p) => Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius)));

describe('rounding the corner at a vector point', () => {
  test('a point with no radius leaves the network exactly as it was', () => {
    const plain = square();
    expect(hasCornerRadii(plain)).toBe(false);
    expect(roundNetworkCorners(plain)).toBe(plain);
    expect(roundNetworkCorners(square({ 0: 0 }))).toEqual(square({ 0: 0 }));
  });

  test('a rounded corner becomes two points and an arc between them', () => {
    const rounded = roundNetworkCorners(square({ 1: 20 }));
    // The corner point slides back along one edge; a new one appears the same way along the other.
    expect(rounded.vertices[1]!.x).toBeCloseTo(80);
    expect(rounded.vertices[1]!.y).toBeCloseTo(0);
    expect(rounded.vertices[4]!.x).toBeCloseTo(100);
    expect(rounded.vertices[4]!.y).toBeCloseTo(20);
    expect(rounded.vertices).toHaveLength(5);
    // The two edges now end at those, and one curved segment joins them.
    expect(rounded.segments[0]).toMatchObject({ start: 0, end: 1 });
    expect(rounded.segments[1]).toMatchObject({ start: 4, end: 2 });
    expect(rounded.segments).toHaveLength(5);
    expect(rounded.segments[4]).toMatchObject({ start: 1, end: 4 });
    // The radius is gone from the drawn geometry: it has been drawn in.
    expect(rounded.vertices.every((v) => v.cornerRadius === undefined)).toBe(true);
  });

  test('the arc is a quarter circle of the radius asked for', () => {
    const network = square({ 1: 20 });
    const path = regionFillPath(network, network.regions[0]!);
    // Every point of the drawn outline past the corner's tangents sits 20 from the arc's center at (80, 20).
    const near = flattenPath(path, 16).filter((p) => p.x > 80.5 && p.y < 19.5);
    expect(near.length).toBeGreaterThan(4);
    expect(radialError(near, { x: 80, y: 20 }, 20)).toBeLessThan(0.05);
  });

  test('the radius is clamped to half of the shorter edge, so neighbouring corners never overlap', () => {
    // 90° corners on a 100-wide square: the most either can take is 50 along each edge, and each is
    // measured against the square as drawn, not against what its neighbour has already taken.
    const rounded = roundNetworkCorners(square({ 1: 400, 2: 400 }));
    expect(rounded.vertices[1]!.x).toBeCloseTo(50);
    expect(rounded.vertices[1]!.y).toBeCloseTo(0);
    expect(rounded.vertices[2]!.x).toBeCloseTo(100);
    expect(rounded.vertices[2]!.y).toBeCloseTo(50);
    // Both corners reach the midpoint of the edge they share, and neither crosses it.
    const shared = rounded.segments[1]!;
    expect(rounded.vertices[shared.start]!.y).toBeCloseTo(50);
    expect(rounded.vertices[shared.end]!.y).toBeCloseTo(50);
  });

  test('a corner with a curve on either side stays sharp, as the documentation says', () => {
    const curved: VectorNetwork = {
      ...square({ 1: 20 }),
      segments: [{ start: 0, end: 1, tangentStart: { x: 20, y: 0 }, tangentEnd: { x: -20, y: 0 } }, straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
    };
    expect(roundNetworkCorners(curved)).toBe(curved);
  });

  test('a point that is an end of the path, or a junction, has no corner to round', () => {
    // An open path: vertex 0 joins one segment only.
    const open: VectorNetwork = { vertices: [{ x: 0, y: 0, cornerRadius: 10 }, { x: 100, y: 0 }], segments: [straightSegment(0, 1)], regions: [] };
    expect(roundNetworkCorners(open)).toBe(open);

    // A junction: vertex 0 joins three segments.
    const branching: VectorNetwork = {
      vertices: [{ x: 0, y: 0, cornerRadius: 10 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 }],
      segments: [straightSegment(0, 1), straightSegment(0, 2), straightSegment(0, 3)],
      regions: [],
    };
    expect(roundNetworkCorners(branching)).toBe(branching);
  });

  test('the region still walks one closed loop, with the arc in its place', () => {
    const network = square({ 1: 20 });
    const path = regionFillPath(network, network.regions[0]!);
    expect(path.filter((c) => c.op === 'M')).toHaveLength(1);
    expect(path.filter((c) => c.op === 'Z')).toHaveLength(1);
    expect(path.filter((c) => c.op === 'C')).toHaveLength(1);
    // The sharp corner is not on the outline any more.
    expect(path.some((c) => c.op !== 'Z' && c.x === 100 && c.y === 0)).toBe(false);
  });

  test('the open path draws through the arc too, and the bounds hug what is drawn', () => {
    // A tip that sticks out to (100, 50): rounding it pulls the drawn shape back from the tip.
    const tip: VectorNetwork = {
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 50, cornerRadius: 10 }, { x: 0, y: 100 }],
      segments: [straightSegment(0, 1), straightSegment(1, 2)],
      regions: [],
    };
    // The turn at the tip is sharper than a right angle, so the arc takes two cubics rather than one.
    expect(networkStrokePath(tip).filter((c) => c.op === 'C')).toHaveLength(2);
    const bounds = networkBounds(tip)!;
    expect(bounds.x).toBe(0);
    // A sharp turn pulls back further than the radius: the arc's far side is 10 past a center 22.36 in.
    expect(bounds.width).toBeCloseTo(87.64, 1);
    // Without the radius the box reaches the sharp tip.
    expect(networkBounds({ ...tip, vertices: tip.vertices.map(({ cornerRadius: _r, ...v }) => v) })!.width).toBe(100);
  });

  test('the arc geometry itself: tangent points, center and sweep', () => {
    const corner = cornerArc({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, 20)!;
    expect(corner.from.x).toBeCloseTo(80);
    expect(corner.from.y).toBeCloseTo(0);
    expect(corner.to.x).toBeCloseTo(100);
    expect(corner.to.y).toBeCloseTo(20);
    expect(corner.center.x).toBeCloseTo(80);
    expect(corner.center.y).toBeCloseTo(20);
    expect(corner.radius).toBe(20);
    expect(Math.abs(corner.sweep)).toBeCloseTo(Math.PI / 2);

    // No radius, a zero-length edge, or a straight run through the point: nothing to round.
    expect(cornerArc({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, 0)).toBeNull();
    expect(cornerArc({ x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, 20)).toBeNull();
    expect(cornerArc({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, 20)).toBeNull();
  });
});
