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

import { pointInPolygon } from '../geometry/shapes';
import type { Vec2 } from '../math/vec';
import type { Paint } from '../schema/document';
import { regionOutlines, type VectorNetwork } from './vector-network';

/**
 * The topmost region containing a point (later regions draw above earlier ones), or null. A point
 * inside an odd number of a region's loops is inside it, so the hole of a ring doesn't count.
 */
export function regionAt(network: VectorNetwork, p: Vec2): number | null {
  const outlines = regionOutlines(network);
  for (let i = outlines.length - 1; i >= 0; i--) {
    if (outlines[i]!.filter((polygon) => pointInPolygon(p, polygon)).length % 2 === 1) return i;
  }
  return null;
}

/** The network with one region's own fills set; `undefined` gives the region back the layer's fills. */
export function setRegionFills(network: VectorNetwork, index: number, fills: readonly Paint[] | undefined): VectorNetwork {
  return {
    ...network,
    regions: network.regions.map((region, i) =>
      i !== index ? region : fills === undefined ? { loops: region.loops, windingRule: region.windingRule } : { ...region, fills: [...fills] },
    ),
  };
}
