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

import { useCallback, useRef, useState } from 'react';
import type { Id } from '@/core/ids/ids';
import { pageHasDevStatus } from '@/editor/commands/dev-status';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { commandItem } from '../../menus/menu-model';
import { Icon } from '../../icons/Icon';
import { IconButton } from '../../primitives/IconButton';
import { Menu, type MenuEntry } from '../../primitives/Menu';
import { movePage } from '@/editor/commands/pages';
import styles from './PagesPanel.module.css';

export function PagesPanel() {
  const editor = useEditor();
  useDocumentRevision();
  const activePageId = useEditorState((s) => s.activePageId);
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [pageMenu, setPageMenu] = useState<{ id: Id; x: number; y: number } | null>(null);
  // The page being dragged, and the one it would land in front of (null once it is past the last).
  const drag = useRef<{ readonly id: Id; readonly startY: number; active: boolean; before: Id | null } | null>(null);
  const [dropBefore, setDropBefore] = useState<Id | null | undefined>(undefined);
  const listRef = useRef<HTMLUListElement>(null);
  const closePageMenu = useCallback(() => setPageMenu(null), []);
  const pages = editor.doc.pages();

  const pageMenuEntries = (id: Id): MenuEntry[] => {
    const entries: MenuEntry[] = [
      { kind: 'item', id: 'rename', label: 'Rename page', onSelect: () => setRenaming(id) },
      { kind: 'separator', id: 'sep' },
    ];
    for (const commandId of ['page.duplicate', 'page.delete']) {
      const item = commandItem(editor, commandId);
      if (item) entries.push(item);
    }
    return entries;
  };

  /** The page a drop at this height lands in front of: the row the pointer is in its top half of, else the next. */
  const dropTargetAt = (clientY: number): Id | null => {
    const list = listRef.current;
    if (!list) return null;
    for (const child of [...list.children]) {
      const row = child as HTMLElement;
      const box = row.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return row.dataset['pageId'] ?? null;
    }
    return null;
  };

  return (
    <section className={styles.panel} aria-label="Pages">
      <header className={styles.header}>
        <h2 className={styles.title}>Pages</h2>
        <IconButton icon="plus" label="Add page" onClick={() => editor.commands.run('page.add')} />
      </header>
      <ul className={styles.list} role="listbox" aria-label="Pages" ref={listRef}>
        {pages.map((id) => {
          const page = editor.doc.get(id);
          if (!page || page.type !== 'PAGE') return null;
          const active = id === activePageId;
          return (
            <li
              key={id}
              role="option"
              aria-selected={active}
              className={styles.item}
              data-active={active || undefined}
              tabIndex={active ? 0 : -1}
              data-page-id={id}
              data-drop={dropBefore === id ? 'above' : undefined}
              onPointerDown={(e) => {
                if (e.button !== 0 || (e.target as HTMLElement).closest('button,input')) return;
                drag.current = { id, startY: e.clientY, active: false, before: null };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                if (!d.active && Math.abs(e.clientY - d.startY) < 4) return;
                d.active = true;
                d.before = dropTargetAt(e.clientY);
                setDropBefore(d.before);
              }}
              onPointerUp={() => {
                const d = drag.current;
                drag.current = null;
                setDropBefore(undefined);
                if (d?.active) movePage(editor, d.id, d.before);
              }}
              onClick={() => editor.state.setActivePage(id)}
              onDoubleClick={() => setRenaming(id)}
              onContextMenu={(e) => {
                e.preventDefault();
                // Page commands act on the active page, so right-click switches to it first.
                editor.state.setActivePage(id);
                setPageMenu({ id, x: e.clientX, y: e.clientY });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'F2') setRenaming(id);
              }}
            >
              {renaming === id ? (
                <PageNameInput
                  initial={page.name}
                  onDone={(name) => {
                    setRenaming(null);
                    const trimmed = name.trim();
                    if (trimmed && trimmed !== page.name) editor.history.run('Rename page', (tx) => tx.set(id, 'name', trimmed));
                  }}
                />
              ) : (
                <>
                  <span className={styles.name}>{page.name}</span>
                  {/* Dev Mode badges the pages holding designs marked for handoff. */}
                  {pageHasDevStatus(editor, id) && <Icon name="modeDev" size={12} className={styles.devBadge} aria-label="Has designs ready for dev" />}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {pageMenu && <Menu label="Page actions" entries={pageMenuEntries(pageMenu.id)} anchor={{ x: pageMenu.x, y: pageMenu.y, width: 0, height: 0 }} placement="point" onClose={closePageMenu} />}
    </section>
  );
}

function PageNameInput({ initial, onDone }: { initial: string; onDone: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (v: string) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      className={styles.input}
      aria-label="Page name"
      value={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(value);
        if (e.key === 'Escape') finish(initial);
      }}
    />
  );
}
