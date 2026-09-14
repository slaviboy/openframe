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

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fuzzyFilter } from '@/editor/commands/fuzzy';
import { insertInstance, localComponents } from '@/editor/commands/insert-instance';
import type { Editor } from '@/editor/editor';
import { formatShortcut } from '@/editor/keymap/keymap';
import { IS_MAC } from '../keyboard/keyboard-controller';
import styles from './CommandPalette.module.css';

interface CommandPaletteProps {
  readonly editor: Editor;
  readonly onClose: () => void;
  /** `components` is Quick insert (⇧I): the file's components, and choosing one inserts an instance. */
  readonly mode?: 'commands' | 'components';
}

/** One row of the palette: a command to run, or a component to insert. */
interface PaletteEntry {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly shortcut: string | undefined;
  readonly enabled: () => boolean;
  readonly run: () => void;
}

const MAX_RESULTS = 50;

/**
 * Searchable list of every palette command (⌘K). Disabled commands are listed so users can
 * discover them, but cannot run. Enter runs the highlighted command; Esc closes. In `components` mode
 * (Quick insert, ⇧I) it lists the file's components instead, and Enter inserts an instance.
 */
export function CommandPalette({ editor, onClose, mode = 'commands' }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const entries = useMemo<PaletteEntry[]>(
    () =>
      mode === 'components'
        ? localComponents(editor).map((c) => ({ id: c.id, label: c.name, category: c.description ? `Component · ${c.description}` : 'Component', shortcut: undefined, enabled: () => true, run: () => void insertInstance(editor, c.id) }))
        : editor.commands
            .all()
            .filter((c) => c.palette !== false)
            .map((c) => ({ id: c.id, label: c.label, category: c.category, shortcut: c.shortcuts?.[0], enabled: () => editor.commands.isEnabled(c.id), run: () => void editor.commands.run(c.id) })),
    [editor, mode],
  );
  const results = useMemo(() => fuzzyFilter(entries, query, (e) => `${e.label} ${e.category}`).slice(0, MAX_RESULTS), [entries, query]);
  const components = mode === 'components';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      // Keep focus on anything the executed command focused (e.g. a rename field).
      const current = document.activeElement;
      if (previous?.isConnected && (current === null || current === document.body)) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const run = (entry: PaletteEntry | undefined) => {
    if (!entry || !entry.enabled()) return;
    onClose();
    entry.run();
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={components ? 'Quick insert' : 'Command palette'} className={styles.dialog}>
        <input
          ref={inputRef}
          className={styles.input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
          aria-label={components ? 'Search components' : 'Search commands'}
          placeholder={components ? 'Search components' : 'Search commands'}
          value={query}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(results[active]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul ref={listRef} id={listId} role="listbox" aria-label={components ? 'Components' : 'Commands'} className={styles.list}>
          {results.length === 0 && <li className={styles.empty}>{components ? 'No matching components' : 'No matching commands'}</li>}
          {results.map((command, index) => {
            const enabled = command.enabled();
            const shortcut = command.shortcut;
            return (
              <li
                key={command.id}
                id={`${listId}-${command.id}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={!enabled || undefined}
                className={styles.option}
                data-active={index === active || undefined}
                data-disabled={!enabled || undefined}
                onPointerEnter={() => setActive(index)}
                onClick={() => run(command)}
              >
                <span className={styles.label}>{command.label}</span>
                <span className={styles.category}>{command.category}</span>
                {shortcut && <kbd className={styles.shortcut}>{formatShortcut(shortcut, IS_MAC)}</kbd>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
