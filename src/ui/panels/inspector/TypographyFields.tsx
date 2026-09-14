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

import { useState, useSyncExternalStore } from 'react';
import { usedFontFamilies } from '@/core/text/document-fonts';
import { FONT_ACCEPT, readFontFiles } from '../../fonts/import-fonts';
import { canListInstalledFonts, knownInstalledFamilies, listInstalledFamilies, readInstalledFamily } from '../../fonts/local-fonts';
import type { Box } from '../../primitives/position';
import { FontPicker, type FontPickerFamily } from './FontPicker';
import { OpenTypeFields } from './OpenTypeFields';
import { VariableAxesFields } from './VariableAxesFields';
import type { Transaction } from '@/core/history/history';
import { valuesEqual } from '@/core/ops/equality';
import type { TextAlignHorizontal, TextAlignVertical, TextAutoResize, TextNode } from '@/core/schema/document';
import { VARIABLE_FONT_STYLES } from '@/core/text/font-style';
import { rangeValues, type TextStyle, type TextStyleKey } from '@/core/text/style-runs';
import type { FontFamilyInfo } from '@/core/text/text-layout';
import { formatLetterSpacing, formatLineHeight, parseLetterSpacing, parseLineHeight } from '@/core/text/text-values';
import { shared } from '@/editor/commands/properties';
import {
  setFontFamily,
  setFontSize,
  setFontStyle,
  setLetterSpacing,
  setLineHeight,
  setMaxLines,
  setParagraphIndent,
  setParagraphSpacing,
  setTextAlignHorizontal,
  setTextAlignVertical,
  setTextAutoResize,
  setTextCase,
  toggleTextDecoration,
  type TextRange,
} from '@/editor/commands/text';
import { TEXT_CASE_LABELS } from '@/core/text/letter-case';
import type { TextCase } from '@/core/schema/document';
import { textSelectionRange, textStyleRange } from '@/editor/interactions/text-edit';
import {
  changeIndentation,
  paragraphDirections,
  paragraphListTypes,
  paragraphWrapStyles,
  setHangingList,
  setListSpacing,
  setListType,
  setTextDirection,
  setWrapStyle,
} from '@/editor/commands/text';
import { containsRtl } from '@/core/text/direction';
import type { ListType, WrapStyle } from '@/core/schema/document';

const LIST_OPTIONS: readonly (readonly [ListType, string])[] = [
  ['NONE', 'No list'],
  ['UNORDERED', 'Bulleted list'],
  ['ORDERED', 'Numbered list'],
];

const WRAP_OPTIONS: readonly (readonly [WrapStyle, string])[] = [
  ['AUTO', 'Wrap: Auto'],
  ['BALANCE', 'Wrap: Balance'],
  ['PRETTY', 'Wrap: Pretty'],
];
import type { IconName } from '../../icons/Icon';
import { useEditor, useEditorState } from '../../hooks/useEditor';
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

/** Families to offer: the available fonts, plus the selection's family when it is not available (a missing font). */
function familyOptions(available: readonly FontFamilyInfo[], family: string | undefined, style: string | undefined): readonly FontFamilyInfo[] {
  if (family === undefined || available.some((f) => f.family === family)) return available;
  return [...available, { family, styles: [style ?? 'Regular'] }];
}

/** Every distinct value of a style property over the range (or each whole layer). */
function valuesOf<K extends TextStyleKey>(nodes: readonly TextNode[], range: TextRange, key: K): TextStyle[K][] {
  const values: TextStyle[K][] = [];
  for (const node of nodes) {
    for (const v of rangeValues(node, range?.start ?? 0, range?.end ?? node.characters.length, key)) {
      if (!values.some((existing) => valuesEqual(existing, v))) values.push(v);
    }
  }
  return values;
}

/** The single value of a list, or undefined when there are several (mixed). */
const single = <T,>(values: readonly T[]): T | undefined => (values.length === 1 ? values[0] : undefined);

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

/**
 * The Typography section: font family and style, size, line height, letter spacing and alignment.
 * While a single layer's text is being edited with characters selected, the style properties show
 * and change those characters (mixed styles); otherwise they apply to whole layers.
 */
