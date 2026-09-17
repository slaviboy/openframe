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
import { DEFAULT_OFFSET, offsetPathInTx } from '@/editor/commands/offset-path';
import type { OffsetJoin } from '@/core/vector/geometry-service';
import type { Editor } from '@/editor/editor';
import styles from './Dialog.module.css';

/** The amount an offset will take, which is bounded so a drag can't grow a shape out of all reason. */
const LIMIT = 10_000;

/**
 * Offset vector: grows the selected vector layers' area by an amount, or shrinks it when the amount is negative,
 * squaring or rounding off the corners it turns. The canvas shows the offset as it is typed, and Enter confirms
 * it; Esc leaves the layers as they were.
 */
export function OffsetPathDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [amount, setAmount] = useState(String(DEFAULT_OFFSET.amount));
  const [join, setJoin] = useState<OffsetJoin>(DEFAULT_OFFSET.join);
  const tx = useRef<Transaction | null>(null);
  const value = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(value) && Math.abs(value) <= LIMIT;

  // The offset is shown on the canvas as an open transaction the file only takes when it is confirmed.
  useEffect(() => {
    tx.current = editor.history.begin('Offset path');
    return () => {
      if (tx.current) editor.history.cancel(tx.current);
      tx.current = null;
    };
  }, [editor]);

  useEffect(() => {
    const open = tx.current;
    if (!open || !valid) return;
    offsetPathInTx(open, editor, { amount: value, join });
    open.flushPreview();
    editor.requestRender();
  }, [editor, value, join, valid]);

  const apply = () => {
    const open = tx.current;
    if (!open || !valid) return;
    offsetPathInTx(open, editor, { amount: value, join });
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
        aria-labelledby="offset-path-title"
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
        <h2 id="offset-path-title" className={styles.title}>
          Offset vector
        </h2>
        <div className={styles.body}>
          <label className={styles.field}>
            <span>Amount</span>
            <input className={styles.input} type="number" step="any" aria-label="Offset amount" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Join</span>
            <select className={styles.input} aria-label="Offset join" value={join} onChange={(e) => setJoin(e.target.value as OffsetJoin)}>
              <option value="ROUND">Round</option>
              <option value="SQUARE">Square</option>
            </select>
          </label>
          {!valid && (
            <p className={styles.error} role="alert">
              Enter a number between −10,000 and 10,000.
            </p>
          )}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={!valid} onClick={apply}>
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}
