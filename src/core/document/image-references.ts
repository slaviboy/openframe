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

import type { Paint } from '../schema/document';
import type { DocumentStore } from './store';

/**
 * The content hashes of the images a document uses, sorted and without repeats: image paints in layers' fills and
 * strokes, in vector regions' fills, in text ranges' fills, and in color styles. Video paints use their video and its
 * poster image.
 */
export function usedImageHashes(store: DocumentStore): string[] {
  const hashes = new Set<string>();
  const add = (paints: readonly Paint[] | undefined) => {
    for (const paint of paints ?? []) {
      if ((paint.type === 'IMAGE' || paint.type === 'VIDEO') && paint.imageHash) hashes.add(paint.imageHash);
      if (paint.type === 'VIDEO') hashes.add(paint.videoHash);
    }
  };
  for (const node of store.nodes()) {
    const fields = node as unknown as Record<string, readonly Paint[] | undefined>;
    add(fields.fills);
    add(fields.strokes);
    add(fields.paints);
    if (node.type === 'VECTOR') for (const region of node.vectorNetwork.regions) add(region.fills);
    if (node.type === 'TEXT') for (const run of node.styleRuns ?? []) add(run.style.fills);
  }
  return [...hashes].sort();
}
