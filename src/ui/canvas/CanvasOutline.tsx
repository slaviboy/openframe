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

import { useMemo, type ReactNode } from 'react';
import { describeSelection, pageOutline, type OutlineItem } from '@/core/scene/canvas-outline';
import type { Editor } from '@/editor/editor';
import { useDocumentRevision, useEditorState } from '../hooks/useEditor';
import styles from './CanvasHost.module.css';

/**
 * What a screen reader finds on the canvas: every layer of the page as a tree item, named and described — what it
 * is, the words it carries, the size and place it takes — with the selected ones marked. The canvas is a picture a
 * screen reader cannot read, so this stands for it. It is there to be read rather than used: the Layers panel is
 * the tree layers are picked and moved in, and a second tree of the same layers would only be in the way.
 *
 * A live region beside it says what has just been selected, however the selection was made — on the canvas, in the
 * Layers panel, or by a command — which is the part the Layers panel cannot do for the canvas.
 */
export function CanvasOutline({ editor }: { editor: Editor }) {
  const revision = useDocumentRevision();
  const pageId = useEditorState((s) => s.activePageId);
  const selection = useEditorState((s) => s.selection);
  const selected = new Set(selection);
  // Reading the page again on every change is what keeps this a mirror rather than a copy that drifts.
  const items = useMemo(() => pageOutline(editor.doc, editor.scene, pageId), [editor, pageId, revision]);
  const announcement = useMemo(() => describeSelection(editor.doc, editor.scene, selection), [editor, selection, revision]);
  /**
   * A layer is a line of its own description, with the layers it holds nested under it. None of this carries a role
   * or a label of its own: a named landmark for each layer would compete with the panels' own regions, and a second
   * tree of `treeitem`s with the Layers panel's, which is the page's tree and where layers are actually picked.
   */
  const render = (item: OutlineItem): ReactNode => (
    <div key={item.id}>
      <p {...(selected.has(item.id) ? { 'aria-current': true } : {})}>{item.label}</p>
      {item.children.map(render)}
    </div>
  );

  return (
    <div className={styles.outline}>
      <div role="region" aria-label="Canvas contents">
        {items.map(render)}
      </div>
      <p role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
