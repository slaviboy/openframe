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

import { PATTERN_ALIGNMENT_LABELS, PATTERN_TILE_LABELS, type PatternAlignment, type PatternTileType } from '@/core/color/pattern';
import type { PatternPaint } from '@/core/schema/document';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import gradientStyles from './Gradient.module.css';
import styles from './Inspector.module.css';

interface PatternSettingsProps {
  label: string;
  paint: PatternPaint;
  /** Name of the source layer, or null when none is chosen (or it no longer exists). */
  sourceName: string | null;
  onSelectSource: () => void;
  onEdit: (label: string, edit: (paint: PatternPaint) => PatternPaint) => void;
  onScrub: (edit: (paint: PatternPaint) => PatternPaint) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}

/** Pattern fill settings: source layer, tile type, scale, spacing and alignment. */
export function PatternSettings({ label, paint, sourceName, onSelectSource, onEdit, onScrub, onGestureStart, onGestureEnd }: PatternSettingsProps) {
  return (
    <li className={gradientStyles.stops} aria-label={`${label} pattern settings`}>
      <div className={gradientStyles.stopsHeader}>
        <span aria-label={`${label} pattern source`}>{sourceName ?? 'No source'}</span>
        <button type="button" className={gradientStyles.textButton} onClick={onSelectSource}>
          {sourceName ? 'Change source' : 'Select source'}
        </button>
      </div>
      <div className={styles.grid2}>
        <select
          className={primitives.select}
          aria-label={`${label} tile type`}
          value={paint.tileType}
          onChange={(e) => onEdit('Change pattern tile type', (p) => ({ ...p, tileType: e.target.value as PatternTileType }))}
        >
          {(Object.keys(PATTERN_TILE_LABELS) as PatternTileType[]).map((type) => (
            <option key={type} value={type}>
              {PATTERN_TILE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          className={primitives.select}
          aria-label={`${label} pattern alignment`}
          value={paint.horizontalAlignment}
          onChange={(e) => onEdit('Change pattern alignment', (p) => ({ ...p, horizontalAlignment: e.target.value as PatternAlignment }))}
        >
          {(Object.keys(PATTERN_ALIGNMENT_LABELS) as PatternAlignment[]).map((alignment) => (
            <option key={alignment} value={alignment}>
              {PATTERN_ALIGNMENT_LABELS[alignment]}
            </option>
          ))}
        </select>
        <NumberField
          label="Scale"
          ariaLabel={`${label} pattern scale`}
          suffix="%"
          min={1}
          max={10000}
          decimals={0}
          value={Math.round(paint.scalingFactor * 100)}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
          onChange={(v) => onScrub((p) => ({ ...p, scalingFactor: Math.min(100, Math.max(0.01, v / 100)) }))}
        />
        <span />
        {(['x', 'y'] as const).map((axis) => (
          <NumberField
            key={axis}
            label={`Gap ${axis.toUpperCase()}`}
            ariaLabel={`${label} pattern spacing ${axis.toUpperCase()}`}
            min={0}
            max={10000}
            value={paint.spacing[axis]}
            onGestureStart={onGestureStart}
            onGestureEnd={onGestureEnd}
            onChange={(v) => onScrub((p) => ({ ...p, spacing: { ...p.spacing, [axis]: Math.min(10000, Math.max(0, v)) } }))}
          />
        ))}
      </div>
    </li>
  );
}
