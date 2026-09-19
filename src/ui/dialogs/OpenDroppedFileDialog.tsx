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

import styles from './Dialog.module.css';

export interface OpenDroppedFileDialogProps {
  /** The Openframe file that was dropped. */
  readonly name: string;
  /** What is open now, which the dropped file is opened alongside. */
  readonly current: string;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}

/**
 * Asks before opening an Openframe file dropped on the canvas. A drop is easy to do by accident and
 * opening one takes the editor somewhere else, so it is worth a question — and worth saying plainly that
 * nothing is lost, because the file open now stays in Files.
 */
export function OpenDroppedFileDialog({ name, current, onOpen, onClose }: OpenDroppedFileDialogProps) {
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
        aria-labelledby="open-dropped-title"
        className={styles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <h2 id="open-dropped-title" className={styles.title}>
          Open {name}?
        </h2>
        <div className={styles.body}>
          <p className={styles.hint}>It opens as a file of its own. {current} stays in Files, with everything in it.</p>
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} autoFocus onClick={onOpen}>
            Open
          </button>
        </footer>
      </div>
    </div>
  );
}
