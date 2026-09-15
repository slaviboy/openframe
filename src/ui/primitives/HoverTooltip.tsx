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

import { useState, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './HoverTooltip.module.css';

export type TooltipPlacement = 'right' | 'above';

interface TooltipAnchor {
  readonly x: number;
  readonly y: number;
}

/**
 * A dark tooltip with the control's name (and shortcut) that appears while the pointer is over the control or it has
 * keyboard focus. Spread `handlers` on the control and render `tooltip` next to it.
 */
export function useHoverTooltip(label: string, shortcut: string | undefined, placement: TooltipPlacement) {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setAnchor(placement === 'right' ? { x: r.right + 8, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.top - 8 });
  };
  const hide = () => setAnchor(null);
  const handlers = {
    onPointerEnter: (e: { currentTarget: HTMLElement }) => show(e.currentTarget),
    onPointerLeave: hide,
    onPointerDown: hide,
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(':focus-visible')) show(e.currentTarget);
    },
    onBlur: hide,
  };
  const tooltip: ReactNode =
    anchor &&
    createPortal(
      <div className={styles.tooltip} data-placement={placement} role="tooltip" style={{ left: anchor.x, top: anchor.y }}>
        <span>{label}</span>
        {shortcut && <span className={styles.shortcut}>{shortcut}</span>}
      </div>,
      document.body,
    );
  return { handlers, tooltip };
}
