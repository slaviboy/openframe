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

import { devStatusLabel, devStatusLayers } from '@/editor/commands/dev-status';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { Icon } from '../../icons/Icon';
import { layerIcon } from '../../icons/layer-icons';
import styles from './ReadyForDevPanel.module.css';

/**
 * Dev Mode's ready for dev view: the designs on this page marked for handoff. Clicking one selects it and brings it
 * into view, which is where a developer starts.
 */
export function ReadyForDevPanel() {
  const editor = useEditor();
  const pageId = useEditorState((s) => s.activePageId);
  const selection = useEditorState((s) => s.selection);
  useDocumentRevision();
  const marked = devStatusLayers(editor, pageId);

  return (
    <section className={styles.panel} aria-label="Ready for development">
      <header className={styles.header}>
        <h2 className={styles.title}>Ready for development</h2>
      </header>
      {marked.length === 0 ? (
        <p className={styles.empty}>Nothing on this page is marked for handoff yet.</p>
      ) : (
        <ul className={styles.list} aria-label="Designs ready for development">
          {marked.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                className={styles.item}
                data-selected={selection.includes(node.id) || undefined}
                onClick={() => {
                  editor.state.select([node.id]);
                  editor.state.setFocus(node.id);
                  editor.commands.run('view.zoomToSelection');
                }}
              >
                <Icon name={layerIcon(node)} size={16} />
                <span className={styles.name}>{node.name}</span>
                <span className={styles.status} data-changed={node.devStatus?.changed || undefined}>
                  {node.devStatus ? devStatusLabel(node.devStatus) : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
