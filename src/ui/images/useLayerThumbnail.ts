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

import { useMemo } from 'react';
import { documentColorProfile } from '@/core/color/color-profile';
import type { Id } from '@/core/ids/ids';
import { useDocumentRevision, useEditor, useEditorState } from '../hooks/useEditor';

/** Base64 of binary data, in chunks so large images don't overflow the argument list. */
export function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * A layer as the rendering engine draws it now, at most `size` CSS pixels on each side: the preview of a component in
 * the Assets grid, and of a layer in Draw mode's Layers list. Null until the engine and the text layout are ready.
 */
export function useLayerThumbnail(pageId: Id, id: Id, size: number): string | null {
  const editor = useEditor();
  const revision = useDocumentRevision();
  const ready = useEditorState((s) => s.textLayoutReady);
  return useMemo(() => {
    const bytes = ready ? editor.thumbnails?.thumbnail(editor.doc, editor.scene, pageId, id, size, window.devicePixelRatio || 1, documentColorProfile(editor.doc)) : null;
    return bytes ? `data:image/png;base64,${base64(bytes)}` : null;
    // The document changes in place, so its revision is what says the thumbnail must be drawn again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pageId, id, size, revision, ready]);
}
