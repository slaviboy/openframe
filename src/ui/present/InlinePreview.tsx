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

import { useCallback, useMemo, useRef, useState } from 'react';
import { presentFile, type PresentationSession } from '@/app/present';
import { topLevelFrame } from '@/core/prototype/reactions';
import { useSession } from '../hooks/useEditor';
import styles from './InlinePreview.module.css';
import { PresentationView } from './PresentationView';

const MIN_SIZE = { width: 240, height: 200 };

/**
 * Inline preview (⇧Space): the prototype playing in a window over the canvas, next to the design. It starts at the
 * selected frame (or the page's first flow), follows edits, and resizes from its bottom-left corner.
 */
export function InlinePreview() {
  const app = useSession();
  const { editor } = app;
  const [size, setSize] = useState({ width: 360, height: 520 });
  const drag = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  // Respect aspect ratio: the window keeps the current frame's proportions (presentation view sizes it).
  const [respectAspectRatio, setRespectAspectRatio] = useState(false);
  const resizeWindow = useCallback((next: { width: number; height: number }) => setSize({ width: Math.max(MIN_SIZE.width, Math.round(next.width)), height: Math.max(MIN_SIZE.height, Math.round(next.height)) }), []);
  const [startNodeId] = useState(() => {
    const selected = editor.selection[0];
    return selected ? topLevelFrame(editor.doc, selected) : null;
  });
  const session = useMemo<PresentationSession>(() => ({ editor, fileName: app.session.getSnapshot().file.name, dispose: () => undefined }), [app, editor]);
  const inline = useMemo(
    () => ({
      onClose: () => editor.state.setInlinePreviewOpen(false),
      onOpenPresentation: (frameId: string | null) => presentFile(app, frameId),
      windowSize: size,
      onResizeWindow: resizeWindow,
      respectAspectRatio,
      onRespectAspectRatio: setRespectAspectRatio,
    }),
    [app, editor, size, resizeWindow, respectAspectRatio],
  );

  return (
    <div className={styles.window} style={{ width: size.width, height: size.height }}>
      <PresentationView session={session} startNodeId={startNodeId} inline={inline} />
      <div
        className={styles.resize}
        role="separator"
        aria-label="Resize preview"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height };
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start) return;
          // The window sits at the right: dragging its bottom-left corner left makes it wider.
          const next = { width: Math.max(MIN_SIZE.width, start.width - (e.clientX - start.x)), height: Math.max(MIN_SIZE.height, start.height + (e.clientY - start.y)) };
          // ⇧ keeps the proportions.
          if (e.shiftKey) next.height = Math.max(MIN_SIZE.height, (next.width * start.height) / start.width);
          setSize(next);
        }}
        onPointerUp={() => (drag.current = null)}
      />
    </div>
  );
}
