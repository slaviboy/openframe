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

import { hitTestDeepest } from '@/core/scene/hit-test';
import { isSceneNode } from '@/core/schema/document';
import { fillWithImage, IMAGE_FILLABLE, placeImages, type PlaceableImage } from '../commands/images';
import type { CursorKind, PointerInfo, Tool, ToolEnvironment } from './types';

/**
 * Place image (⇧⌘K): holds imported images and places one per click. Clicking a rectangle,
 * ellipse, polygon or star puts the image in its fill; clicking anywhere else creates a layer at
 * the image's size centered on the click. After the last image, the Move tool returns.
 * Escape discards the remaining images.
 */
export class ImagePlaceTool implements Tool {
  readonly id = 'image' as const;
  readonly active = false;
  private queue: PlaceableImage[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly env: ToolEnvironment) {}

  /** Images still waiting to be placed, next first. */
  get pending(): readonly PlaceableImage[] {
    return this.queue;
  }

  /** Replaces the waiting images. */
  load(images: readonly PlaceableImage[]): void {
    this.queue = [...images];
    this.notify();
  }

  /** Drops the waiting images without changing tools. */
  discard(): void {
    if (this.queue.length === 0) return;
    this.queue = [];
    this.notify();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  cursor(): CursorKind {
    return 'crosshair';
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    const image = this.queue[0];
    if (!image) {
      editor.state.setTool('move');
      return;
    }
    const tolerance = this.env.hitTolerancePx / editor.state.viewport.zoom;
    const hit = hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, { tolerance });
    const node = hit ? editor.doc.get(hit) : undefined;
    if (node && isSceneNode(node) && IMAGE_FILLABLE.has(node.type)) {
      editor.history.run('Fill with image', (tx) => fillWithImage(tx, node, image));
      editor.state.select([node.id]);
    } else {
      placeImages(editor, [image], p.world);
    }
    this.queue = this.queue.slice(1);
    this.notify();
    if (this.queue.length === 0) editor.state.setTool('move');
  }

  pointerMove(): void {}

  pointerUp(): void {}

  cancel(): boolean {
    if (this.queue.length === 0) return false;
    this.discard();
    this.env.editor.state.setTool('move');
    return true;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
