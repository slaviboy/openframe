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
import type { Transaction } from '@/core/history/history';
import type { TextAlignHorizontal, TextAlignVertical, TextAutoResize, TextNode } from '@/core/schema/document';
import { VARIABLE_FONT_STYLES } from '@/core/text/font-style';
import type { FontFamilyInfo } from '@/core/text/text-layout';
import { formatLetterSpacing, formatLineHeight, parseLetterSpacing, parseLineHeight } from '@/core/text/text-values';
import { MIXED, shared, type Mixed } from '@/editor/commands/properties';
import {
  setFontFamily,
  setFontSize,
  setFontStyle,
  setLetterSpacing,
  setLineHeight,
  setTextAlignHorizontal,
  setTextAlignVertical,
  setTextAutoResize,
} from '@/editor/commands/text';
import type { IconName } from '../../icons/Icon';
import { useEditor } from '../../hooks/useEditor';
import { useGesture } from '../../hooks/useGesture';
import { IconButton } from '../../primitives/IconButton';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import styles from './Inspector.module.css';

const H_ALIGN: readonly (readonly [TextAlignHorizontal, IconName, string])[] = [
  ['LEFT', 'textAlignLeft', 'Align left'],
  ['CENTER', 'textAlignCenter', 'Align center'],
  ['RIGHT', 'textAlignRight', 'Align right'],
  ['JUSTIFIED', 'textAlignJustify', 'Justify'],
];
const V_ALIGN: readonly (readonly [TextAlignVertical, IconName, string])[] = [
  ['TOP', 'alignTop', 'Align top'],
  ['CENTER', 'alignMiddle', 'Align middle'],
  ['BOTTOM', 'alignBottom', 'Align bottom'],
];
export const RESIZE_MODES: readonly (readonly [TextAutoResize, IconName, string])[] = [
  ['WIDTH_AND_HEIGHT', 'autoWidth', 'Auto width'],
  ['HEIGHT', 'autoHeight', 'Auto height'],
  ['NONE', 'fixedSize', 'Fixed size'],
  ['TRUNCATE', 'truncate', 'Truncate text'],
];

const val = <T,>(v: Mixed<T>): T | undefined => (v === MIXED ? undefined : v);

/** Families to offer: the available fonts, plus the selection's family when it is not available (a missing font). */
function familyOptions(available: readonly FontFamilyInfo[], family: string | undefined, style: string | undefined): readonly FontFamilyInfo[] {
  if (family === undefined || available.some((f) => f.family === family)) return available;
  return [...available, { family, styles: [style ?? 'Regular'] }];
}

/** Text resizing buttons (shown in the Layout section for text layers). */
export function TextResizingButtons({ nodes }: { nodes: readonly TextNode[] }) {
  const editor = useEditor();
  const mode = shared(nodes, (n) => n.textAutoResize);
  return (
    <div className={styles.buttonRow} role="group" aria-label="Resizing">
      {RESIZE_MODES.map(([value, icon, label]) => (
        <IconButton
          key={value}
          icon={icon}
          label={label}
          pressed={mode === value}
          onClick={() => editor.history.run('Change text resizing', (tx) => nodes.forEach((n) => setTextAutoResize(tx, n, value)))}
        />
      ))}
    </div>
  );
}

/** The Typography section: font family and style, size, line height, letter spacing and alignment. */
export function TypographyFields({ nodes }: { nodes: readonly TextNode[] }) {
  const editor = useEditor();
  const size = useGesture('Change font size');
  const family = val(shared(nodes, (n) => n.fontName.family));
  const style = val(shared(nodes, (n) => n.fontName.style));
  const available = editor.textLayout?.availableFonts() ?? [{ family: 'Inter', styles: VARIABLE_FONT_STYLES }];
  const families = familyOptions(available, family, style);
  const styleOptions = families.find((f) => f.family === family)?.styles ?? [];
  const lineHeight = val(shared(nodes, (n) => formatLineHeight(n.lineHeight)));
  const letterSpacing = val(shared(nodes, (n) => formatLetterSpacing(n.letterSpacing)));
  const hAlign = shared(nodes, (n) => n.textAlignHorizontal);
  const vAlign = shared(nodes, (n) => n.textAlignVertical);
  const run = (label: string, apply: (tx: Transaction, node: TextNode) => void) => editor.history.run(label, (tx) => nodes.forEach((n) => apply(tx, n)));

  return (
    <>
      <select
        className={primitives.select}
        aria-label="Font family"
        value={family ?? ''}
        onChange={(e) => run('Change font', (tx, n) => setFontFamily(tx, n, e.target.value, families))}
      >
        {family === undefined && <option value="">Mixed</option>}
        {families.map((f) => (
          <option key={f.family} value={f.family}>
            {available.some((a) => a.family === f.family) ? f.family : `${f.family} (missing)`}
          </option>
        ))}
      </select>
      <div className={styles.grid2}>
        <select className={primitives.select} aria-label="Font style" value={style ?? ''} onChange={(e) => run('Change font style', (tx, n) => setFontStyle(tx, n, e.target.value))}>
          {(style === undefined || !styleOptions.includes(style)) && <option value={style ?? ''}>{style ?? 'Mixed'}</option>}
          {styleOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <NumberField
          label="Aa"
          ariaLabel="Font size"
          testId="field-font-size"
          min={1}
          max={10_000}
          value={val(shared(nodes, (n) => n.fontSize))}
          onGestureStart={size.start}
          onGestureEnd={size.end}
          onChange={(v) => size.change((tx) => nodes.forEach((n) => setFontSize(tx, n, v)))}
        />
      </div>
      <div className={styles.grid2}>
        <ValueField
          label="Line height"
          short="↕"
          testId="field-line-height"
          text={lineHeight ?? ''}
          parse={parseLineHeight}
          onCommit={(value) => run('Change line height', (tx, n) => setLineHeight(tx, n, value))}
        />
        <ValueField
          label="Letter spacing"
          short="|A|"
          testId="field-letter-spacing"
          text={letterSpacing ?? ''}
          parse={(input) => parseLetterSpacing(input, nodes[0]!.letterSpacing.unit)}
          onCommit={(value) => run('Change letter spacing', (tx, n) => setLetterSpacing(tx, n, value))}
        />
      </div>
      <div className={styles.buttonRow}>
        <div role="group" aria-label="Horizontal alignment" className={styles.buttonRow}>
          {H_ALIGN.map(([value, icon, label]) => (
            <IconButton key={value} icon={icon} label={label} pressed={hAlign === value} onClick={() => run('Change text alignment', (tx, n) => setTextAlignHorizontal(tx, n, value))} />
          ))}
        </div>
        <div role="group" aria-label="Vertical alignment" className={styles.buttonRow}>
          {V_ALIGN.map(([value, icon, label]) => (
            <IconButton key={value} icon={icon} label={label} pressed={vAlign === value} onClick={() => run('Change text alignment', (tx, n) => setTextAlignVertical(tx, n, value))} />
          ))}
        </div>
      </div>
    </>
  );
}

/** A text field whose value is parsed on Enter or blur (Esc restores it); empty while mixed. */
function ValueField<T>({ label, short, testId, text, parse, onCommit }: { label: string; short: string; testId: string; text: string; parse: (input: string) => T | null; onCommit: (value: T) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = parse(draft);
    setDraft(null);
    if (parsed !== null) onCommit(parsed);
  };
  return (
    <label className={styles.valueField} title={label}>
      <span aria-hidden="true">{short}</span>
      <input
        aria-label={label}
        data-testid={testId}
        value={draft ?? text}
        placeholder={text === '' ? 'Mixed' : undefined}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
