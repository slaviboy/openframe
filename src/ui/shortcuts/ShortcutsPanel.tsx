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

import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import type { CommandCategory } from '@/editor/commands/registry';
import type { Editor } from '@/editor/editor';
import { formatShortcut, shortcutFromEvent } from '@/editor/keymap/keymap';
import { IS_MAC } from '../keyboard/keyboard-controller';
import { IconButton } from '../primitives/IconButton';
import { shortcutGroups } from './shortcut-groups';
import { shortcutOverrides } from './shortcut-overrides';
import { shortcutUsage } from './shortcut-usage';
import styles from './ShortcutsPanel.module.css';

interface ShortcutsPanelProps {
  readonly editor: Editor;
  readonly onClose: () => void;
}

/**
 * Keyboard shortcuts panel (⌃⇧?): docked along the bottom of the window so work can continue
 * while it is open. Tabs group shortcuts by category; shortcuts already pressed are highlighted
 * and update live.
 */
export function ShortcutsPanel({ editor, onClose }: ShortcutsPanelProps) {
  const groups = useMemo(() => shortcutGroups(editor.commands.all()), [editor]);
  const [tab, setTab] = useState<CommandCategory>(groups[0]?.category ?? 'Tools');
  const { used } = useSyncExternalStore(shortcutUsage.subscribe, shortcutUsage.getSnapshot);
  const { overrides } = useSyncExternalStore(shortcutOverrides.subscribe, shortcutOverrides.getSnapshot);
  // The command whose shortcut is being set: the next key pressed becomes it.
  const [listening, setListening] = useState<string | null>(null);
  const baseId = useId();
  const current = groups.find((g) => g.category === tab) ?? groups[0];

  return (
    <section className={styles.panel} aria-label="Keyboard shortcuts">
      <header className={styles.header}>
        <h2 className={styles.title}>Keyboard shortcuts</h2>
        <div className={styles.tabs} role="tablist" aria-label="Shortcut categories">
          {groups.map((group) => (
            <button
              key={group.category}
              type="button"
              role="tab"
              id={`${baseId}-tab-${group.category}`}
              aria-selected={group.category === current?.category}
              aria-controls={`${baseId}-panel`}
              className={styles.tab}
              onClick={() => setTab(group.category)}
            >
              {group.category}
            </button>
          ))}
        </div>
        {Object.keys(overrides).length > 0 && (
          <button type="button" className={styles.tab} onClick={() => shortcutOverrides.clear()}>
            Reset all
          </button>
        )}
        <IconButton icon="close" label="Close keyboard shortcuts" onClick={onClose} />
      </header>
      {current && (
        <ul id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${current.category}`} className={styles.grid}>
          {current.items.map((item) => (
            <li key={item.id} className={styles.item} data-used={used.has(item.id) || undefined}>
              <span className={styles.label}>{item.label}</span>
              {/* Clicking the keys listens for the next press and makes that the command's shortcut. */}
              <button
                type="button"
                className={styles.keys}
                aria-label={listening === item.id ? `Press the new shortcut for ${item.label}` : `Change the shortcut for ${item.label}`}
                data-listening={listening === item.id || undefined}
                onClick={(e) => {
                  // Safari doesn't focus a button when it is clicked, and the key press has to reach it.
                  e.currentTarget.focus();
                  setListening((current) => (current === item.id ? null : item.id));
                }}
                onKeyDown={(e) => {
                  if (listening !== item.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.key === 'Escape') {
                    setListening(null);
                    return;
                  }
                  // Backspace on its own gives the command its own shortcut back.
                  const chord = e.key === 'Backspace' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey ? null : shortcutFromEvent(e, IS_MAC);
                  if (chord === null && e.key !== 'Backspace') return;
                  shortcutOverrides.set(item.id, chord);
                  setListening(null);
                }}
              >
                {listening === item.id ? (
                  <kbd className={styles.kbd}>Press a key…</kbd>
                ) : (
                  (overrides[item.id] ?? item.shortcuts).map((shortcut) => (
                    <kbd key={shortcut} className={styles.kbd} data-custom={overrides[item.id] ? true : undefined}>
                      {formatShortcut(shortcut, IS_MAC)}
                    </kbd>
                  ))
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
