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
import { Icon, type IconName } from '../icons/Icon';
import { useHoverTooltip } from './HoverTooltip';
import styles from './primitives.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  /** Pressed/active state (e.g. current tool); exposed as aria-pressed. */
  pressed?: boolean;
  size?: 'md' | 'lg';
  /** The hover tooltip's text, when it differs from the accessible label (The reference's wording, e.g. "Remove"). */
  tooltip?: string;
}

export function IconButton({ icon, label, pressed, size = 'md', tooltip, className, ...rest }: IconButtonProps) {
  const { handlers, tooltip: tip } = useHoverTooltip(tooltip ?? label, undefined, 'below');
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        data-pressed={pressed || undefined}
        className={[styles.iconButton, size === 'lg' ? styles.iconButtonLg : '', className ?? ''].join(' ')}
        {...handlers}
        {...rest}
      >
        <Icon name={icon} size={24} />
      </button>
      {tip}
    </>
  );
}
