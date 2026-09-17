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
import type { AnimationTrack, PageAnimation } from '../schema/document';

/** Every layer under a node, the node itself last, so a walk covers the whole of it. */
function descendants(store: DocumentStore, id: Id, out: Id[] = []): Id[] {
  for (const child of store.children(id)) descendants(store, child, out);
  out.push(id);
  return out;
}

/** Where an instance's animation starts, in milliseconds: how far along the timeline it has been dragged. */
export function instanceOffset(store: DocumentStore, instanceId: Id): number {
  const node = store.get(instanceId);
  return node && 'animationOffset' in node ? (node.animationOffset ?? 0) : 0;
}

/** The main component an instance mirrors, if it is an instance at all. */
export function mainOf(store: DocumentStore, instanceId: Id): Id | undefined {
  const node = store.get(instanceId);
  return node?.type === 'FRAME' ? node.instance?.mainId : undefined;
}

/**
 * The tracks an instance runs: the ones its main component's layers carry, mapped onto the instance's own layers
 * through the `source` each of them keeps, and shifted by how far the instance has been dragged along the timeline.
 * An instance whose component animates nothing runs nothing.
 */
export function instanceTracks(store: DocumentStore, animation: PageAnimation | undefined, instanceId: Id): AnimationTrack[] {
  const mainId = mainOf(store, instanceId);
  if (!animation || !mainId) return [];
  const inMain = new Set(descendants(store, mainId));
  // Which of the instance's own layers stands for each layer of the component.
  const mirrors = new Map<Id, Id>();
  for (const id of descendants(store, instanceId)) {
    const node = store.get(id);
    const source = node && 'source' in node ? node.source : undefined;
    if (source !== undefined) mirrors.set(source, id);
  }
  mirrors.set(mainId, instanceId);

  const offset = instanceOffset(store, instanceId);
  const tracks: AnimationTrack[] = [];
  for (const track of animation.tracks) {
    const mirror = inMain.has(track.nodeId) ? mirrors.get(track.nodeId) : undefined;
    if (mirror === undefined) continue;
    tracks.push({ ...track, nodeId: mirror, keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, time: Math.max(0, keyframe.time + offset) })) });
  }
  return tracks;
}

/** Every instance on a page whose main component animates, in the order the page holds them. */
export function animatedInstances(store: DocumentStore, animation: PageAnimation | undefined, pageId: Id): Id[] {
  if (!animation) return [];
  const animated = new Set(animation.tracks.map((track) => track.nodeId));
  return descendants(store, pageId)
    .filter((id) => {
      const mainId = mainOf(store, id);
      return mainId !== undefined && descendants(store, mainId).some((child) => animated.has(child));
    })
    .reverse();
}

/** An animation with every animated instance's own tracks added to it, which is what the canvas is shown from. */
export function withInstances(store: DocumentStore, animation: PageAnimation | undefined, pageId: Id): PageAnimation | undefined {
  const instances = animatedInstances(store, animation, pageId);
  if (!animation || instances.length === 0) return animation;
  return { ...animation, tracks: [...animation.tracks, ...instances.flatMap((id) => instanceTracks(store, animation, id))] };
}
