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

import type { StrokeCap } from '@/core/schema/document';
import { Icon, type IconName } from '../../icons/Icon';
import { IconSelect, type SelectOption } from '../../primitives/IconSelect';
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
 * One of the Start point / End point controls — in the Stroke section beside the stroke's own row, and in
 * the Stroke settings dialog. The reference draws each option beside a picture of the end it makes, which a
 * native `<select>` cannot do, so this is the shared drawn select — recorded in docs/UI_REFERENCE.md.
 * `null` is a mixed selection, which shows but is never an option.
 */
export function EndpointSelect({
  label,
  value,
  flipped = false,
  disabled,
  onChange,
}: {
  label: string;
  value: StrokeCap | null;
  flipped?: boolean;
  disabled?: boolean;
  onChange: (cap: StrokeCap) => void;
}) {
  const current = value === null ? undefined : optionFor(value);
  const options: SelectOption<StrokeCap>[] = CAP_OPTIONS.map((option) => ({
    value: option.cap,
    label: option.label,
    icon: option.icon,
    ...(option.startsGroup === true ? { startsGroup: true } : {}),
  }));
  return (
    <IconSelect
      label={label}
      value={value}
      options={options}
      {...(disabled === undefined ? {} : { disabled })}
      onChange={onChange}
      trigger={
        /* The reference draws the end across the whole control, clipping the 200-wide picture rather than
           scaling it, and mirrors the whole thing for the End point. */
        current ? (
          <span className={flipped ? `${styles.glyph} ${styles.flipped}` : styles.glyph}>
            <Icon name={current.long} />
          </span>
        ) : (
          <span className={styles.name}>Mixed</span>
        )
      }
    />
  );
}
