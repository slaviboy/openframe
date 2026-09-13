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
import { formatShortcut } from '@/editor/keymap/keymap';
import { IS_MAC } from '../keyboard/keyboard-controller';
import { IconButton } from '../primitives/IconButton';
import { shortcutGroups } from './shortcut-groups';
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
        <IconButton icon="close" label="Close keyboard shortcuts" onClick={onClose} />
      </header>
      {current && (
        <ul id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${current.category}`} className={styles.grid}>
          {current.items.map((item) => (
            <li key={item.id} className={styles.item} data-used={used.has(item.id) || undefined}>
              <span className={styles.label}>{item.label}</span>
              <span className={styles.keys}>
                {item.shortcuts.map((shortcut) => (
                  <kbd key={shortcut} className={styles.kbd}>
                    {formatShortcut(shortcut, IS_MAC)}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
