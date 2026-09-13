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

import { valuesEqual } from '@/core/ops/equality';
import type { FontName, TextNode } from '@/core/schema/document';
import type { FontAxis } from '@/core/text/font-names';
import { parseFontStyle } from '@/core/text/font-style';
import { axisStep, clampAxisValue, type FontVariations } from '@/core/text/font-variations';
import { rangeValues } from '@/core/text/style-runs';
import { setFontVariation, type TextRange } from '@/editor/commands/text';
import { useEditor } from '../../hooks/useEditor';
import { IconButton } from '../../primitives/IconButton';
import { NumberField } from '../../primitives/NumberField';
import styles from './Inspector.module.css';

/**
 * The Variable settings of a variable font: a slider and a value for each of its axes (hidden axes
 * excluded), applied to the selected characters or whole layers. Dragging a slider is one undo
 * step; Reset returns an axis to its default (the weight axis to the style's weight).
 */
export function VariableAxesFields({ nodes, range, fonts }: { nodes: readonly TextNode[]; range: TextRange; fonts: readonly FontName[] }) {
  const editor = useEditor();
  const families = [...new Set(fonts.map((f) => f.family))];
  const axes = families.length === 1 ? (editor.textLayout?.fontAxes?.(families[0]!) ?? []).filter((axis) => !axis.hidden) : [];
  if (axes.length === 0) return null;

  const variations: FontVariations[] = [];
  for (const node of nodes) {
    for (const v of rangeValues(node, range?.start ?? 0, range?.end ?? node.characters.length, 'fontVariations')) {
      if (!variations.some((existing) => valuesEqual(existing, v))) variations.push(v);
    }
  }
  const styleWeights = [...new Set(fonts.map((f) => parseFontStyle(f.style).weight))];
  const defaultOf = (axis: FontAxis) => (axis.tag === 'wght' && styleWeights.length === 1 ? clampAxisValue(axis, styleWeights[0]!) : axis.default);
  const valueOf = (axis: FontAxis) => {
    const values = [...new Set(variations.map((v) => v[axis.tag] ?? defaultOf(axis)))];
    return values.length === 1 ? values[0] : undefined;
  };
  const apply = (axis: FontAxis, value: number | null, merge: boolean) =>
    editor.history.run(
      `Change ${axis.name.toLowerCase()}`,
      (tx) => nodes.forEach((node) => setFontVariation(tx, node, axis.tag, value === null ? null : clampAxisValue(axis, value), range)),
      merge ? { mergeKey: `font-variation:${axis.tag}` } : undefined,
    );

  return (
    <div role="group" aria-label="Variable">
      <div className={styles.hint}>Variable</div>
      {axes.map((axis) => {
        const value = valueOf(axis);
        const isSet = variations.some((v) => v[axis.tag] !== undefined);
        return (
          <div key={axis.tag} className={styles.buttonRow}>
            <input
              type="range"
              aria-label={`${axis.name} axis`}
              min={axis.min}
              max={axis.max}
              step={axisStep(axis)}
              value={value ?? defaultOf(axis)}
              onChange={(e) => apply(axis, Number(e.target.value), true)}
            />
            <NumberField label={axis.tag} ariaLabel={axis.name} testId={`field-axis-${axis.tag}`} min={axis.min} max={axis.max} value={value} onChange={(v) => apply(axis, v, false)} />
            {isSet && <IconButton icon="minus" label={`Reset ${axis.name.toLowerCase()}`} onClick={() => apply(axis, null, false)} />}
          </div>
        );
      })}
    </div>
  );
}
