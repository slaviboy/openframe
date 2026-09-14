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

import { buildEmojiIndex, emojiQuery, searchEmoji, type EmojiEntry, type EmojiIndex } from '@/core/text/emoji-search';
import type { Editor } from '@/editor/editor';
import { insertText, setTextSelection, textEditTarget } from '@/editor/interactions/text-edit';
import { Observable } from '@/editor/stores/observable';

/** Emoji suggestions for a ":name" typed before the caret. */
export interface EmojiSuggestion {
  /** Identifies the search (layer, where the colon is, and the query), so dismissing and highlighting stick to it. */
  readonly key: string;
  readonly start: number;
  readonly end: number;
  readonly items: readonly EmojiEntry[];
  readonly highlight: number;
}

interface SuggestState {
  readonly index: EmojiIndex | null;
  readonly loading: boolean;
  readonly highlightKey: string | null;
  readonly highlight: number;
  readonly dismissedKey: string | null;
}

/** Loads the English emoji names and GitHub shortcodes (a separate chunk, never the network). */
async function loadEmojiIndex(): Promise<EmojiIndex> {
  const [compact, shortcodes] = await Promise.all([import('emojibase-data/en/compact.json'), import('emojibase-data/en/shortcodes/github.json')]);
  return buildEmojiIndex(compact.default, shortcodes.default);
}

/**
 * Emoji suggestions while editing text: typing ":" and a name lists matching emoji; ↑/↓ move the
 * highlight, Return or Tab replaces the search with the emoji, Esc dismisses the list until the
 * search changes.
 */
class EmojiSuggestStore extends Observable<SuggestState> {
  constructor() {
    super({ index: null, loading: false, highlightKey: null, highlight: 0, dismissedKey: null });
  }

  /** The search before the caret of the text being edited, when there is one (whether or not the data is loaded). */
  query(editor: Editor): { key: string; start: number; end: number; query: string } | null {
    const target = textEditTarget(editor);
    if (!target || target.selection.anchor !== target.selection.focus) return null;
    const end = target.selection.focus;
    const found = emojiQuery(target.node.characters.slice(0, end));
    if (!found) return null;
    const start = end - found.length;
    return { key: `${target.node.id}:${start}:${found.query}`, start, end, query: found.query };
  }

  current(editor: Editor): EmojiSuggestion | null {
    const found = this.query(editor);
    const { index, dismissedKey, highlightKey, highlight } = this.state;
    if (!found || !index || dismissedKey === found.key) return null;
    const items = searchEmoji(index, found.query, 8);
    if (items.length === 0) return null;
    return { key: found.key, start: found.start, end: found.end, items, highlight: highlightKey === found.key ? Math.min(highlight, items.length - 1) : 0 };
  }

  /** Loads the emoji data once. */
  load(): void {
    if (this.state.index || this.state.loading) return;
    this.setState({ loading: true });
    loadEmojiIndex()
      .then((index) => this.setState({ index, loading: false }))
      .catch((error: unknown) => {
        console.error(error);
        this.setState({ loading: false });
      });
  }

  accept(editor: Editor, suggestion: EmojiSuggestion, item: EmojiEntry): void {
    setTextSelection(editor, { anchor: suggestion.start, focus: suggestion.end });
    insertText(editor, item.emoji);
  }

  /** Keys for the open list, from the text input; returns whether the key was used. */
  handleKey(e: KeyboardEvent, editor: Editor): boolean {
    const suggestion = this.current(editor);
    if (!suggestion || e.altKey || e.metaKey || e.ctrlKey) return false;
    const count = suggestion.items.length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        this.setState({ highlightKey: suggestion.key, highlight: (suggestion.highlight + (e.key === 'ArrowDown' ? 1 : -1) + count) % count });
        return true;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        this.accept(editor, suggestion, suggestion.items[suggestion.highlight]!);
        return true;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.setState({ dismissedKey: suggestion.key });
        return true;
      default:
        return false;
    }
  }
}

export const emojiSuggest = new EmojiSuggestStore();
