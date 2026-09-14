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
import { COMPONENT_DRAG_TYPE, insertInstance, localComponents } from '@/editor/commands/insert-instance';
import { Icon } from '../../icons/Icon';
import { useDocumentRevision, useEditor } from '../../hooks/useEditor';
import styles from '../find/FindPanel.module.css';

/**
 * Assets tab (⌥2): the main components in this file, searchable by name. Clicking one inserts an
 * instance next to its main component; dragging one onto the canvas inserts it where it is dropped.
 */
export function AssetsPanel() {
  const editor = useEditor();
  useDocumentRevision();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const components = localComponents(editor).filter((c) => needle === '' || c.name.toLowerCase().includes(needle));

  return (
    <section className={styles.panel} aria-label="Assets">
      <header className={styles.header}>
        <Icon name="search" size={16} className={styles.searchIcon} />
        <input
          className={styles.input}
          type="search"
          aria-label="Search assets"
          placeholder="Search assets"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </header>
      <p className={styles.count} role="status" aria-live="polite">
        {components.length === 0 ? (needle === '' ? 'No components in this file' : 'No matching components') : 'Local components'}
      </p>
      <ul className={styles.results} aria-label="Local components">
        {components.map((component) => (
          <li key={component.id}>
            <button
              type="button"
              className={styles.result}
              draggable
              title="Click to insert, or drag onto the canvas"
              onClick={() => insertInstance(editor, component.id)}
              onDragStart={(e) => {
                e.dataTransfer.setData(COMPONENT_DRAG_TYPE, component.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <Icon name="component" size={16} />
              <span className={styles.name}>{component.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
