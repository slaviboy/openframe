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

import { flattenPath, type PathCommand } from '../geometry/corners';
import { pointInPolygon } from '../geometry/shapes';
import type { Vec2 } from '../math/vec';
import type { ShapeFace } from './geometry-service';
import { regionFillPath, type VectorNetwork } from './vector-network';

/** Splits path commands into the contours they draw, each starting at its own move. */
export function contoursOf(commands: readonly PathCommand[]): PathCommand[][] {
  const out: PathCommand[][] = [];
  let current: PathCommand[] = [];
  for (const command of commands) {
    if (command.op === 'M' && current.length > 0) {
      out.push(current);
      current = [];
    }
    if (command.op === 'Z') {
      if (current.length > 0) out.push(current);
      current = [];
      continue;
    }
    current.push(command);
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Whether a point lies inside an area drawn by path commands. A contour containing the point turns it inside out,
 * so a shape with a hole in it counts the hole as outside — which is how the pieces the Shape builder works with
 * are drawn, their contours never overlapping.
 */
export function pointInCommands(commands: readonly PathCommand[], point: Vec2): boolean {
  let inside = false;
  for (const contour of contoursOf(commands)) {
    const polygon = flattenPath(contour, 12);
    if (polygon.length >= 3 && pointInPolygon(point, polygon)) inside = !inside;
  }
  return inside;
}

/** The piece under a point: the last one drawn that covers it, since later pieces are drawn over earlier ones. */
export function faceAt(faces: readonly ShapeFace[], point: Vec2): number | null {
  for (let i = faces.length - 1; i >= 0; i--) if (pointInCommands(faces[i]!.commands, point)) return i;
  return null;
}

/** The closed regions of a network, each as its own area, which are the shapes the pieces are cut from. */
export function regionShapes(network: VectorNetwork): PathCommand[][] {
  return network.regions.map((region) => regionFillPath(network, region));
}
