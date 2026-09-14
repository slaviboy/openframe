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

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { EmojiEntry } from '@/core/text/emoji-search';
import { textEditTarget } from '@/editor/interactions/text-edit';
import { useDocumentRevision, useEditor, useEditorState } from '../hooks/useEditor';
import { placeFloating, type Box } from '../primitives/position';
import { emojiSuggest, type EmojiSuggestion } from './emoji-suggest';
import styles from './LinkPopover.module.css';
import { focusText, rangeBox } from './text-anchor';

/** The list of emoji for a ":name" typed in the text being edited, below the search. */
export function EmojiSuggestions() {
  const editor = useEditor();
  useEditorState((s) => s.textEdit);
  useEditorState((s) => s.viewports);
  useDocumentRevision();
  useSyncExternalStore(emojiSuggest.subscribe, emojiSuggest.getSnapshot);
  const searching = emojiSuggest.query(editor) !== null;
  // The emoji data loads the first time a search is typed.
  useEffect(() => {
    if (searching) emojiSuggest.load();
  }, [searching]);
  const suggestion = emojiSuggest.current(editor);
  const target = textEditTarget(editor);
  if (!suggestion || !target) return null;
  const anchor = rangeBox(editor, target.node, suggestion.start, suggestion.end);
  if (!anchor) return null;
  return <SuggestionList key={suggestion.key} anchor={anchor} suggestion={suggestion} onPick={(item) => emojiSuggest.accept(editor, suggestion, item)} />;
}

function SuggestionList({ anchor, suggestion, onPick }: { anchor: Box; suggestion: EmojiSuggestion; onPick: (item: EmojiEntry) => void }) {
  const ref = useRef<HTMLUListElement>(null);
  const { x, y, width, height } = anchor;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const p = placeFloating({ x, y, width, height }, element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, 'bottom-start', 8, 6);
    element.style.left = `${p.x}px`;
    element.style.top = `${p.y}px`;
    element.style.visibility = 'visible';
  }, [x, y, width, height]);

  return (
    <ul ref={ref} className={`${styles.popover} ${styles.suggestions}`} role="listbox" aria-label="Emoji">
      {suggestion.items.map((item, i) => (
        <li
          key={item.emoji}
          role="option"
          aria-selected={i === suggestion.highlight}
          className={styles.suggestion}
          // Picking keeps the focus in the text being edited.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onPick(item);
            focusText();
          }}
        >
          <span className={styles.emoji}>{item.emoji}</span>
          <span>{item.shortcodes[0] ? `:${item.shortcodes[0]}:` : item.name}</span>
        </li>
      ))}
    </ul>
  );
}
