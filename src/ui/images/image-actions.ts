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

import type { PlaceableImage } from '@/editor/commands/images';
import type { Editor } from '@/editor/editor';
import { imageLayerName, readImageFile } from './import-image';
import { isVideoFile, readVideoFile } from './import-video';

export interface ImportResult {
  readonly images: PlaceableImage[];
  /** One message per file that could not be imported. */
  readonly errors: string[];
}

/**
 * Reads, stores and registers image and video files (a video with its poster, placed at the video's size); files that
 * fail are reported, the rest still import.
 */
export async function importImageFiles(editor: Editor, files: readonly File[]): Promise<ImportResult> {
  const images: PlaceableImage[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      if (isVideoFile(file)) {
        const { video, poster } = await readVideoFile(file);
        await editor.images.add(poster);
        await editor.images.add(video);
        images.push({ hash: poster.hash, width: video.width, height: video.height, name: imageLayerName(file.name), videoHash: video.hash });
        continue;
      }
      const asset = await readImageFile(file);
      await editor.images.add(asset);
      images.push({ hash: asset.hash, width: asset.width, height: asset.height, name: imageLayerName(file.name) });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${file.name} could not be imported.`);
    }
  }
  return { images, errors };
}

/** Opens the system file picker for images; resolves with the chosen files (empty when canceled). */
export function pickImageFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.hidden = true;
    const done = () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    };
    input.addEventListener('change', done, { once: true });
    input.addEventListener('cancel', done, { once: true });
    document.body.append(input);
    input.click();
  });
}
