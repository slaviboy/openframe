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

import type { Transaction } from '@/core/history/history';
import { valuesEqual } from '@/core/ops/equality';
import type { LetterSpacing, LineHeight, Paint, SceneNode, TextAlignHorizontal, TextAlignVertical, TextAutoResize, TextCase, TextDecoration, TextNode } from '@/core/schema/document';
import { fontStyleName, parseFontStyle } from '@/core/text/font-style';
import { clearRunKeys, layerFieldValue, rangeValues, styleRange, TEXT_STYLE_KEYS, textSegments, type TextStyle, type TextStyleKey, type TextStyleOverrides } from '@/core/text/style-runs';
import { stepFontSize, stepFontWeight, stepLetterSpacing, stepLineHeight } from '@/core/text/typography-steps';
import { clampLevel } from '@/core/text/lists';
import { paragraphAt, paragraphRanges, paragraphStyleOffset } from '@/core/text/paragraphs';
import { textStyleAt } from '@/core/text/style-runs';
import type { OpenTypeFeatures } from '@/core/text/opentype';

/**
 * Changes a style property that holds several settings (OpenType features, axis values) over a range
 * (or the whole layer). Each stretch of text keeps its other settings; when the whole layer ends up
 * the same, the value moves to the layer.
 */
function updateSettingsStyle<K extends 'openTypeFeatures' | 'fontVariations'>(tx: Transaction, node: SceneNode, key: K, update: (value: TextStyle[K]) => TextStyle[K], range: TextRange): void {
  const text = textOf(tx, node);
  if (!text) return;
  const length = text.characters.length;
  const from = range ? Math.max(0, Math.min(range.start, range.end)) : 0;
  const to = range ? Math.min(length, Math.max(range.start, range.end)) : length;
  const whole = from <= 0 && to >= length;
  // An empty range inside the text changes nothing (empty text still takes the layer setting).
  if (to <= from && !whole) return;
  const segments = textSegments(text);
  const covered = to > from ? segments.filter((s) => s.end > from && s.start < to) : segments.slice(0, 1);
  const next = covered.map((s) => update(s[key]));
  if (whole && next.every((v) => valuesEqual(v, next[0]))) {
    setTextStyle(tx, node, { [key]: next[0]! } as TextStyleOverrides, null);
    return;
  }
  covered.forEach((segment, i) => setTextStyle(tx, node, { [key]: next[i]! } as TextStyleOverrides, { start: Math.max(from, segment.start), end: Math.min(to, segment.end) }));
}

/** Changes the OpenType features of a range (or the whole layer), keeping each stretch's other feature settings. */
export function updateOpenTypeFeatures(tx: Transaction, node: SceneNode, update: (features: OpenTypeFeatures) => OpenTypeFeatures, range: TextRange = null): void {
  updateSettingsStyle(tx, node, 'openTypeFeatures', update, range);
}

/** Sets one variable font axis value over a range (or the whole layer); null returns the axis to its default. */
export function setFontVariation(tx: Transaction, node: SceneNode, axis: string, value: number | null, range: TextRange = null): void {
  updateSettingsStyle(
    tx,
    node,
    'fontVariations',
    (variations) => {
      const next: Record<string, number> = Object.fromEntries(Object.entries(variations).filter(([tag]) => tag !== axis));
      if (value !== null) next[axis] = value;
      return next;
    },
    range,
  );
}
import type { FontName, ListType, TextDirection, WrapStyle } from '@/core/schema/document';
import { replaceFontInText } from '@/core/text/missing-fonts';
import { resolveDirection } from '@/core/text/direction';

/** Underline details for a range (or the whole layer): style, thickness (null: the font's), offset, skip ink, color (null: the text's). */
export function setUnderlineOptions(
  tx: Transaction,
  node: SceneNode,
  options: Pick<TextStyleOverrides, 'decorationStyle' | 'decorationThickness' | 'decorationOffset' | 'decorationSkipInk' | 'decorationColor'>,
  range: TextRange = null,
): void {
  if (textOf(tx, node)) setTextStyle(tx, node, options, range);
}

