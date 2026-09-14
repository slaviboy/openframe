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
import type { SceneNode, VideoPaint } from '../schema/document';

/** A video fill of a layer. */
export interface VideoFill {
  readonly nodeId: Id;
  /** The fill's index in the layer's fills. */
  readonly index: number;
  readonly paint: VideoPaint;
}

/** How a video plays in presentation view. */
export interface VideoOptions {
  /** Plays when its frame shows. */
  readonly autoplay: boolean;
  /** Starts over when it ends. */
  readonly loop: boolean;
  /** Plays without sound. */
  readonly muted: boolean;
}

/** A video fill's options: autoplay unless turned off, no loop and sound unless turned on and off. */
export const videoOptionsOf = (paint: VideoPaint): VideoOptions => ({ autoplay: paint.autoplay ?? true, loop: paint.loop ?? false, muted: paint.muted ?? false });

/** The visible video fills of a layer. */
export function videoFillsOf(node: SceneNode | undefined): VideoFill[] {
  if (!node || !('fills' in node)) return [];
  const out: VideoFill[] = [];
  node.fills.forEach((paint, index) => {
    if (paint.type === 'VIDEO' && paint.visible) out.push({ nodeId: node.id, index, paint });
  });
  return out;
}

/** The visible video fills in a frame and the visible layers in it, in layer order. */
export function videoFillsIn(store: DocumentStore, frameId: Id): VideoFill[] {
  const out: VideoFill[] = [];
  const visit = (id: Id) => {
    const node = store.get(id);
    if (!node || !('transform' in node) || !node.visible) return;
    out.push(...videoFillsOf(node));
    store.children(id).forEach(visit);
  };
  visit(frameId);
  return out;
}
