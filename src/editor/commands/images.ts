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

import { keyOnTop, makeRectangle } from '@/core/document/factory';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { imagePaintFor, videoPaintFor, withImage, type ImageRef } from '@/core/image/image-paint';
import type { Vec2 } from '@/core/math/vec';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { containerAt, parentToLocal, roundPoint } from '../tools/draw-helpers';

/** An imported image ready to become a layer, named after its file. */
export interface PlaceableImage extends ImageRef {
  readonly name: string;
  /** A video: the hash of its bytes (`hash` is then its poster image). */
  readonly videoHash?: string | undefined;
}

/** The fill for an imported image or video. */
const mediaPaintFor = (image: ImageRef & { readonly videoHash?: string | undefined }) => (image.videoHash ? videoPaintFor(image, image.videoHash) : imagePaintFor(image));

/** Gap between images placed together. */
export const PLACE_ALL_GAP = 20;

/** Layer types whose fill a placed image can replace. */
export const IMAGE_FILLABLE: ReadonlySet<SceneNode['type']> = new Set(['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR']);

/**
 * Creates a rectangle for each image at the image's pixel size, filled with it. The images sit
 * in a row 20px apart, centered on `world`, each inside the frame under its center. One undo
 * step; the new layers are selected.
 */
export function placeImages(editor: Editor, images: readonly PlaceableImage[], world: Vec2): Id[] {
  if (images.length === 0) return [];
  editor.scene.ensure(editor.pageId);
  const total = images.reduce((sum, image) => sum + image.width, 0) + PLACE_ALL_GAP * (images.length - 1);
  let x = world.x - total / 2;
  const ids: Id[] = [];
  editor.history.run(images.length === 1 ? 'Place image' : 'Place images', (tx) => {
    for (const image of images) {
      const parent = containerAt(editor, { x: x + image.width / 2, y: world.y });
      const origin = roundPoint(parentToLocal(editor, parent)({ x, y: world.y - image.height / 2 }));
      const id = editor.ids.next();
      const rect = makeRectangle({
        id,
        parent: { id: parent, key: keyOnTop(tx.store, parent) },
        name: image.name,
        x: origin.x,
        y: origin.y,
        width: image.width,
        height: image.height,
      });
      tx.create({ ...rect, fills: [mediaPaintFor(image)] });
      ids.push(id);
      x += image.width + PLACE_ALL_GAP;
    }
  });
  editor.state.select(ids);
  return ids;
}

/**
 * Puts an image (or video) into a shape's top fill (replacing the image of an image fill, or the fill itself); adds a
 * fill when there is none.
 */
export function fillWithImage(tx: Transaction, node: SceneNode, image: ImageRef & { readonly videoHash?: string | undefined }): void {
  if (!IMAGE_FILLABLE.has(node.type)) return;
  const current = tx.store.getOrThrow(node.id) as Extract<SceneNode, { type: 'RECTANGLE' | 'ELLIPSE' | 'POLYGON' | 'STAR' }>;
  const top = current.fills.at(-1);
  const paint = !image.videoHash && top?.type === 'IMAGE' ? withImage(top, image) : mediaPaintFor(image);
  tx.set(node.id, 'fills', top ? [...current.fills.slice(0, -1), paint] : [paint]);
}
