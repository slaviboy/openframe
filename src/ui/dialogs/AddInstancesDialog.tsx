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
import { slotLimits } from '@/core/document/component-properties';
import { wouldCycle } from '@/core/document/instances';
import type { Id } from '@/core/ids/ids';
import { insertInstanceInto, localComponents } from '@/editor/commands/insert-instance';
import type { Editor } from '@/editor/editor';
import findStyles from '../panels/find/FindPanel.module.css';
import styles from './Dialog.module.css';

/**
 * Add instances, for a slot of an instance: the file's components (only the slot's preferred instances by default when it
 * has some), searchable by name; choosing one inserts an instance of it into the slot.
 */
export function AddInstancesDialog({ editor, slotId, onClose }: { editor: Editor; slotId: Id; onClose: () => void }) {
  const preferred = slotLimits(editor.doc, slotId)?.preferred ?? [];
  const [onlyPreferred, setOnlyPreferred] = useState(preferred.length > 0);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const components = localComponents(editor)
    .filter((component) => !wouldCycle(editor.doc, component.id, slotId))
    .filter((component) => !onlyPreferred || preferred.includes(component.id))
    .filter((component) => component.name.toLowerCase().includes(needle));

  const insert = (mainId: Id) => {
    insertInstanceInto(editor, mainId, slotId);
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-instances-title"
        className={styles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id="add-instances-title" className={styles.title}>
          Add instances
        </h2>
        <div className={styles.body}>
          <input className={styles.input} type="search" aria-label="Search components" placeholder="Search components" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
          {preferred.length > 0 && (
            <div className={styles.row}>
              <button type="button" className={styles.chip} aria-pressed={onlyPreferred} onClick={() => setOnlyPreferred(true)}>
                Preferred
              </button>
              <button type="button" className={styles.chip} aria-pressed={!onlyPreferred} onClick={() => setOnlyPreferred(false)}>
                All components
              </button>
            </div>
          )}
          {components.length === 0 ? (
            <p>No components to add.</p>
          ) : (
            <ul className={findStyles.results} aria-label="Components">
              {components.map((component) => (
                <li key={component.id}>
                  <button type="button" className={findStyles.result} onClick={() => insert(component.id)}>
                    {component.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
