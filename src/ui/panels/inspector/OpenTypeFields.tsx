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
import {
  featureLabel,
  figureSpacing,
  figureStyle,
  isFeatureOn,
  listedFeatures,
  numberPosition,
  withFeature,
  withFigureSpacing,
  withFigureStyle,
  withNumberPosition,
  type FigureSpacing,
  type FigureStyle,
  type NumberPosition,
  type OpenTypeFeatures,
} from '@/core/text/opentype';
import { rangeValues } from '@/core/text/style-runs';
import { updateOpenTypeFeatures, type TextRange } from '@/editor/commands/text';
import { useEditor } from '../../hooks/useEditor';
import primitives from '../../primitives/primitives.module.css';
import styles from './Inspector.module.css';

/**
 * Type settings for numbers (figure spacing and style, position, fractions, slashed zero), letter
 * case features, and the list of other OpenType features the font supports. Settings a font can't
 * apply are disabled (or not listed); each change is one undo step on the selected characters or
 * whole layers.
 */
export function OpenTypeFields({ nodes, range, fonts }: { nodes: readonly TextNode[]; range: TextRange; fonts: readonly FontName[] }) {
  const editor = useEditor();
  const values: OpenTypeFeatures[] = [];
  for (const node of nodes) {
    for (const v of rangeValues(node, range?.start ?? 0, range?.end ?? node.characters.length, 'openTypeFeatures')) {
      if (!values.some((existing) => valuesEqual(existing, v))) values.push(v);
    }
  }
  const supported = new Set(fonts.flatMap((font) => editor.textLayout?.supportedFeatures?.(font) ?? []));
  const has = (...tags: string[]) => tags.some((tag) => supported.has(tag));
  const same = <T,>(read: (features: OpenTypeFeatures) => T): T | undefined => {
    const distinct = [...new Set(values.map(read))];
    return distinct.length === 1 ? distinct[0] : undefined;
  };
  const update = (label: string, change: (features: OpenTypeFeatures) => OpenTypeFeatures) =>
    editor.history.run(label, (tx) => nodes.forEach((node) => updateOpenTypeFeatures(tx, node, change, range)));

  const toggle = (tag: string) => {
    const on = same((f) => isFeatureOn(f, tag));
    const label = featureLabel(tag);
    return (
      <label key={tag} className={styles.checkbox}>
        <input type="checkbox" checked={on === true} disabled={!supported.has(tag) && on !== true} onChange={(e) => update(`Change ${label.toLowerCase()}`, (f) => withFeature(f, tag, e.target.checked))} />
        {label}
      </label>
    );
  };
  const spacing = same(figureSpacing);
  const style = same(figureStyle);
  const position = same(numberPosition);
  const groups = listedFeatures(supported);

  return (
    <>
      {has('case', 'cpsp') && (
        <div role="group" aria-label="Letter case features">
          {has('case') && toggle('case')}
          {has('cpsp') && toggle('cpsp')}
        </div>
      )}
      <div role="group" aria-label="Numbers">
        <div className={styles.hint}>Numbers</div>
        <div className={styles.grid2}>
          <select className={primitives.select} aria-label="Figure spacing" value={spacing ?? ''} onChange={(e) => update('Change figure spacing', (f) => withFigureSpacing(f, e.target.value as FigureSpacing))}>
            {spacing === undefined && <option value="">Mixed</option>}
            <option value="DEFAULT">Default spacing</option>
            <option value="PROPORTIONAL" disabled={!has('pnum', 'tnum')}>
              Proportional
            </option>
            <option value="TABULAR" disabled={!has('tnum')}>
              Monospace (tabular)
            </option>
          </select>
          <select className={primitives.select} aria-label="Figure style" value={style ?? ''} onChange={(e) => update('Change figure style', (f) => withFigureStyle(f, e.target.value as FigureStyle))}>
            {style === undefined && <option value="">Mixed</option>}
            <option value="DEFAULT">Default style</option>
            <option value="LINING" disabled={!has('lnum', 'onum')}>
              Uppercase (lining)
            </option>
            <option value="OLDSTYLE" disabled={!has('onum')}>
              Lowercase (old-style)
            </option>
          </select>
        </div>
        <select className={primitives.select} aria-label="Number position" value={position ?? ''} onChange={(e) => update('Change number position', (f) => withNumberPosition(f, e.target.value as NumberPosition))}>
          {position === undefined && <option value="">Mixed</option>}
          <option value="NORMAL">Normal position</option>
          <option value="SUPERSCRIPT" disabled={!has('sups')}>
            Superscript
          </option>
          <option value="SUBSCRIPT" disabled={!has('subs')}>
            Subscript
          </option>
        </select>
        {toggle('frac')}
        {toggle('zero')}
      </div>
      <div role="group" aria-label="OpenType features">
        <div className={styles.hint}>OpenType features</div>
        {groups.length === 0 && <p className={styles.hint}>This font has no other OpenType features.</p>}
        {groups.map(({ group, tags }) => (
          <div key={group} role="group" aria-label={group}>
            {tags.map(toggle)}
          </div>
        ))}
      </div>
    </>
  );
}