/** Replaces fonts everywhere in the document (layer fonts and mixed-style runs). Returns the number of text layers changed. */
export function replaceFonts(tx: Transaction, replacements: readonly { readonly from: FontName; readonly to: FontName }[]): number {
  let changed = 0;
  for (const node of [...tx.store.nodes()]) {
    if (node.type !== 'TEXT') continue;
    let current = node;
    let touched = false;
    for (const { from, to } of replacements) {
      const result = replaceFontInText(current, from, to);
      if (!result) continue;
      current = { ...current, ...result };
      touched = true;
    }
    if (!touched) continue;
    tx.set(node.id, 'fontName', current.fontName);
    tx.set(node.id, 'styleRuns', current.styleRuns);
    changed++;
  }
  return changed;
}

/**
 * Links the characters of a range (or the whole layer) to a web address and underlines them, or
 * removes their link and the underline that came with it.
 */
export function setHyperlink(tx: Transaction, node: SceneNode, url: string | null, range: TextRange = null): void {
  const text = textOf(tx, node);
  if (!text) return;
  if (url) {
    setTextStyle(tx, node, { hyperlink: { type: 'URL', value: url }, textDecoration: 'UNDERLINE' }, range);
  } else {
    const underlined = textStyleValue(text, 'textDecoration', range) === 'UNDERLINE';
    setTextStyle(tx, node, { hyperlink: null, ...(underlined ? { textDecoration: 'NONE' as const } : {}) }, range);
  }
}
import type { FontFamilyInfo } from '@/core/text/text-layout';

/**
 * Text layer properties. Style properties take an optional character range: with one, only those
 * characters change (mixed styles); without one, the whole layer does and existing overrides of
 * that property are cleared. Box sizes follow at commit (see core/text/text-resize.ts).
 */

/** A range of characters [start, end); null means the whole layer. */
export type TextRange = { readonly start: number; readonly end: number } | null;

const textOf = (tx: Transaction, node: SceneNode): TextNode | null => {
  const current = tx.store.get(node.id);
  return current?.type === 'TEXT' ? current : null;
};

/** Applies style overrides to a range, or to the whole layer. */
export function setTextStyle(tx: Transaction, node: SceneNode, overrides: TextStyleOverrides, range: TextRange = null): void {
  const text = textOf(tx, node);
  if (!text) return;
  const whole = !range || (range.start <= 0 && range.end >= text.characters.length);
  if (!whole && range.end > range.start) {
    const runs = styleRange(text, range.start, range.end, overrides);
    if (!valuesEqual(runs, text.styleRuns)) tx.set(node.id, 'styleRuns', runs);
    return;
  }
  const keys = TEXT_STYLE_KEYS.filter((key) => overrides[key] !== undefined);
  for (const key of keys) tx.set(node.id, key, layerFieldValue(key, overrides[key]!));
  const updated = tx.store.getOrThrow(node.id) as TextNode;
  const runs = clearRunKeys(updated, keys);
  if (!valuesEqual(runs, updated.styleRuns)) tx.set(node.id, 'styleRuns', runs);
}

/** The value of a style property over a range (or the whole layer): the value, or undefined when mixed. */
export function textStyleValue<K extends TextStyleKey>(node: TextNode, key: K, range: TextRange = null): TextNode[K] | undefined {
  const values = rangeValues(node, range?.start ?? 0, range?.end ?? node.characters.length, key);
  return values.length === 1 ? (values[0] as TextNode[K]) : undefined;
}

/** Font family; each run keeps its style when the family has it, otherwise Regular (or the family's first style). */
export function setFontFamily(tx: Transaction, node: SceneNode, family: string, fonts: readonly FontFamilyInfo[], range: TextRange = null): void {
  const text = textOf(tx, node);
  if (!text) return;
  const styles = fonts.find((f) => f.family === family)?.styles ?? [];
  const current = rangeValues(text, range?.start ?? 0, range?.end ?? text.characters.length, 'fontName')[0] ?? text.fontName;
  const style = styles.includes(current.style) ? current.style : styles.includes('Regular') ? 'Regular' : (styles[0] ?? current.style);
  setTextStyle(tx, node, { fontName: { family, style } }, range);
}

export function setFontStyle(tx: Transaction, node: SceneNode, style: string, range: TextRange = null): void {
  const text = textOf(tx, node);
  if (!text) return;
  const family = rangeValues(text, range?.start ?? 0, range?.end ?? text.characters.length, 'fontName')[0]?.family ?? text.fontName.family;
  setTextStyle(tx, node, { fontName: { family, style } }, range);
}

