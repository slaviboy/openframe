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
import type { Id } from '../ids/ids';
import type { Rect } from '../math/rect';
import type { Vec2 } from '../math/vec';
import type { SceneNode } from '../schema/document';
import { topLevelFrame } from './reactions';

/** A prototype connection: an action of an interaction on a hotspot that leads to another layer. */
export interface Connection {
  readonly sourceId: Id;
  readonly reactionIndex: number;
  readonly actionIndex: number;
  readonly destinationId: Id;
  /** Scroll to stays in its frame; the other actions lead to another frame. */
  readonly scroll: boolean;
}

/** Every connection starting on the page, in layer order. Destinations that no longer exist are left out. */
export function connectionsOnPage(store: DocumentStore, pageId: Id): Connection[] {
  const out: Connection[] = [];
  const visit = (id: Id) => {
    const node = store.get(id);
    if (node && 'transform' in node) {
      (node as SceneNode).reactions?.forEach((reaction, reactionIndex) =>
        reaction.actions.forEach((action, actionIndex) => {
          if (action.type !== 'NODE' || !action.destinationId || !store.has(action.destinationId)) return;
          out.push({ sourceId: id, reactionIndex, actionIndex, destinationId: action.destinationId, scroll: action.navigation === 'SCROLL_TO' });
        }),
      );
    }
    store.children(id).forEach(visit);
  };
  visit(pageId);
  return out;
}

/**
 * The connections the canvas shows: those starting in the selected layers (or in the top-level frames they are in),
 * or with nothing selected, every connection on the page.
 */
export function visibleConnections(store: DocumentStore, pageId: Id, selection: readonly Id[]): Connection[] {
  const all = connectionsOnPage(store, pageId);
  if (selection.length === 0) return all;
  const frames = new Set(selection.map((id) => topLevelFrame(store, id)).filter((id): id is Id => id !== null));
  const selected = new Set(selection);
  return all.filter((connection) => selected.has(connection.sourceId) || frames.has(topLevelFrame(store, connection.sourceId) ?? ''));
}

/** A noodle: a cubic curve from the hotspot to the destination, ending in an arrow. */
export interface Noodle {
  readonly start: Vec2;
  readonly c1: Vec2;
  readonly c2: Vec2;
  readonly end: Vec2;
  /** The side of the destination the curve arrives at; the arrow points into it. */
  readonly side: 'left' | 'right' | 'top' | 'bottom';
}

const center = (r: Rect): Vec2 => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/**
 * The noodle between a hotspot and a destination (screen rectangles): it leaves the hotspot's side facing the
 * destination and arrives at the destination's facing side, bending smoothly between them. A destination inside the
 * hotspot's frame (Scroll to) is reached at its left side from the hotspot's right.
 */
export function noodleBetween(source: Rect, destination: Rect): Noodle {
  const a = center(source);
  const b = center(destination);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const right = dx >= 0;
    const start = { x: right ? source.x + source.width : source.x, y: a.y };
    const end = { x: right ? destination.x : destination.x + destination.width, y: b.y };
    const bend = Math.max(40, Math.abs(end.x - start.x) / 2);
    return { start, c1: { x: start.x + (right ? bend : -bend), y: start.y }, c2: { x: end.x - (right ? bend : -bend), y: end.y }, end, side: right ? 'left' : 'right' };
  }
  const down = dy >= 0;
  const start = { x: a.x, y: down ? source.y + source.height : source.y };
  const end = { x: b.x, y: down ? destination.y : destination.y + destination.height };
  const bend = Math.max(40, Math.abs(end.y - start.y) / 2);
  return { start, c1: { x: start.x, y: start.y + (down ? bend : -bend) }, c2: { x: end.x, y: end.y - (down ? bend : -bend) }, end, side: down ? 'top' : 'bottom' };
}

/** A point on a noodle at t ∈ [0, 1]. */
export function noodlePoint(noodle: Noodle, t: number): Vec2 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * noodle.start.x + w1 * noodle.c1.x + w2 * noodle.c2.x + w3 * noodle.end.x,
    y: w0 * noodle.start.y + w1 * noodle.c1.y + w2 * noodle.c2.y + w3 * noodle.end.y,
  };
}

/** How far a point is from a noodle (sampled along the curve). */
export function distanceToNoodle(noodle: Noodle, point: Vec2, samples = 32): number {
  let best = Infinity;
  for (let i = 0; i <= samples; i++) {
    const p = noodlePoint(noodle, i / samples);
    best = Math.min(best, Math.hypot(p.x - point.x, p.y - point.y));
  }
  return best;
}
