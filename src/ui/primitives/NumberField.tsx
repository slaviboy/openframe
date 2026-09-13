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

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { evaluateMath, formatNumber } from './math';
import captionStyles from './PropertyCaption.module.css';
import { PropertyLabelsContext } from './property-labels';
import styles from './primitives.module.css';

export interface NumberFieldProps {
  /** Short label or icon shown inside the field; dragging it scrubs the value. */
  label: ReactNode;
  ariaLabel: string;
  /** undefined renders "Mixed". */
  value: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  decimals?: number;
  /** Called for each change during a gesture (scrub / arrow key); commit happens on end. */
  onChange: (value: number) => void;
  /** Gesture boundaries so a scrub becomes one undo step. */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  disabled?: boolean;
  testId?: string;
}

const clamp = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

/**
 * Inspector numeric field: accepts arithmetic ("120/2"), relative input ("+10", "*2"),
 * ArrowUp/Down to nudge (Shift ×10), Enter/Tab/blur to commit, Escape to revert, and
 * label drag to scrub.
 */
export function NumberField(props: NumberFieldProps) {
  const { label, ariaLabel, value, min, max, step = 1, suffix = '', decimals = 2, disabled } = props;
  const showCaption = useContext(PropertyLabelsContext);
  const display = value === undefined ? '' : `${formatNumber(value, decimals)}${suffix}`;
  // While focused the user's draft is shown; otherwise the field always reflects the document.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? display;
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const commitText = () => {
    if (draft === null) return;
    const parsed = evaluateMath(draft, value);
    if (parsed !== null) {
      const next = clamp(parsed, min, max);
      if (next !== value) {
        props.onGestureStart?.();
        props.onChange(next);
        props.onGestureEnd?.();
      }
    }
    setDraft(null);
  };

  const nudge = (delta: number) => {
    const base = value ?? 0;
    props.onGestureStart?.();
    props.onChange(clamp(base + delta, min, max));
    props.onGestureEnd?.();
  };

  const onScrubStart = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startValue = value ?? 0;
    let started = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!started) {
        if (Math.abs(dx) < 2) return;
        started = true;
        propsRef.current.onGestureStart?.();
      }
      const factor = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      propsRef.current.onChange(clamp(Math.round((startValue + dx * step * factor) * 100) / 100, min, max));
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (started) propsRef.current.onGestureEnd?.();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const field = (
    <label className={styles.numberField} data-disabled={disabled || undefined}>
      <span className={styles.numberLabel} onPointerDown={onScrubStart} aria-hidden="true">
        {label}
      </span>
      <input
        className={styles.numberInput}
        aria-label={ariaLabel}
        data-testid={props.testId}
        value={text}
        placeholder={value === undefined ? 'Mixed' : ''}
        disabled={disabled}
        inputMode="decimal"
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            // Blur performs the single commit; committing here too would record the edit twice.
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setDraft(null);
            nudge((e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
          }
        }}
      />
    </label>
  );

  if (!showCaption) return field;
  return (
    <div className={captionStyles.captioned}>
      <span className={captionStyles.caption} aria-hidden="true" data-testid={props.testId ? `${props.testId}-caption` : undefined}>
        {ariaLabel}
      </span>
      {field}
    </div>
  );
}
