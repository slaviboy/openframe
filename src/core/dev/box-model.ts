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

import type { DocumentStore } from '../document/store';
import { resolveCornerRadii } from '../geometry/corners';
import { isSceneNode, type CornerRadii, type SceneNode } from '../schema/document';
import type { SceneIndex } from '../scene/scene-index';

/** A value per edge. `null` means the layer has none to show there, which the panel draws as a dash. */
export interface Sides {
  readonly top: number | null;
  readonly right: number | null;
  readonly bottom: number | null;
  readonly left: number | null;
}

/** What the box-model diagram draws: a layer's own size, and everything ringed around it. */
export interface BoxModelReading {
  readonly width: number;
  readonly height: number;
  /** Per-corner radius, or null for a layer whose type cannot round its corners. */
  readonly radii: CornerRadii | null;
  /** Stroke weight per side, where the layer has a visible stroke. */
  readonly border: Sides;
  /** Padding per side; all null unless the layer lays its children out. */
  readonly padding: Sides;
  /** Distance from each of the layer's edges to the same edge of what contains it. */
  readonly distance: Sides;
}

const NONE: Sides = { top: null, right: null, bottom: null, left: null };

/** A layer's stroke weight per side, or nothing when it draws no stroke. */
function borderOf(node: SceneNode): Sides {
  if (!('strokes' in node) || !node.strokes.some((paint) => paint.visible && paint.opacity > 0)) return NONE;
  const individual = 'individualStrokeWeights' in node ? node.individualStrokeWeights : undefined;
  if (individual) return individual;
  const weight = 'strokeWeight' in node ? node.strokeWeight : 0;
  return weight > 0 ? { top: weight, right: weight, bottom: weight, left: weight } : NONE;
}

/** A frame's padding, which only a frame laying its children out has. */
function paddingOf(node: SceneNode): Sides {
  if (node.type !== 'FRAME' || !node.layoutMode) return NONE;
  return { top: node.paddingTop ?? 0, right: node.paddingRight ?? 0, bottom: node.paddingBottom ?? 0, left: node.paddingLeft ?? 0 };
}

/**
 * How far each of the layer's edges sits from the same edge of what holds it. The container is the
 * parent when the parent is a layer; on a page it is everything else the page holds, taken together,
 * which is the only reading of the reference's numbers that makes sense of their size.
 *
 * This one is a guess rather than a measurement: the reference's 1293 / 3287 / 3516 for a 375-wide
 * frame answer to no container that can be identified from the capture. See docs/UI_REFERENCE.md.
 */
function distanceOf(store: DocumentStore, index: SceneIndex, node: SceneNode): Sides {
  const own = index.worldBounds(node.id);
  if (!own) return NONE;
  const parent = store.get(node.parent.id);
  let container = parent && isSceneNode(parent) ? index.worldBounds(parent.id) : null;
  if (!container) {
    // On a page, the layer is measured against everything else the page holds.
    const others = store
      .children(node.parent.id)
      .filter((id) => id !== node.id)
      .map((id) => index.worldBounds(id))
      .filter((rect): rect is NonNullable<typeof rect> => rect !== null);
    if (others.length === 0) return NONE;
    const left = Math.min(...others.map((r) => r.x));
    const top = Math.min(...others.map((r) => r.y));
    container = {
      x: left,
      y: top,
      width: Math.max(...others.map((r) => r.x + r.width)) - left,
      height: Math.max(...others.map((r) => r.y + r.height)) - top,
    };
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    top: round(own.y - container.y),
    left: round(own.x - container.x),
    right: round(container.x + container.width - (own.x + own.width)),
    bottom: round(container.y + container.height - (own.y + own.height)),
  };
}

/** Everything the box-model diagram needs about one layer. */
export function boxModelOf(store: DocumentStore, index: SceneIndex, node: SceneNode): BoxModelReading {
  return {
    width: node.size.width,
    height: node.size.height,
    // A layer keeps its own size whichever way it is turned, so this is the local one, not the bounds.
    radii: 'cornerRadius' in node && typeof node.cornerRadius === 'number' ? resolveCornerRadii({ cornerRadius: node.cornerRadius, cornerRadii: 'cornerRadii' in node ? node.cornerRadii : undefined }) : null,
    border: borderOf(node),
    padding: paddingOf(node),
    distance: distanceOf(store, index, node),
  };
}