/** Font size, clamped to 1–10000 and rounded to hundredths. */
export function setFontSize(tx: Transaction, node: SceneNode, size: number, range: TextRange = null): void {
  setTextStyle(tx, node, { fontSize: Math.min(10_000, Math.max(1, Math.round(size * 100) / 100)) }, range);
}

export function setLineHeight(tx: Transaction, node: SceneNode, lineHeight: LineHeight, range: TextRange = null): void {
  setTextStyle(tx, node, { lineHeight }, range);
}

export function setLetterSpacing(tx: Transaction, node: SceneNode, letterSpacing: LetterSpacing, range: TextRange = null): void {
  setTextStyle(tx, node, { letterSpacing }, range);
}

/** Fills of a range of characters (or the whole layer). */
export function setTextFills(tx: Transaction, node: SceneNode, fills: readonly Paint[], range: TextRange = null): void {
  setTextStyle(tx, node, { fills }, range);
}

/**
 * Bold (⌘B) or italic (⌘I): turns the style on for the range unless all of it already has it, in
 * which case it turns it off, keeping the other axis.
 */
export function toggleFontStyle(tx: Transaction, node: SceneNode, axis: 'bold' | 'italic', fonts: readonly FontFamilyInfo[], range: TextRange = null): void {
  const text = textOf(tx, node);
  if (!text) return;
  const names = rangeValues(text, range?.start ?? 0, range?.end ?? text.characters.length, 'fontName');
  const parsed = names.map((n) => parseFontStyle(n.style));
  const on = axis === 'bold' ? !parsed.every((p) => p.weight >= 700) : !parsed.every((p) => p.italic);
  const family = names[0]?.family ?? text.fontName.family;
  const first = parsed[0] ?? { weight: 400, italic: false };
  const style = axis === 'bold' ? fontStyleName(on ? 700 : 400, first.italic) : fontStyleName(first.weight, on);
  const available = fonts.find((f) => f.family === family)?.styles;
  if (available && !available.includes(style)) return;
  setTextStyle(tx, node, { fontName: { family, style } }, range);
}

/** Underline or strikethrough on (or off, when all of the range already has it). */
export function toggleTextDecoration(tx: Transaction, node: SceneNode, decoration: Exclude<TextDecoration, 'NONE'>, range: TextRange = null): void {
  const text = textOf(tx, node);
  if (!text) return;
  const current = rangeValues(text, range?.start ?? 0, range?.end ?? text.characters.length, 'textDecoration');
  setTextStyle(tx, node, { textDecoration: current.every((d) => d === decoration) ? 'NONE' : decoration }, range);
}

export function setTextDecoration(tx: Transaction, node: SceneNode, decoration: TextDecoration, range: TextRange = null): void {
  setTextStyle(tx, node, { textDecoration: decoration }, range);
}

export function setTextCase(tx: Transaction, node: SceneNode, textCase: TextCase, range: TextRange = null): void {
  setTextStyle(tx, node, { textCase }, range);
}

/**
 * The characters a list change covers: every paragraph the range touches, each with its line break
 * (which carries the list on to a new empty paragraph after it). An empty first paragraph takes its
 * list from the line break before it.
 */
export function listSpan(text: string, range: { readonly start: number; readonly end: number }): { start: number; end: number } {
  const ranges = paragraphRanges(text);
  const first = paragraphAt(ranges, Math.min(range.start, range.end));
  const last = paragraphAt(ranges, Math.max(range.start, range.end));
  const start = first.end === first.start && first.start > 0 ? first.start - 1 : first.start;
  return { start, end: last.end + (last.hasBreak ? 1 : 0) };
}

/** The list type of each paragraph a range touches (every paragraph without a range). */
export function paragraphListTypes(node: TextNode, range: TextRange): ListType[] {
  const ranges = paragraphRanges(node.characters);
  const from = range ? paragraphAt(ranges, Math.min(range.start, range.end)).index : 0;
  const to = range ? paragraphAt(ranges, Math.max(range.start, range.end)).index : ranges.length - 1;
  return ranges.slice(from, to + 1).map((r) => textStyleAt(node, paragraphStyleOffset(r)).listType);
}

/** Sets the wrap style of the paragraphs a range touches (or the whole layer). */
export function setWrapStyle(tx: Transaction, node: SceneNode, wrapStyle: WrapStyle, range: TextRange = null): void {
  const text = textOf(tx, node);
  if (text) setTextStyle(tx, node, { wrapStyle }, range ? listSpan(text.characters, range) : null);
}

