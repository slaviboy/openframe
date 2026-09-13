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

import { useState } from 'react';
import { isValidNudge, viewPrefs } from '../view/view-prefs';
import styles from './Dialog.module.css';

interface NudgeDialogProps {
  readonly onClose: () => void;
}

/**
 * Preferences → Nudge amount: the distances arrow keys (small) and Shift + arrow keys (big) move
 * the selection. Stored per device. Enter saves, Esc cancels.
 */
export function NudgeDialog({ onClose }: NudgeDialogProps) {
  const [small, setSmall] = useState(() => String(viewPrefs.getSnapshot().nudgeSmall));
  const [big, setBig] = useState(() => String(viewPrefs.getSnapshot().nudgeBig));
  const smallValue = Number(small);
  const bigValue = Number(big);
  const valid = small.trim() !== '' && big.trim() !== '' && isValidNudge(smallValue) && isValidNudge(bigValue);

  const save = () => {
    if (!valid) return;
    viewPrefs.set({ nudgeSmall: smallValue, nudgeBig: bigValue });
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
        aria-labelledby="nudge-dialog-title"
        className={styles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            save();
          }
        }}
      >
        <h2 id="nudge-dialog-title" className={styles.title}>
          Nudge amount
        </h2>
        <div className={styles.body}>
          <label className={styles.field}>
            <span>Small nudge</span>
            <input className={styles.input} type="number" min="0.01" step="any" aria-label="Small nudge" value={small} autoFocus onChange={(e) => setSmall(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Big nudge</span>
            <input className={styles.input} type="number" min="0.01" step="any" aria-label="Big nudge" value={big} onChange={(e) => setBig(e.target.value)} />
          </label>
          {!valid && (
            <p className={styles.error} role="alert">
              Enter positive numbers up to 10,000.
            </p>
          )}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={!valid} onClick={save}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
