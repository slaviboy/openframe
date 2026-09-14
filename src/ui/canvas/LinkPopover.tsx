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

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { normalizeUrl, type TextLink } from '@/core/text/links';
import { applyLink, editedLink, textEditTarget } from '@/editor/interactions/text-edit';
import { useDocumentRevision, useEditor, useEditorState } from '../hooks/useEditor';
import { IconButton } from '../primitives/IconButton';
import primitives from '../primitives/primitives.module.css';
import { placeFloating, type Box } from '../primitives/position';
import styles from './LinkPopover.module.css';
import { focusText, rangeBox } from './text-anchor';

/** Buttons keep the focus in the text being edited. */
const keepFocus = (e: MouseEvent) => e.preventDefault();

/**
 * Links in the text being edited: with the caret in a link (or its characters selected) a bar above
 * the text shows the address with Open, Edit and Remove; ⇧⌘U or Create link opens an address field
 * for the selected characters, applied with Return.
 */
export function LinkPopover() {
  const editor = useEditor();
  const textEdit = useEditorState((s) => s.textEdit);
  const editing = useEditorState((s) => s.linkEditing);
  useEditorState((s) => s.viewports);
  useDocumentRevision();
  const target = textEdit ? textEditTarget(editor) : null;
  if (!target || !textEdit) return null;
  const link = editedLink(editor);
  const start = Math.min(textEdit.anchor, textEdit.focus);
  const end = Math.max(textEdit.anchor, textEdit.focus);
  const mode = editing && (end > start || link) ? 'edit' : link ? 'view' : null;
  if (!mode) return null;
  const anchor = mode === 'edit' && end > start ? rangeBox(editor, target.node, start, end) : link ? rangeBox(editor, target.node, link.start, link.end) : null;
  if (!anchor) return null;
  // A new bar (fresh address field) for each mode and link.
  return <LinkBar key={`${mode}:${link ? `${link.start}-${link.end}-${link.url}` : `${start}-${end}`}`} mode={mode} anchor={anchor} link={link} />;
}

function LinkBar({ mode, anchor, link }: { mode: 'edit' | 'view'; anchor: Box; link: TextLink | null }) {
  const editor = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(link?.url ?? '');
  const [invalid, setInvalid] = useState(false);
  const { x, y, width, height } = anchor;

  // Measured, then placed above the text (below when there is no room), and only then shown.
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

  const close = () => {
    editor.state.setLinkEditing(false);
    focusText();
  };
  const submit = () => {
    const input = draft.trim();
    if (input === '' && link) {
      applyLink(editor, null);
      close();
      return;
    }
    const url = normalizeUrl(input);
    if (!url) {
      setInvalid(true);
      return;
    }
    applyLink(editor, url);
    close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div ref={ref} className={styles.popover} role="dialog" aria-label="Link">
      {mode === 'edit' ? (
        <>
          <input
            ref={inputRef}
            className={`${primitives.textInput} ${styles.input}`}
            aria-label="Link address"
            aria-invalid={invalid || undefined}
            placeholder="Paste or type a link"
            value={draft}
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => editor.state.setLinkEditing(false)}
          />
          {invalid && (
            <span className={styles.error} role="alert">
              Enter a web address
            </span>
          )}
        </>
      ) : (
        link && (
          <>
            <button type="button" className={styles.url} title={link.url} data-testid="link-url" onMouseDown={keepFocus} onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}>
              {link.url}
            </button>
            <IconButton icon="link" label="Edit link" onMouseDown={keepFocus} onClick={() => editor.state.setLinkEditing(true)} />
            <IconButton icon="unlink" label="Remove link" onMouseDown={keepFocus} onClick={() => applyLink(editor, null)} />
          </>
        )
      )}
    </div>
  );
}