/** The wrap style of each paragraph a range touches (every paragraph without a range). */
export function paragraphWrapStyles(node: TextNode, range: TextRange): WrapStyle[] {
  const ranges = paragraphRanges(node.characters);
  const from = range ? paragraphAt(ranges, Math.min(range.start, range.end)).index : 0;
  const to = range ? paragraphAt(ranges, Math.max(range.start, range.end)).index : ranges.length - 1;
  return ranges.slice(from, to + 1).map((r) => textStyleAt(node, paragraphStyleOffset(r)).wrapStyle);
}

/** Hanging lists: list markers outside the text box, so item text aligns with its edge. */
export function setHangingList(tx: Transaction, node: SceneNode, hanging: boolean): void {
  if (textOf(tx, node)) tx.set(node.id, 'hangingList', hanging ? true : undefined);
}

/** Hanging quotes: an opening quotation mark starting a paragraph sits outside the text box. */
export function setHangingPunctuation(tx: Transaction, node: SceneNode, hanging: boolean): void {
  if (textOf(tx, node)) tx.set(node.id, 'hangingPunctuation', hanging ? true : undefined);
}

/** Sets the direction of the paragraphs a range touches (or the whole layer): left to right, right to left, or detected (AUTO). */
export function setTextDirection(tx: Transaction, node: SceneNode, direction: TextDirection, range: TextRange = null): void {
  const text = textOf(tx, node);
  if (text) setTextStyle(tx, node, { textDirection: direction }, range ? listSpan(text.characters, range) : null);
}

/** The direction in effect for each paragraph a range touches (every paragraph without a range). */
export function paragraphDirections(node: TextNode, range: TextRange): ('LTR' | 'RTL')[] {
  const ranges = paragraphRanges(node.characters);
  const from = range ? paragraphAt(ranges, Math.min(range.start, range.end)).index : 0;
  const to = range ? paragraphAt(ranges, Math.max(range.start, range.end)).index : ranges.length - 1;
  return ranges.slice(from, to + 1).map((r) => resolveDirection(textStyleAt(node, paragraphStyleOffset(r)).textDirection, node.characters.slice(r.start, r.end)));
}

/** Makes the paragraphs a range touches (or the whole layer) a list of a type, or no list. */
export function setListType(tx: Transaction, node: SceneNode, type: ListType, range: TextRange = null): void {
  const text = textOf(tx, node);
  if (text) setTextStyle(tx, node, { listType: type }, range ? listSpan(text.characters, range) : null);
}

/** ⌘⇧8 / ⌘⇧7: makes the paragraphs a list of that type, or removes the list when they all are one already. */
export function toggleListType(tx: Transaction, node: SceneNode, type: Exclude<ListType, 'NONE'>, range: TextRange = null): void {
  const text = textOf(tx, node);
  if (text) setListType(tx, node, paragraphListTypes(text, range).every((t) => t === type) ? 'NONE' : type, range);
}

/** Tab / ⇧Tab: the list indentation of each paragraph, within levels 1–5. Returns whether anything changed. */
export function changeIndentation(tx: Transaction, node: SceneNode, delta: 1 | -1, range: TextRange = null): boolean {
  const text = textOf(tx, node);
  if (!text) return false;
  return stepTextStyle(tx, node, 'indentation', range ? listSpan(text.characters, range) : null, (level) => {
    const next = clampLevel(level + delta);
    return next === level ? null : next;
  });
}

/** Space between consecutive list items in pixels (0 removes it). */
export function setListSpacing(tx: Transaction, node: SceneNode, spacing: number): void {
  const value = Math.min(10_000, Math.max(0, Math.round(spacing * 100) / 100));
  if (textOf(tx, node)) tx.set(node.id, 'listSpacing', value > 0 ? value : undefined);
}

/** Space between paragraphs in pixels (0 removes it). */
export function setParagraphSpacing(tx: Transaction, node: SceneNode, spacing: number): void {
  const value = Math.min(10_000, Math.max(0, Math.round(spacing * 100) / 100));
  if (textOf(tx, node)) tx.set(node.id, 'paragraphSpacing', value > 0 ? value : undefined);
}

/** First-line indent in pixels (0 removes it); it only shows on left-aligned and justified text. */
export function setParagraphIndent(tx: Transaction, node: SceneNode, indent: number): void {
  const value = Math.min(10_000, Math.max(0, Math.round(indent * 100) / 100));
  if (textOf(tx, node)) tx.set(node.id, 'paragraphIndent', value > 0 ? value : undefined);
}

