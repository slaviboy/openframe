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

import { useState, type ReactNode } from 'react';
import type { IconName } from '../icons/Icon';
import { Menu, type MenuEntry } from './Menu';
import type { Box } from './position';
import styles from './IconSelect.module.css';
import primitives from './primitives.module.css';

/** One option of a select that draws its values: a picture, a picture beside its name, or a name alone. */
export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Drawn in the list instead of the label, where the reference draws the option rather than naming it. */
  readonly content?: ReactNode;
  readonly icon?: IconName;
  /** A separator is drawn above this option, as the reference groups its lists. */
  readonly startsGroup?: boolean;
  readonly disabled?: boolean;
}

/**
 * A select whose values are drawn, not written — the control the reference uses for a stroke's style, its
 * width profile and its end points. A native `<select>` cannot draw an option, so this is a button that
 * opens the shared menu; `data-value` carries the chosen value so it can still be asserted, and the trigger
 * reads as the panel's other selects do. `null` is a mixed selection, which shows but is never an option.
 */
export function IconSelect<T extends string>({
  label,
  value,
  options,
  trigger,
  disabled,
  testId,
  onChange,
}: {
  readonly label: string;
  readonly value: T | null;
  readonly options: readonly SelectOption<T>[];
  /** What the button draws for the chosen value; the chevron is the control's own. */
  readonly trigger: ReactNode;
  readonly disabled?: boolean;
  readonly testId?: string;
  readonly onChange: (value: T) => void;
}) {
  const [anchor, setAnchor] = useState<Box | null>(null);
  const entries: MenuEntry[] = options.flatMap((option) => {
    const item: MenuEntry = {
      kind: 'item',
      id: option.value,
      label: option.label,
      ...(option.content === undefined ? {} : { content: option.content }),
      ...(option.icon === undefined ? {} : { icon: option.icon }),
      checked: option.value === value,
      ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
      onSelect: () => onChange(option.value),
    };
    return option.startsGroup === true ? [{ kind: 'separator', id: `${option.value}-separator` } as MenuEntry, item] : [item];
  });
  return (
    <>
      <button
        type="button"
        className={`${primitives.select} ${styles.trigger}`}
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        aria-label={label}
        disabled={disabled}
        data-value={value ?? ''}
        data-testid={testId}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
        }}
      >
        {trigger}
      </button>
      {anchor && <Menu label={label} entries={entries} anchor={anchor} placement="bottom-start" onClose={() => setAnchor(null)} />}
    </>
  );
}
