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

/**
 * Plain-text editing on UTF-16 strings: a selection (anchor and focus offsets), inserting and
 * deleting by grapheme, word or paragraph, and word/paragraph ranges. Layout-dependent moves
 * (up/down, visual line start/end) live in the text layout service.
 */

/** A text selection; `anchor` stays put while `focus` moves. Collapsed when they are equal. */
export interface TextSelection {
  readonly anchor: number;
  readonly focus: number;
}

export interface TextEdit {
  readonly text: string;
  readonly selection: TextSelection;
}

export const caret = (index: number): TextSelection => ({ anchor: index, focus: index });
export const selectionStart = (s: TextSelection): number => Math.min(s.anchor, s.focus);
export const selectionEnd = (s: TextSelection): number => Math.max(s.anchor, s.focus);
export const isCollapsed = (s: TextSelection): boolean => s.anchor === s.focus;

/** Clamps a selection to a text's length. */
export function clampSelection(text: string, s: TextSelection): TextSelection {
  const clamp = (v: number) => Math.min(text.length, Math.max(0, v));
  return { anchor: clamp(s.anchor), focus: clamp(s.focus) };
}

type Granularity = 'grapheme' | 'word';

const segmenters = new Map<Granularity, Intl.Segmenter>();
function segmenter(granularity: Granularity): Intl.Segmenter {
  let s = segmenters.get(granularity);
  if (!s) {
    s = new Intl.Segmenter(undefined, { granularity });
    segmenters.set(granularity, s);
  }
  return s;
}

/** Offset of the grapheme boundary before `index` (so an emoji or combining sequence deletes whole). */
export function previousGrapheme(text: string, index: number): number {
  if (index <= 0) return 0;
  let last = 0;
  for (const { index: start } of segmenter('grapheme').segment(text)) {
    if (start >= index) break;
    last = start;
  }
  return last;
}

/** Offset of the grapheme boundary after `index`. */
export function nextGrapheme(text: string, index: number): number {
  if (index >= text.length) return text.length;
  for (const { index: start, segment } of segmenter('grapheme').segment(text)) {
    if (start + segment.length > index) return start + segment.length;
  }
  return text.length;
}

/** Start of the word at or before `index`, skipping spaces and punctuation first (⌥←). */
export function previousWord(text: string, index: number): number {
  let result = 0;
  for (const { index: start, isWordLike } of segmenter('word').segment(text)) {
    if (start >= index) break;
    if (isWordLike) result = start;
  }
  return result;
}

/** End of the word at or after `index`, skipping spaces and punctuation first (⌥→). */
export function nextWord(text: string, index: number): number {
  for (const { index: start, segment, isWordLike } of segmenter('word').segment(text)) {
    const end = start + segment.length;
    if (isWordLike && end > index) return end;
  }
  return text.length;
}

/** The word (or run of spaces or punctuation) containing `index`, as [start, end) — double-click. */
export function wordRangeAt(text: string, index: number): [number, number] {
  if (text.length === 0) return [0, 0];
  const at = Math.min(Math.max(0, index), text.length - 1);
  for (const { index: start, segment } of segmenter('word').segment(text)) {
    if (at < start + segment.length) return [start, start + segment.length];
  }
  return [text.length, text.length];
}

/** The paragraph (text between line breaks) containing `index`, as [start, end) — triple-click. */
export function paragraphRangeAt(text: string, index: number): [number, number] {
  const start = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const next = text.indexOf('\n', index);
  return [index > 0 && text[index - 1] === '\n' ? index : start, next < 0 ? text.length : next];
}

/** Replaces the selection with `insert` and puts the caret after it. */
export function replaceSelection(text: string, s: TextSelection, insert: string): TextEdit {
  const start = selectionStart(s);
  const end = selectionEnd(s);
  return { text: text.slice(0, start) + insert + text.slice(end), selection: caret(start + insert.length) };
}

/** Backspace (grapheme), ⌥⌫ (word) or ⌘⌫ (to the paragraph start); a non-empty selection is deleted as a whole. */
export function deleteBackward(text: string, s: TextSelection, unit: 'grapheme' | 'word' | 'paragraph' = 'grapheme'): TextEdit {
  if (!isCollapsed(s)) return replaceSelection(text, s, '');
  const index = s.focus;
  const from = unit === 'grapheme' ? previousGrapheme(text, index) : unit === 'word' ? previousWord(text, index) : index > 0 && text[index - 1] === '\n' ? index - 1 : paragraphRangeAt(text, index)[0];
  return replaceSelection(text, { anchor: from, focus: index }, '');
}

/** Forward delete (grapheme), ⌥⌦ (word) or to the paragraph end. */
export function deleteForward(text: string, s: TextSelection, unit: 'grapheme' | 'word' | 'paragraph' = 'grapheme'): TextEdit {
  if (!isCollapsed(s)) return replaceSelection(text, s, '');
  const index = s.focus;
  const to = unit === 'grapheme' ? nextGrapheme(text, index) : unit === 'word' ? nextWord(text, index) : text[index] === '\n' ? index + 1 : paragraphRangeAt(text, index)[1];
  return replaceSelection(text, { anchor: index, focus: to }, '');
}

/** Moves the focus to `index`; with `extend` the anchor stays (Shift), otherwise the selection collapses. */
export const moveTo = (s: TextSelection, index: number, extend: boolean): TextSelection => (extend ? { anchor: s.anchor, focus: index } : caret(index));

/**
 * ←/→ without Shift on a non-empty selection collapse it to its start/end; otherwise the focus
 * moves by one grapheme (or word with ⌥).
 */
export function moveHorizontal(text: string, s: TextSelection, direction: -1 | 1, options: { extend: boolean; word: boolean }): TextSelection {
  if (!options.extend && !isCollapsed(s)) return caret(direction < 0 ? selectionStart(s) : selectionEnd(s));
  const index =
    direction < 0
      ? options.word
        ? previousWord(text, s.focus)
        : previousGrapheme(text, s.focus)
      : options.word
        ? nextWord(text, s.focus)
        : nextGrapheme(text, s.focus);
  return moveTo(s, index, options.extend);
}
