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

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useEditor } from '../hooks/useEditor';

/** Object URLs by image hash; images are immutable, so a URL stays valid for the session. */
const urls = new Map<string, string>();

/** A displayable URL for an image asset (loading it from storage if needed), or undefined until available. */
export function useImageUrl(hash: string | undefined): string | undefined {
  const editor = useEditor();
  const subscribe = useCallback((onChange: () => void) => editor.images.subscribe(onChange), [editor]);
  const asset = useSyncExternalStore(subscribe, () => (hash ? editor.images.get(hash) : undefined));
  useEffect(() => {
    if (hash && !asset) editor.images.request(hash);
  }, [hash, asset, editor]);
  if (!asset) return undefined;
  let url = urls.get(asset.hash);
  if (!url) {
    url = URL.createObjectURL(new Blob([asset.bytes as Uint8Array<ArrayBuffer>], { type: asset.mime }));
    urls.set(asset.hash, url);
  }
  return url;
}

/** The format of an image asset (such as image/gif), loading it from storage if needed; undefined until available. */
export function useImageMime(hash: string | undefined): string | undefined {
  const editor = useEditor();
  const subscribe = useCallback((onChange: () => void) => editor.images.subscribe(onChange), [editor]);
  const asset = useSyncExternalStore(subscribe, () => (hash ? editor.images.get(hash) : undefined));
  useEffect(() => {
    if (hash && !asset) editor.images.request(hash);
  }, [hash, asset, editor]);
  return asset?.mime;
}