export function TypographyFields({ nodes }: { nodes: readonly TextNode[] }) {
  const editor = useEditor();
  const size = useGesture('Change font size');
  // Re-render as the text selection changes.
  useEditorState((s) => s.textEdit);
  const range = nodes.length === 1 ? textStyleRange(editor, nodes[0]!.id) : null;
  const fontNames = valuesOf(nodes, range, 'fontName');
  const family = single([...new Set(fontNames.map((f) => f.family))]);
  const style = single([...new Set(fontNames.map((f) => f.style))]);
  const available = editor.textLayout?.availableFonts() ?? [{ family: 'Inter', styles: VARIABLE_FONT_STYLES }];
  const families = familyOptions(available, family, style);
  const styleOptions = families.find((f) => f.family === family)?.styles ?? [];
  const lineHeight = single(valuesOf(nodes, range, 'lineHeight'));
  const letterSpacings = valuesOf(nodes, range, 'letterSpacing');
  const letterSpacing = single(letterSpacings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const decoration = single(valuesOf(nodes, range, 'textDecoration'));
  const textCase = single(valuesOf(nodes, range, 'textCase'));
  const maxLinesValues = [...new Set(nodes.map((n) => n.maxLines))];
  const maxLines = maxLinesValues.length === 1 ? maxLinesValues[0] : undefined;
  const paragraphSpacing = single([...new Set(nodes.map((n) => n.paragraphSpacing ?? 0))]);
  const paragraphIndent = single([...new Set(nodes.map((n) => n.paragraphIndent ?? 0))]);
  // Lists belong to paragraphs: while editing, the paragraphs under the caret or selection.
  const listRange = nodes.length === 1 ? textSelectionRange(editor, nodes[0]!.id) : null;
  const listType = single([...new Set(nodes.flatMap((n) => paragraphListTypes(n, listRange)))]);
  const listSpacing = single([...new Set(nodes.map((n) => n.listSpacing ?? 0))]);
  // Direction controls appear once right-to-left script is in the text; like lists they apply to paragraphs.
  const hasRtl = nodes.some((n) => containsRtl(n.characters));
  const direction = single([...new Set(nodes.flatMap((n) => paragraphDirections(n, listRange)))]);
  const wrapStyle = single([...new Set(nodes.flatMap((n) => paragraphWrapStyles(n, listRange)))]);
  const hangingList = single([...new Set(nodes.map((n) => n.hangingList ?? false))]);
  const hAlign = shared(nodes, (n) => n.textAlignHorizontal);
  const vAlign = shared(nodes, (n) => n.textAlignVertical);
  const run = (label: string, apply: (tx: Transaction, node: TextNode) => void) => editor.history.run(label, (tx) => nodes.forEach((n) => apply(tx, n)));

  return (
    <>
      <FamilyControl nodes={nodes} range={range} family={family} available={available} />
      <div className={styles.grid2}>
        <select className={primitives.select} aria-label="Font style" value={style ?? ''} onChange={(e) => run('Change font style', (tx, n) => setFontStyle(tx, n, e.target.value, range))}>
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
          value={single(valuesOf(nodes, range, 'fontSize'))}
          onGestureStart={size.start}
          onGestureEnd={size.end}
          onChange={(v) => size.change((tx) => nodes.forEach((n) => setFontSize(tx, n, v, range)))}
        />
      </div>
      <div className={styles.grid2}>
        <ValueField
          label="Line height"
          short="↕"
          testId="field-line-height"
          text={lineHeight ? formatLineHeight(lineHeight) : ''}
          parse={parseLineHeight}
          onCommit={(value) => run('Change line height', (tx, n) => setLineHeight(tx, n, value, range))}
        />
        <ValueField
          label="Letter spacing"
          short="|A|"
          testId="field-letter-spacing"
          text={letterSpacing ? formatLetterSpacing(letterSpacing) : ''}
          parse={(input) => parseLetterSpacing(input, letterSpacings[0]?.unit ?? 'PERCENT')}
          onCommit={(value) => run('Change letter spacing', (tx, n) => setLetterSpacing(tx, n, value, range))}
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
      {hasRtl && (
        <div role="group" aria-label="Text direction" className={styles.buttonRow}>
          <IconButton icon="textLtr" label="Left to right" pressed={direction === 'LTR'} onClick={() => run('Use left to right text direction', (tx, n) => setTextDirection(tx, n, 'LTR', listRange))} />
          <IconButton icon="textRtl" label="Right to left" pressed={direction === 'RTL'} onClick={() => run('Use right to left text direction', (tx, n) => setTextDirection(tx, n, 'RTL', listRange))} />
        </div>
      )}
      <div className={styles.buttonRow}>
        <button type="button" className={styles.disclosure} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
          Type settings
        </button>
        {nodes.length === 1 && <IconButton icon="link" label="Create link" onClick={() => editor.commands.run('text.createLink')} />}
      </div>
      {settingsOpen && (
        <div className={styles.typeSettings} role="group" aria-label="Type settings">
          <div className={styles.buttonRow} role="group" aria-label="Decoration">
            <IconButton icon="underline" label="Underline" pressed={decoration === 'UNDERLINE'} onClick={() => run('Underline', (tx, n) => toggleTextDecoration(tx, n, 'UNDERLINE', range))} />
            <IconButton icon="strikethrough" label="Strikethrough" pressed={decoration === 'STRIKETHROUGH'} onClick={() => run('Strikethrough', (tx, n) => toggleTextDecoration(tx, n, 'STRIKETHROUGH', range))} />
          </div>
          <select className={primitives.select} aria-label="Letter case" value={textCase ?? ''} onChange={(e) => run('Change letter case', (tx, n) => setTextCase(tx, n, e.target.value as TextCase, range))}>
            {textCase === undefined && <option value="">Mixed</option>}
            {(Object.keys(TEXT_CASE_LABELS) as TextCase[]).map((value) => (
              <option key={value} value={value}>
                {TEXT_CASE_LABELS[value]}
              </option>
            ))}
          </select>
          <div className={styles.grid2}>
            <select className={primitives.select} aria-label="List style" value={listType ?? ''} onChange={(e) => run('Change list style', (tx, n) => setListType(tx, n, e.target.value as ListType, listRange))}>
              {listType === undefined && <option value="">Mixed</option>}
              {LIST_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className={styles.buttonRow} role="group" aria-label="Indentation">
              <IconButton
                icon="outdent"
                label="Decrease indentation"
                onClick={() =>
                  run('Decrease indentation', (tx, n) => {
                    changeIndentation(tx, n, -1, listRange);
                  })
                }
              />
              <IconButton
                icon="indent"
                label="Increase indentation"
                onClick={() =>
                  run('Increase indentation', (tx, n) => {
                    changeIndentation(tx, n, 1, listRange);
                  })
                }
              />
            </div>
          </div>
          <NumberField
            label="•↕"
            ariaLabel="List spacing"
            testId="field-list-spacing"
            min={0}
            max={10_000}
            value={listSpacing}
            onChange={(v) => run('Change list spacing', (tx, n) => setListSpacing(tx, n, v))}
          />
          <label className={styles.checkbox}>
            <input type="checkbox" checked={hangingList === true} onChange={(e) => run('Change hanging lists', (tx, n) => setHangingList(tx, n, e.target.checked))} />
            Hanging lists
          </label>
          <select className={primitives.select} aria-label="Wrap style" value={wrapStyle ?? ''} onChange={(e) => run('Change wrap style', (tx, n) => setWrapStyle(tx, n, e.target.value as WrapStyle, listRange))}>
            {wrapStyle === undefined && <option value="">Mixed</option>}
            {WRAP_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className={styles.grid2}>
            <NumberField
              label="¶↕"
              ariaLabel="Paragraph spacing"
              testId="field-paragraph-spacing"
              min={0}
              max={10_000}
              value={paragraphSpacing}
              onChange={(v) => run('Change paragraph spacing', (tx, n) => setParagraphSpacing(tx, n, v))}
            />
            <NumberField
              label="¶→"
              ariaLabel="Paragraph indent"
              testId="field-paragraph-indent"
              min={0}
              max={10_000}
              value={paragraphIndent}
              // Only left-aligned and justified text is indented.
              disabled={hAlign !== 'LEFT' && hAlign !== 'JUSTIFIED'}
              onChange={(v) => run('Change paragraph indent', (tx, n) => setParagraphIndent(tx, n, v))}
            />
          </div>
          <div className={styles.buttonRow}>
            <NumberField
              label="≡"
              ariaLabel="Max lines"
              testId="field-max-lines"
              min={1}
              max={10_000}
              decimals={0}
              value={maxLines}
              onChange={(v) => run('Change max lines', (tx, n) => setMaxLines(tx, n, v))}
            />
            {maxLines !== undefined && <IconButton icon="minus" label="Remove max lines" onClick={() => run('Remove max lines', (tx, n) => setMaxLines(tx, n, undefined))} />}
          </div>
          <VariableAxesFields nodes={nodes} range={range} fonts={fontNames} />
          <OpenTypeFields nodes={nodes} range={range} fonts={fontNames} />
        </div>
      )}
    </>
  );
}

/**
 * The font family button and its font picker. Hovering a family previews it on the selection
 * within one gesture; picking commits that gesture as one undo step. Installed families are loaded
 * when picked; uploaded fonts are read, stored and registered.
 */
function FamilyControl({ nodes, range, family, available }: { nodes: readonly TextNode[]; range: TextRange; family: string | undefined; available: readonly FontFamilyInfo[] }) {
  const editor = useEditor();
  const preview = useGesture('Change font');
  const [anchor, setAnchor] = useState<Box | null>(null);
  const [installed, setInstalled] = useState<readonly string[]>(knownInstalledFamilies);
  const [error, setError] = useState<string | null>(null);
  // Re-render when fonts are added (the engine registers them first).
  useSyncExternalStore(
    (listener) => editor.fonts.subscribe(listener),
    () => editor.fonts.revision,
  );
  const fonts = editor.textLayout?.availableFonts() ?? available;
  const names = new Set(fonts.map((f) => f.family));
  const used = anchor ? usedFontFamilies(editor.doc) : [];
  const entries: FontPickerFamily[] = [
    ...fonts.map((f) => ({ family: f.family, user: f.user ?? false, variable: f.variable ?? false, inFile: used.includes(f.family) })),
    ...installed.filter((f) => !names.has(f)).map((f) => ({ family: f, user: true, variable: false, inFile: used.includes(f), notLoaded: true })),
    ...(family !== undefined && !names.has(family) && !installed.includes(family) ? [{ family, user: false, variable: false, inFile: true }] : []),
  ].sort((a, b) => a.family.localeCompare(b.family));
  const apply = (target: string) => (tx: Transaction) => {
    const current = editor.textLayout?.availableFonts() ?? fonts;
    nodes.forEach((n) => setFontFamily(tx, n, target, current, range));
  };
  const commit = (target: string) => {
    preview.start();
    preview.change(apply(target));
    preview.end();
  };

  return (
    <>
      <button
        type="button"
        className={styles.fontButton}
        aria-label="Font family"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
        }}
      >
        <span style={family ? { fontFamily: `"${family}", var(--font-ui, sans-serif)` } : undefined}>{family ?? 'Mixed'}</span>
        {family !== undefined && !names.has(family) && <span className={styles.missing}>Missing</span>}
      </button>
      {error && (
        <p role="alert" className={styles.hint}>
          {error}
        </p>
      )}
      {anchor && (
        <FontPicker
          anchor={anchor}
          families={entries}
          current={family}
          accept={FONT_ACCEPT}
          onPreview={(target) => {
            if (target === null) {
              preview.cancel();
              return;
            }
            preview.start();
            preview.change(apply(target));
          }}
          onPick={(target) => {
            if (!names.has(target) && installed.includes(target)) {
              preview.cancel();
              void readInstalledFamily(target)
                .then((loaded) => editor.fonts.add(loaded))
                .then(
                  () => commit(target),
                  (e: unknown) => setError(e instanceof Error ? e.message : 'The installed font could not be read.'),
                );
            } else {
              commit(target);
            }
          }}
          onClose={() => setAnchor(null)}
          onUpload={(files) => {
            void readFontFiles(files, (bytes) => editor.textLayout?.fontFamilyOf?.(bytes) ?? null)
              .then(async ({ fonts: read, errors }) => {
                setError(errors.length > 0 ? errors.join(' ') : null);
                await editor.fonts.add(read);
              })
              .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The fonts could not be added.'));
          }}
          onListInstalled={
            canListInstalledFonts()
              ? () => {
                  void listInstalledFamilies().then(setInstalled, () => setError('Installed fonts could not be listed.'));
                }
              : undefined
          }
        />
      )}
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
