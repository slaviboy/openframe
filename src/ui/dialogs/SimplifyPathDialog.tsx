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

import { useEffect, useRef, useState } from 'react';
import type { Transaction } from '@/core/history/history';
import { selectedPointCount, simplifyPathInTx } from '@/editor/commands/simplify-path';
import type { Editor } from '@/editor/editor';
import styles from './Dialog.module.css';

/**
 * Simplify vector: takes the points out of a path that say least about its shape, drawing what is left as a
 * smooth curve while the turns it goes sharply around stay sharp. The slider says how much to take out and the
 * canvas shows it as it moves; Enter or Simplify keeps it, Escape leaves the path as it was.
 */
export function SimplifyPathDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [amount, setAmount] = useState(30);
  const [points, setPoints] = useState(() => selectedPointCount(editor));
  // How many points the paths were drawn with before any of this, which is what the count is read against.
  const [before] = useState(() => selectedPointCount(editor));
  const tx = useRef<Transaction | null>(null);

  // The simplification is shown on the canvas as an open transaction the file only takes when it is confirmed.
  useEffect(() => {
    tx.current = editor.history.begin('Simplify vector');
    return () => {
      if (tx.current) editor.history.cancel(tx.current);
      tx.current = null;
    };
  }, [editor]);

  useEffect(() => {
    const open = tx.current;
    if (!open) return;
    simplifyPathInTx(open, editor, amount / 100);
    open.flushPreview();
    setPoints(selectedPointCount(editor));
    editor.requestRender();
  }, [editor, amount]);

  const apply = () => {
    const open = tx.current;
    if (!open) return;
    simplifyPathInTx(open, editor, amount / 100);
    editor.history.commit(open);
    tx.current = null;
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
        aria-labelledby="simplify-path-title"
        className={styles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      >
        <h2 id="simplify-path-title" className={styles.title}>
          Simplify vector
        </h2>
        <div className={styles.body}>
          <label className={styles.field}>
            <span>Amount</span>
            <input
              className={styles.input}
              type="range"
              min="0"
              max="100"
              step="1"
              aria-label="Simplify amount"
              aria-valuetext={`${amount}%`}
              value={amount}
              autoFocus
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <p className={styles.inline} role="status">
            {points === before ? `${points} points` : `${before} points down to ${points}`}
          </p>
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} onClick={apply}>
            Simplify
          </button>
        </footer>
      </div>
    </div>
  );
}