/** Max lines (auto height and truncated boxes cut off with an ellipsis); undefined removes the limit. */
export function setMaxLines(tx: Transaction, node: SceneNode, maxLines: number | undefined): void {
  if (!textOf(tx, node)) return;
  tx.set(node.id, 'maxLines', maxLines === undefined ? undefined : Math.min(10_000, Math.max(1, Math.round(maxLines))));
  // A text layer can't have both max lines and a max height.
  if (maxLines !== undefined) tx.set(node.id, 'maxHeight', undefined);
}

/**
 * Steps a style property over a range (or the whole layer). Mixed values step individually: every
 * differently styled stretch changes from its own value. Returns false when nothing could change.
 */
function stepTextStyle<K extends TextStyleKey>(tx: Transaction, node: SceneNode, key: K, range: TextRange, step: (value: TextStyle[K]) => TextStyle[K] | null): boolean {
  const text = textOf(tx, node);
  if (!text) return false;
  const from = range?.start ?? 0;
  const to = range?.end ?? text.characters.length;
  const values = rangeValues(text, from, to, key);
  if (values.length <= 1 || to <= from) {
    const next = values[0] !== undefined ? step(values[0]) : null;
    if (next === null) return false;
    setTextStyle(tx, node, { [key]: next } as TextStyleOverrides, range);
    return true;
  }
  let changed = false;
  for (const segment of textSegments(text).filter((s) => s.end > from && s.start < to)) {
    const next = step(segment[key]);
    if (next === null) continue;
    setTextStyle(tx, node, { [key]: next } as TextStyleOverrides, { start: Math.max(from, segment.start), end: Math.min(to, segment.end) });
    changed = true;
  }
  return changed;
}

/** Typography shortcuts: font size by 1, weight to the next available style, letter spacing by 0.1, line height by 1. */
export function stepTextProperty(
  tx: Transaction,
  node: SceneNode,
  property: 'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight',
  direction: 1 | -1,
  context: { readonly fonts: readonly FontFamilyInfo[]; readonly autoLineHeight: (fontSize: number) => number },
  range: TextRange = null,
): boolean {
  switch (property) {
    case 'fontSize':
      return stepTextStyle(tx, node, 'fontSize', range, (size) => stepFontSize(size, direction));
    case 'letterSpacing':
      return stepTextStyle(tx, node, 'letterSpacing', range, (spacing) => stepLetterSpacing(spacing, direction));
    case 'lineHeight': {
      const text = textOf(tx, node);
      const size = text ? (rangeValues(text, range?.start ?? 0, range?.end ?? text.characters.length, 'fontSize')[0] ?? text.fontSize) : 12;
      return stepTextStyle(tx, node, 'lineHeight', range, (lineHeight) => stepLineHeight(lineHeight, context.autoLineHeight(size), direction));
    }
    case 'fontWeight':
      return stepTextStyle(tx, node, 'fontName', range, (name) => {
        const styles = context.fonts.find((f) => f.family === name.family)?.styles ?? [];
        const style = stepFontWeight(name.style, styles, direction);
        return style ? { family: name.family, style } : null;
      });
  }
}

export function setTextAlignHorizontal(tx: Transaction, node: SceneNode, align: TextAlignHorizontal): void {
  if (textOf(tx, node)) tx.set(node.id, 'textAlignHorizontal', align);
}

export function setTextAlignVertical(tx: Transaction, node: SceneNode, align: TextAlignVertical): void {
  if (textOf(tx, node)) tx.set(node.id, 'textAlignVertical', align);
}

/** Resizing: auto width and auto height fit the box to the text at commit; fixed and truncate keep it. */
export function setTextAutoResize(tx: Transaction, node: SceneNode, mode: TextAutoResize): void {
  if (textOf(tx, node)) tx.set(node.id, 'textAutoResize', mode);
}

/**
 * The resizing mode after a manual resize: changing only the width wraps auto-width text (auto
 * height); changing the height fixes the box. Fixed and truncated boxes stay as they are.
 */
export function resizedTextMode(mode: TextAutoResize, changed: { width: boolean; height: boolean }): TextAutoResize {
  if (mode === 'NONE' || mode === 'TRUNCATE') return mode;
  if (changed.height) return 'NONE';
  return changed.width ? 'HEIGHT' : mode;
}
