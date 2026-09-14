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
import { isAutoLayoutFrame } from '@/core/layout/auto-layout';
import type { PaddingSide } from '@/core/layout/layout-handles';
import { apply } from '@/core/math/matrix';
import { selectedLayoutHandles } from '@/editor/interactions/layout-handles';
import type { LayoutValueEditRef } from '@/editor/stores/editor-store';
import { worldToScreen } from '@/editor/viewport/viewport';
import { useDocumentRevision, useEditor, useEditorState } from '../hooks/useEditor';
import primitives from '../primitives/primitives.module.css';
import { placeFloating, type Box } from '../primitives/position';
import styles from './LinkPopover.module.css';

const SIDE_FIELDS: Record<PaddingSide, 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'> = { top: 'paddingTop', right: 'paddingRight', bottom: 'paddingBottom', left: 'paddingLeft' };
const OPPOSITE: Record<PaddingSide, PaddingSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const SIDE_LABELS: Record<PaddingSide, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' };

/** A value field next to a clicked padding or gap handle of the selected auto layout frame. */
export function LayoutValuePopover() {
  const editor = useEditor();
  const edit = useEditorState((s) => s.layoutValueEdit);
  useEditorState((s) => s.viewports);
  useDocumentRevision();
  if (!edit) return null;
  const selected = selectedLayoutHandles(editor);
  const handle =
    selected?.frameId === edit.frameId
      ? selected.handles.find((h) => (h.kind === 'gap' && edit.handle.kind === 'gap' ? h.index === edit.handle.index : h.kind === 'padding' && edit.handle.kind === 'padding' && h.side === edit.handle.side))
      : undefined;
  const host = document.querySelector('[data-canvas-host]');
  if (!selected || !handle || !host) return null;
  const point = worldToScreen(editor.state.viewport, apply(selected.toWorld, handle.at));
  const bounds = host.getBoundingClientRect();
  const anchor = { x: Math.round(bounds.left + point.x), y: Math.round(bounds.top + point.y), width: 0, height: 0 };
  const key = `${edit.frameId}:${edit.handle.kind === 'gap' ? `gap-${edit.handle.index}` : edit.handle.side}:${edit.mode}`;
  return <LayoutValueField key={key} edit={edit} anchor={anchor} />;
}

function LayoutValueField({ edit, anchor }: { edit: LayoutValueEditRef; anchor: Box }) {
  const editor = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const frame = editor.doc.get(edit.frameId);
  const current = !isAutoLayoutFrame(frame) ? 0 : edit.handle.kind === 'gap' ? (frame.itemSpacing ?? 0) : (frame[SIDE_FIELDS[edit.handle.side]] ?? 0);
  const [draft, setDraft] = useState(String(current));
  const [invalid, setInvalid] = useState(false);
  const { x, y, width, height } = anchor;
  const label =
    edit.handle.kind === 'gap'
      ? 'Gap between items'
      : edit.mode === 'all'
        ? 'Padding on all sides'
        : edit.mode === 'opposite'
          ? `${edit.handle.side === 'top' || edit.handle.side === 'bottom' ? 'Vertical' : 'Horizontal'} padding`
          : `${SIDE_LABELS[edit.handle.side]} padding`;

  // Measured, then placed above the handle (below when there is no room), and only then shown.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const p = placeFloating({ x, y, width, height }, element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, 'top-start', 8, 8);
    element.style.left = `${p.x}px`;
    element.style.top = `${p.y}px`;
    element.style.visibility = 'visible';
  }, [x, y, width, height]);
  useLayoutEffect(() => {
    inputRef.current?.select();
  }, []);

  const close = () => editor.state.setLayoutValueEdit(null);
  const submit = () => {
    const value = Number(draft.trim());
    if (draft.trim() === '' || !Number.isFinite(value) || (edit.handle.kind === 'padding' && value < 0)) {
      setInvalid(true);
      return;
    }
    const handle = edit.handle;
    editor.history.run(handle.kind === 'gap' ? 'Change gap' : 'Change padding', (tx) => {
      if (handle.kind === 'gap') {
        tx.set(edit.frameId, 'itemSpacing', value === 0 ? undefined : value);
        return;
      }
      const sides: PaddingSide[] = edit.mode === 'all' ? ['top', 'right', 'bottom', 'left'] : edit.mode === 'opposite' ? [handle.side, OPPOSITE[handle.side]] : [handle.side];
      for (const side of sides) tx.set(edit.frameId, SIDE_FIELDS[side], value > 0 ? value : undefined);
    });
    close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div ref={ref} className={styles.popover} role="dialog" aria-label={label}>
      <input
        ref={inputRef}
        className={`${primitives.textInput} ${styles.input}`}
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        value={draft}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
    </div>
  );
}
