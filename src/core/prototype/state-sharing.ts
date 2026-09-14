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
import type { SceneNode } from '../schema/document';
import { namesShareState } from './scroll';
import { matchLayers } from './smart-animate';
import { videoFillsOf } from './video';

/** Whether navigating from one top-level frame to another shares states: they sit together and their names match. */
function framesShareState(store: DocumentStore, fromFrame: Id, toFrame: Id): boolean {
  const from = store.get(fromFrame) as SceneNode | undefined;
  const to = store.get(toFrame) as SceneNode | undefined;
  return from !== undefined && to !== undefined && fromFrame !== toFrame && store.parentOf(fromFrame) === store.parentOf(toFrame) && namesShareState(from.name, to.name);
}

/**
 * State sharing for interactive components: navigating between frames that share states, the destination's instances
 * take the variants their matching instances in the frame left switched to (`changes`, by instance) — only once those
 * have been interacted with, and only variants of their own component set. The variants to set, by instance.
 */
export function sharedVariants(store: DocumentStore, fromFrame: Id, toFrame: Id, changes: ReadonlyMap<Id, Id>): Map<Id, Id> {
  const out = new Map<Id, Id>();
  if (changes.size === 0 || !framesShareState(store, fromFrame, toFrame)) return out;
  for (const [destination, source] of matchLayers(store, fromFrame, toFrame)) {
    const variant = changes.get(source);
    const node = store.get(destination) as SceneNode | undefined;
    if (variant === undefined || node?.type !== 'FRAME' || !node.instance) continue;
    if (store.parentOf(node.instance.mainId) === store.parentOf(variant)) out.set(destination, variant);
  }
  return out;
}

/**
 * State sharing for videos: navigating between frames that share states, a matching layer's video in the destination
 * takes the play state and time of the one left. Layers showing the same video already share it, so these are the
 * pairs of different videos (by video hash).
 */
export function sharedVideos(store: DocumentStore, fromFrame: Id, toFrame: Id): { readonly from: string; readonly to: string }[] {
  if (!framesShareState(store, fromFrame, toFrame)) return [];
  const out: { from: string; to: string }[] = [];
  for (const [destination, source] of matchLayers(store, fromFrame, toFrame)) {
    const to = videoFillsOf(store.get(destination) as SceneNode | undefined)[0];
    const from = videoFillsOf(store.get(source) as SceneNode | undefined)[0];
    if (to && from && to.paint.videoHash !== from.paint.videoHash) out.push({ from: from.paint.videoHash, to: to.paint.videoHash });
  }
  return out;
}
