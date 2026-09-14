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

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Id } from '@/core/ids/ids';
import { flowsOf } from '@/core/prototype/flows';
import { flowTagRect } from '@/editor/chrome/prototype-geometry';
import { updateFlowStartingPoint } from '@/editor/commands/prototype';
import { useDocumentRevision, useEditor, useEditorState } from '../hooks/useEditor';
import primitives from '../primitives/primitives.module.css';
import styles from './LinkPopover.module.css';

/** A field over a flow starting point's tag on the canvas, renaming the flow (opened by double-clicking the tag). */
export function FlowRenamePopover() {
  const editor = useEditor();
  const frameId = useEditorState((s) => s.flowRename);
  const pageId = useEditorState((s) => s.activePageId);
  useEditorState((s) => s.viewports);
  useDocumentRevision();
  const flow = frameId ? flowsOf(editor.doc, pageId).find((candidate) => candidate.nodeId === frameId) : undefined;
  const rect = frameId ? flowTagRect(editor, frameId) : null;
  const host = document.querySelector('[data-canvas-host]');
  if (!frameId || !flow || !rect || !host) return null;
  const bounds = host.getBoundingClientRect();
  return <FlowRenameField key={frameId} frameId={frameId} name={flow.name} at={{ x: Math.round(bounds.left + rect.x), y: Math.round(bounds.top + rect.y), height: rect.height }} />;
}

function FlowRenameField({ frameId, name, at }: { frameId: Id; name: string; at: { x: number; y: number; height: number } }) {
  const editor = useEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(name);
  useLayoutEffect(() => {
    inputRef.current?.select();
  }, []);

  const close = () => editor.state.setFlowRename(null);
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      // An empty name keeps the old one.
      updateFlowStartingPoint(editor, frameId, { name: draft });
      close();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className={styles.popover} style={{ left: at.x, top: at.y, minHeight: at.height, visibility: 'visible' }} role="dialog" aria-label="Rename flow">
      <input
        ref={inputRef}
        className={`${primitives.textInput} ${styles.input}`}
        aria-label="Rename flow"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
    </div>
  );
}
