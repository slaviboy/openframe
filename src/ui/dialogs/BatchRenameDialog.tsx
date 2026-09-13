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

import { useEffect, useMemo, useRef, useState } from 'react';
import { applyRename, previewRename } from '@/editor/commands/rename';
import type { Editor } from '@/editor/editor';
import styles from './Dialog.module.css';

interface BatchRenameDialogProps {
  readonly editor: Editor;
  readonly onClose: () => void;
}

const PREVIEW_LIMIT = 50;

const TOKENS: readonly [label: string, token: string][] = [
  ['Current name', '$&'],
  ['Number ↑', '$n'],
  ['Number ↓', '$N'],
];

/**
 * Rename layers (⌘R with several layers): Match (a regular expression; empty matches the
 * whole name) and Rename to with `$&`, `$1`…, `$n`/`$nnn` ascending and `$N`/`$NNN`
 * descending counters. Shows a live preview; Enter renames, Esc cancels.
 */
export function BatchRenameDialog({ editor, onClose }: BatchRenameDialogProps) {
  const [match, setMatch] = useState('');
  const [replace, setReplace] = useState('');
  const [start, setStart] = useState(1);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    renameRef.current?.focus();
    return () => {
      if (previous?.isConnected && (document.activeElement === null || document.activeElement === document.body)) previous.focus({ preventScroll: true });
    };
  }, []);

  const preview = useMemo(() => previewRename(editor, { match, replace, start }), [editor, match, replace, start]);

  const insertToken = (token: string) => {
    const input = renameRef.current;
    const from = input?.selectionStart ?? replace.length;
    const to = input?.selectionEnd ?? from;
    setReplace(replace.slice(0, from) + token + replace.slice(to));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(from + token.length, from + token.length);
    });
  };

  const apply = () => {
    if (preview.error) return;
    applyRename(editor, { match, replace, start });
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-rename-title"
        className={styles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            apply();
          }
        }}
      >
        <h2 id="batch-rename-title" className={styles.title}>
          Rename {preview.ids.length} layers
        </h2>
        <div className={styles.body}>
          <label className={styles.field}>
            <span>Match</span>
            <input className={styles.input} aria-label="Match" placeholder="Whole name" value={match} spellCheck={false} onChange={(e) => setMatch(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Rename to</span>
            <input ref={renameRef} className={styles.input} aria-label="Rename to" value={replace} spellCheck={false} onChange={(e) => setReplace(e.target.value)} />
          </label>
          <div className={styles.row}>
            {TOKENS.map(([label, token]) => (
              <button key={token} type="button" className={styles.chip} onClick={() => insertToken(token)}>
                {label}
              </button>
            ))}
            <label className={styles.inline}>
              <span>Start from</span>
              <input
                className={styles.number}
                type="number"
                aria-label="Start from"
                value={start}
                onChange={(e) => setStart(Number.isFinite(e.target.valueAsNumber) ? Math.trunc(e.target.valueAsNumber) : 0)}
              />
            </label>
          </div>
          {preview.error && (
            <p className={styles.error} role="alert">
              Invalid match: {preview.error}
            </p>
          )}
          <ul className={styles.preview} aria-label="Preview">
            {preview.from.slice(0, PREVIEW_LIMIT).map((name, i) => (
              <li key={preview.ids[i]} data-changed={preview.to[i] !== name || undefined}>
                <span className={styles.from}>{name}</span>
                <span aria-hidden="true">→</span>
                <span className={styles.to}>{preview.to[i]}</span>
              </li>
            ))}
            {preview.from.length > PREVIEW_LIMIT && <li className={styles.more}>and {preview.from.length - PREVIEW_LIMIT} more</li>}
          </ul>
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={preview.error !== null} onClick={apply}>
            Rename
          </button>
        </footer>
      </div>
    </div>
  );
}
