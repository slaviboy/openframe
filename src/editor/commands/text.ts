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
import type { LetterSpacing, LineHeight, SceneNode, TextAlignHorizontal, TextAlignVertical, TextAutoResize, TextNode } from '@/core/schema/document';
import type { FontFamilyInfo } from '@/core/text/text-layout';

/** Text layer properties. Box sizes follow at commit (see core/text/text-resize.ts). */

const textOf = (tx: Transaction, node: SceneNode): TextNode | null => {
  const current = tx.store.get(node.id);
  return current?.type === 'TEXT' ? current : null;
};

/** Font family; keeps the style when the family has it, otherwise Regular (or the family's first style). */
export function setFontFamily(tx: Transaction, node: SceneNode, family: string, fonts: readonly FontFamilyInfo[]): void {
  const text = textOf(tx, node);
  if (!text) return;
  const styles = fonts.find((f) => f.family === family)?.styles ?? [];
  const style = styles.includes(text.fontName.style) ? text.fontName.style : styles.includes('Regular') ? 'Regular' : (styles[0] ?? text.fontName.style);
  tx.set(node.id, 'fontName', { family, style });
}

export function setFontStyle(tx: Transaction, node: SceneNode, style: string): void {
  const text = textOf(tx, node);
  if (text) tx.set(node.id, 'fontName', { family: text.fontName.family, style });
}

/** Font size, clamped to 1–10000 and rounded to hundredths. */
export function setFontSize(tx: Transaction, node: SceneNode, size: number): void {
  if (textOf(tx, node)) tx.set(node.id, 'fontSize', Math.min(10_000, Math.max(1, Math.round(size * 100) / 100)));
}

export function setLineHeight(tx: Transaction, node: SceneNode, lineHeight: LineHeight): void {
  if (textOf(tx, node)) tx.set(node.id, 'lineHeight', lineHeight);
}

export function setLetterSpacing(tx: Transaction, node: SceneNode, letterSpacing: LetterSpacing): void {
  if (textOf(tx, node)) tx.set(node.id, 'letterSpacing', letterSpacing);
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
