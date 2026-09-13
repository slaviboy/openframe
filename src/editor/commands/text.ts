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
import type { LetterSpacing, LineHeight, Paint, SceneNode, TextAlignHorizontal, TextAlignVertical, TextAutoResize, TextNode } from '@/core/schema/document';
import { fontStyleName, parseFontStyle } from '@/core/text/font-style';
import { clearRunKeys, rangeValues, styleRange, TEXT_STYLE_KEYS, type TextStyleKey, type TextStyleOverrides } from '@/core/text/style-runs';
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
  for (const key of keys) tx.set(node.id, key, overrides[key]);
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
