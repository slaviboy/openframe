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
import type { StrokeCap } from '@/core/schema/document';
import { Icon, type IconName } from '../../icons/Icon';
import { Menu, type MenuEntry } from '../../primitives/Menu';
import type { Box } from '../../primitives/position';
import primitives from '../../primitives/primitives.module.css';
import styles from './EndpointSelect.module.css';

/**
 * The stroke endpoints a line or an open path can end in, in the reference's own order, with its labels
 * and the separator it draws after the plain ends. `TRIANGLE_FILLED` is the reference's "Reversed triangle";
 * `LINE_ARROW` and `TRIANGLE_ARROW` are our names for its `ARROW_LINES` and `ARROW_EQUILATERAL`.
 */
export const CAP_OPTIONS: readonly { readonly cap: StrokeCap; readonly label: string; readonly icon: IconName; readonly long: IconName; readonly startsGroup?: boolean }[] = [
  { cap: 'NONE', label: 'None', icon: 'capNone', long: 'capNoneLong' },
  { cap: 'ROUND', label: 'Round', icon: 'capRound', long: 'capRoundLong' },
  { cap: 'SQUARE', label: 'Square', icon: 'capSquare', long: 'capSquareLong' },
  { cap: 'LINE_ARROW', label: 'Line arrow', icon: 'capLineArrow', long: 'capLineArrowLong', startsGroup: true },
  { cap: 'TRIANGLE_ARROW', label: 'Triangle arrow', icon: 'capTriangleArrow', long: 'capTriangleArrowLong' },
  { cap: 'TRIANGLE_FILLED', label: 'Reversed triangle', icon: 'capReversedTriangle', long: 'capReversedTriangleLong' },
  { cap: 'CIRCLE_FILLED', label: 'Circle arrow', icon: 'capCircleArrow', long: 'capCircleArrowLong' },
  { cap: 'DIAMOND_FILLED', label: 'Diamond arrow', icon: 'capDiamondArrow', long: 'capDiamondArrowLong' },
];

const optionFor = (cap: StrokeCap) => CAP_OPTIONS.find((option) => option.cap === cap);

/**
 * One of the Stroke section's Start point / End point controls. The reference draws each option beside a
 * picture of the end it makes, which a native `<select>` cannot do, so this is a button and a menu —
 * recorded in docs/UI_REFERENCE.md. `null` is a mixed selection, which shows but is never an option.
 */
export function EndpointSelect({ label, value, flipped = false, onChange }: { label: string; value: StrokeCap | null; flipped?: boolean; onChange: (cap: StrokeCap) => void }) {
  const [anchor, setAnchor] = useState<Box | null>(null);
  const current = value === null ? undefined : optionFor(value);
  const entries: MenuEntry[] = CAP_OPTIONS.flatMap((option) => {
    const item: MenuEntry = { kind: 'item', id: option.cap, label: option.label, icon: option.icon, checked: option.cap === value, onSelect: () => onChange(option.cap) };
    return option.startsGroup === true ? [{ kind: 'separator', id: `${option.cap}-separator` } as MenuEntry, item] : [item];
  });
  return (
    <>
      <button
        type="button"
        className={`${primitives.select} ${styles.trigger}`}
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        aria-label={label}
        data-value={value ?? ''}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
        }}
      >
        {/* The reference draws the end across the whole control, clipping the 200-wide picture rather than
            scaling it, and mirrors the whole thing for the End point. */}
        {current ? (
          <span className={flipped ? `${styles.glyph} ${styles.flipped}` : styles.glyph}>
            <Icon name={current.long} />
          </span>
        ) : (
          <span className={styles.name}>Mixed</span>
        )}
      </button>
      {anchor && <Menu label={label} entries={entries} anchor={anchor} placement="bottom-start" onClose={() => setAnchor(null)} />}
    </>
  );
}
