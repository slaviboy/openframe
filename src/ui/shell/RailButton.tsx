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

import type { ButtonHTMLAttributes } from 'react';
import { formatShortcut } from '@/editor/keymap/keymap';
import { Icon, type IconName } from '../icons/Icon';
import { IS_MAC } from '../keyboard/keyboard-controller';
import { useHoverTooltip } from '../primitives/HoverTooltip';
import styles from './EditorShell.module.css';

interface RailButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly icon: IconName;
  readonly label: string;
  /** A registered shortcut (e.g. `Alt+2`), shown in the tooltip. */
  readonly shortcut?: string;
  readonly selected?: boolean;
}

/** An icon-only navigation rail button; hovering or focusing it shows its name (and shortcut) to the right. */
export function RailButton({ icon, label, shortcut, selected, className, ...rest }: RailButtonProps) {
  const { handlers, tooltip } = useHoverTooltip(label, shortcut && formatShortcut(shortcut, IS_MAC), 'right');
  return (
    <>
      <button type="button" className={[styles.railTab, className ?? ''].join(' ')} aria-label={label} aria-current={selected ? 'page' : undefined} {...handlers} {...rest}>
        <Icon name={icon} />
      </button>
      {tooltip}
    </>
  );
}
