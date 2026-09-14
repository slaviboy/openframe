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

import { rectangleCorners, resolveCornerRadii, roundedPolygon, type PathCommand } from '../geometry/corners';
import { arcCommands } from '../geometry/arc';
import { polygonPoints, starPoints } from '../geometry/shapes';
import type { Vec2 } from '../math/vec';
import type { SceneNode } from '../schema/document';
import { straightSegment, type VectorNetwork, type VectorRegion, type VectorSegment, type VectorVertex } from './vector-network';

/** The Bézier constant for approximating a quarter circle with one cubic. */
const KAPPA = 0.5522847498307936;

/** A closed polygon through the points. */
export function polygonCommands(points: readonly Vec2[]): PathCommand[] {
  if (points.length === 0) return [];
  return [{ op: 'M', x: points[0]!.x, y: points[0]!.y }, ...points.slice(1).map((p): PathCommand => ({ op: 'L', x: p.x, y: p.y })), { op: 'Z' }];
}

/** An ellipse filling a `width` × `height` box as four cubic arcs, starting at its right-hand point. */
export function ellipseCommands(width: number, height: number): PathCommand[] {
  const rx = width / 2;
  const ry = height / 2;
  const [cx, cy] = [rx, ry];
  const arc = (x1: number, y1: number, x2: number, y2: number, x: number, y: number): PathCommand => ({ op: 'C', x1, y1, x2, y2, x, y });
  return [
    { op: 'M', x: cx + rx, y: cy },
    arc(cx + rx, cy + KAPPA * ry, cx + KAPPA * rx, cy + ry, cx, cy + ry),
    arc(cx - KAPPA * rx, cy + ry, cx - rx, cy + KAPPA * ry, cx - rx, cy),
    arc(cx - rx, cy - KAPPA * ry, cx - KAPPA * rx, cy - ry, cx, cy - ry),
    arc(cx + KAPPA * rx, cy - ry, cx + rx, cy - KAPPA * ry, cx + rx, cy),
    { op: 'Z' },
  ];
}

/**
 * Path commands as a vector network: each subpath becomes a chain of segments; a closed subpath
 * (its final point merged with its start) becomes a fillable region.
 */
export function commandsToNetwork(commands: readonly PathCommand[]): VectorNetwork {
  const vertices: VectorVertex[] = [];
  const segments: VectorSegment[] = [];
  const regions: VectorRegion[] = [];
  let start = -1;
  let current = -1;
  let loop: number[] = [];
  const addVertex = (x: number, y: number) => vertices.push({ x, y }) - 1;
  for (const c of commands) {
    if (c.op === 'M') {
      start = current = addVertex(c.x, c.y);
      loop = [];
    } else if (c.op === 'L') {
      const v = addVertex(c.x, c.y);
      loop.push(segments.push(straightSegment(current, v)) - 1);
      current = v;
    } else if (c.op === 'C') {
      const from = vertices[current]!;
      const v = addVertex(c.x, c.y);
      loop.push(segments.push({ start: current, end: v, tangentStart: { x: c.x1 - from.x, y: c.y1 - from.y }, tangentEnd: { x: c.x2 - c.x, y: c.y2 - c.y } }) - 1);
      current = v;
    } else if (start !== -1) {
      const last = vertices[current]!;
      const first = vertices[start]!;
      if (current !== start && loop.length > 0 && Math.hypot(last.x - first.x, last.y - first.y) < 1e-9) {
        // The subpath ends on its start point: join the last segment to the start.
        const index = loop[loop.length - 1]!;
        segments[index] = { ...segments[index]!, end: start };
        vertices.pop();
      } else if (current !== start) {
        loop.push(segments.push(straightSegment(current, start)) - 1);
      }
      if (loop.length > 0) regions.push({ loops: [loop], windingRule: 'NONZERO' });
      current = start;
      loop = [];
    }
  }
  return { vertices, segments, regions };
}

/** A layer's outline as a vector network (Flatten); null for layers without an outline. */
export function shapeNetwork(node: SceneNode): VectorNetwork | null {
  const { width: w, height: h } = node.size;
  switch (node.type) {
    case 'VECTOR':
      return node.vectorNetwork;
    case 'LINE':
      return { vertices: [{ x: 0, y: 0 }, { x: w, y: 0 }], segments: [straightSegment(0, 1)], regions: [] };
    case 'ELLIPSE':
      return commandsToNetwork(node.arcData ? arcCommands(w, h, node.arcData) : ellipseCommands(w, h));
    case 'FRAME':
    case 'RECTANGLE': {
      const radii = resolveCornerRadii(node);
      if (Math.max(radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft) <= 0) {
        return commandsToNetwork(polygonCommands([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]));
      }
      const corners = rectangleCorners(w, h, radii);
      return commandsToNetwork(roundedPolygon(corners.points, corners.radii, node.cornerSmoothing ?? 0));
    }
    case 'POLYGON':
    case 'STAR': {
      const points = node.type === 'POLYGON' ? polygonPoints(w, h, node.pointCount) : starPoints(w, h, node.pointCount, node.innerRadius);
      const radius = node.cornerRadius ?? 0;
      return commandsToNetwork(radius > 0 ? roundedPolygon(points, points.map(() => radius), node.cornerSmoothing ?? 0) : polygonCommands(points));
    }
    default:
      return null;
  }
}
