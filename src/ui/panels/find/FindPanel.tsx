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

import { useState } from 'react';
import { findLayers, type FindCategory, type FindResult } from '@/core/document/find';
import { isSceneNode } from '@/core/schema/document';
import { Icon } from '../../icons/Icon';
import { layerIcon } from '../../icons/layer-icons';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { IconButton } from '../../primitives/IconButton';
import styles from './FindPanel.module.css';

const FILTERS: readonly [FindCategory, string][] = [
  ['frame', 'Frames'],
  ['section', 'Sections'],
  ['group', 'Groups'],
  ['text', 'Text'],
  ['shape', 'Shapes'],
  ['slice', 'Slices'],
];

/**
 * Find (⌘F): searches layer names on this page or all pages, optionally filtered by layer
 * type. Clicking a result (or ↑/↓, Enter for the next result) selects it, switching page and
 * bringing it into view. Esc or the close button returns to the layers panel.
 */
export function FindPanel() {
  const editor = useEditor();
  useDocumentRevision();
  const pageId = useEditorState((s) => s.activePageId);
  const selection = useEditorState((s) => s.selection);
  const [query, setQuery] = useState('');
  const [allPages, setAllPages] = useState(false);
  const [filters, setFilters] = useState<ReadonlySet<FindCategory>>(new Set());

  const results = findLayers(editor.doc, allPages ? editor.doc.pages() : [pageId], query, filters);
  const active = selection.length === 1 ? results.findIndex((r) => r.id === selection[0]) : -1;

  const choose = (result: FindResult) => {
    if (result.pageId !== editor.pageId) editor.state.setActivePage(result.pageId);
    editor.state.select([result.id]);
    editor.revealRect(editor.selectionBounds([result.id]));
  };

  const step = (direction: 1 | -1) => {
    if (results.length === 0) return;
    const index = active < 0 ? (direction === 1 ? 0 : results.length - 1) : (active + direction + results.length) % results.length;
    choose(results[index]!);
  };

  const close = () => editor.state.setFindOpen(false);

  const toggleFilter = (category: FindCategory) =>
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <section className={styles.panel} aria-label="Find">
      <header className={styles.header}>
        <Icon name="search" size={16} className={styles.searchIcon} />
        <input
          className={styles.input}
          type="search"
          aria-label="Find layers"
          placeholder="Find layers"
          value={query}
          autoFocus
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
              e.preventDefault();
              step(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              step(-1);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        <IconButton icon="close" label="Close find" onClick={close} />
      </header>
      <div className={styles.options}>
        <div className={styles.scope} role="group" aria-label="Search in">
          <button type="button" className={styles.chip} aria-pressed={!allPages} onClick={() => setAllPages(false)}>
            This page
          </button>
          <button type="button" className={styles.chip} aria-pressed={allPages} onClick={() => setAllPages(true)}>
            All pages
          </button>
        </div>
        <div className={styles.filters} role="group" aria-label="Layer types">
          {FILTERS.map(([category, label]) => (
            <button key={category} type="button" className={styles.chip} aria-pressed={filters.has(category)} onClick={() => toggleFilter(category)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.count} role="status" aria-live="polite">
        {query.trim() === '' ? 'Type to find layers by name' : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
      </p>
      <ul className={styles.results} aria-label="Find results">
        {results.map((result, index) => {
          const node = editor.doc.get(result.id);
          if (!node || !isSceneNode(node)) return null;
          const page = allPages ? editor.doc.get(result.pageId) : undefined;
          return (
            <li key={result.id}>
              <button type="button" className={styles.result} aria-current={index === active || undefined} onClick={() => choose(result)}>
                <Icon name={layerIcon(node)} size={16} style={layerIcon(node) === 'component' ? { color: 'var(--accent-component)' } : undefined} />
                <span className={styles.name}>{node.name}</span>
                {page && <span className={styles.page}>{page.name}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
