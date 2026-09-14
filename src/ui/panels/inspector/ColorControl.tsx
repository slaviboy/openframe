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

import { useMemo, useState } from 'react';
import { parseHex, toCss, toHex6 } from '@/core/color/color';
import { documentColors } from '@/core/color/document-colors';
import type { BlendMode, Color } from '@/core/schema/document';
import { useColorProfile } from '../../hooks/useColorProfile';
import { useEditor } from '../../hooks/useEditor';
import { ColorPicker } from '../../primitives/ColorPicker';
import { NumberField } from '../../primitives/NumberField';
import type { Box } from '../../primitives/position';
import { PAINT_BLEND_OPTIONS } from './blend-modes';
import styles from './Inspector.module.css';

export interface ColorControlProps {
  label: string;
  color: Color;
  opacity: number;
  onColor: (color: Color) => void;
  onOpacity: (opacity: number) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  /** Paint blend mode, edited in the picker. */
  blendMode?: BlendMode | undefined;
  onBlendMode?: ((mode: BlendMode) => void) | undefined;
  /** The color behind the layer, enabling the contrast checker in the picker. */
  getContrastBackground?: (() => Color) | undefined;
}

/** Swatch that opens the color picker, hex input, and opacity field. */
export function ColorControl({ label, color, opacity, onColor, onOpacity, onGestureStart, onGestureEnd, blendMode, onBlendMode, getContrastBackground }: ColorControlProps) {
  const editor = useEditor();
  const profile = useColorProfile();
  const hex = toHex6(color);
  // Draft text while the hex field is being edited; otherwise it mirrors the document.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? hex;
  const [pickerAnchor, setPickerAnchor] = useState<Box | null>(null);
  // Collected when the picker opens, so swatches stay put while the color is being edited.
  const swatches = useMemo(() => (pickerAnchor ? documentColors(editor.doc) : null), [pickerAnchor, editor]);

  const commitHex = () => {
    if (draft === null) return;
    const parsed = parseHex(draft);
    setDraft(null);
    if (!parsed) return;
    onGestureStart();
    onColor(parsed);
    onGestureEnd();
  };

  return (
    <div className={styles.colorControl}>
      <button
        type="button"
        className={styles.swatch}
        aria-label={`${label} color`}
        aria-haspopup="dialog"
        aria-expanded={pickerAnchor !== null}
        style={{ background: toCss({ ...color, a: 1 }, profile) }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPickerAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
        }}
      />
      {pickerAnchor && (
        <ColorPicker
          label={label}
          color={{ ...color, a: 1 }}
          opacity={opacity}
          anchor={pickerAnchor}
          onColor={onColor}
          onOpacity={onOpacity}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
          onClose={() => setPickerAnchor(null)}
          blendMode={blendMode}
          blendOptions={PAINT_BLEND_OPTIONS}
          onPickFromCanvas={editor.pickColorFromCanvas ?? undefined}
          getContrastBackground={getContrastBackground}
          colorProfile={profile}
          onBlendMode={onBlendMode}
          documentColors={swatches ?? undefined}
        />
      )}
      <input
        className={styles.hexInput}
        aria-label={`${label} hex`}
        value={text}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onBlur={commitHex}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <NumberField
        label=""
        ariaLabel={`${label} opacity`}
        suffix="%"
        min={0}
        max={100}
        decimals={0}
        value={Math.round(opacity * 100)}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
        onChange={(v) => onOpacity(v / 100)}
      />
    </div>
  );
}
