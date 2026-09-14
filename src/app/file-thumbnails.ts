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

import { documentColorProfile } from '@/core/color/color-profile';
import { thumbnailSource } from '@/core/document/file-thumbnail';
import type { Editor } from '@/editor/editor';
import type { LocalPersistence } from '@/platform/idb/persistence';

/** The size of stored file thumbnails (16:9), in pixels. */
export const FILE_THUMBNAIL_WIDTH = 480;
export const FILE_THUMBNAIL_HEIGHT = 270;

export interface ThumbnailUpdater {
  /** Renders and stores the thumbnail a moment from now (repeated calls in the meantime do it once). */
  schedule(): void;
  /** Renders and stores the thumbnail now; resolves once it is stored (or couldn't be). */
  now(): Promise<void>;
  dispose(): void;
}

/**
 * Keeps a local file's thumbnail up to date: the frame set as its thumbnail, or its first page, rendered by the engine
 * (once it is ready) and stored with the file for the file browser.
 */
export function createThumbnailUpdater(editor: Editor, persistence: LocalPersistence, fileId: string, delayMs = 2000): ThumbnailUpdater {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const render = async () => {
    const engine = editor.thumbnails;
    const source = thumbnailSource(editor.doc);
    if (!engine || !source) return;
    const bytes = engine.fileThumbnail(editor.doc, editor.scene, source, FILE_THUMBNAIL_WIDTH, FILE_THUMBNAIL_HEIGHT, documentColorProfile(editor.doc));
    if (bytes) await persistence.setThumbnail(fileId, bytes).catch(() => undefined);
  };
  return {
    schedule() {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        void render();
      }, delayMs);
    },
    now() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      return render();
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
