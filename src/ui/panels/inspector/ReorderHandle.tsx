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

import type { PointerEvent as ReactPointerEvent } from 'react';
import styles from './Inspector.module.css';

interface ReorderHandleProps {
  readonly label: string;
  /** Position of this row among the rows shown (0 = top). */
  readonly position: number;
  readonly count: number;
  /** Moves the row at display position `from` to display position `to`. */
  readonly onMove: (from: number, to: number) => void;
}

/**
 * Drag handle for a fill, stroke or effect row. Drag it over the list to move the row; with the
 * handle focused, ↑ and ↓ move it one position. Rows taking part carry `data-reorder-row`.
 */
export function ReorderHandle({ label, position, count, onMove }: ReorderHandleProps) {
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || count < 2) return;
    const handle = e.currentTarget;
    const list = handle.closest('ul');
    if (!list) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > [data-reorder-row]')];
    let target = position;
    const mark = () => rows.forEach((row, i) => (i === target && target !== position ? row.setAttribute('data-drop-target', '') : row.removeAttribute('data-drop-target')));
    const onMoveEvent = (event: PointerEvent) => {
      // Insert before the first row whose middle is below the pointer.
      let insert = rows.findIndex((row) => {
        const box = row.getBoundingClientRect();
        return event.clientY < box.top + box.height / 2;
      });
      if (insert < 0) insert = rows.length;
      target = insert > position ? insert - 1 : insert;
      mark();
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMoveEvent);
      rows.forEach((row) => row.removeAttribute('data-drop-target'));
      if (target !== position) onMove(position, target);
    };
    handle.addEventListener('pointermove', onMoveEvent);
    handle.addEventListener('pointerup', onUp, { once: true });
    handle.addEventListener('pointercancel', onUp, { once: true });
  };

  return (
    <button
      type="button"
      className={styles.reorderHandle}
      aria-label={label}
      title="Drag to reorder"
      disabled={count < 2}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' && position > 0) {
          e.preventDefault();
          e.stopPropagation();
          onMove(position, position - 1);
        } else if (e.key === 'ArrowDown' && position < count - 1) {
          e.preventDefault();
          e.stopPropagation();
          onMove(position, position + 1);
        }
      }}
    >
      <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
        {[2, 6, 10].flatMap((y) => [2, 6].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="currentColor" />))}
      </svg>
    </button>
  );
}
