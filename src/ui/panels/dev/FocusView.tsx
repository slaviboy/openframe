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

import { canHaveDevStatus, devStatusLabel, setDevStatus } from '@/editor/commands/dev-status';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { Icon } from '../../icons/Icon';
import { layerIcon } from '../../icons/layer-icons';
import primitives from '../../primitives/primitives.module.css';
import styles from './ReadyForDevPanel.module.css';

/**
 * Dev Mode's focus view: one design looked at on its own. The sidebar gives up the list for the design's own name and
 * layers, and the work on it is marked done from here.
 */
export function FocusView() {
  const editor = useEditor();
  const focusId = useEditorState((s) => s.focusId);
  useDocumentRevision();
  const node = focusId === null ? undefined : editor.doc.get(focusId);
  if (!node || !canHaveDevStatus(node)) return null;
  const status = node.devStatus;

  return (
    <section className={styles.panel} aria-label="Focus view">
      <header className={styles.header}>
        <button type="button" className={primitives.button} onClick={() => editor.state.setFocus(null)}>
          Back
        </button>
        <h2 className={styles.title}>Focus view</h2>
      </header>
      <div className={styles.item} data-selected>
        <Icon name={layerIcon(node)} size={16} />
        <span className={styles.name}>{node.name}</span>
        {status && (
          <span className={styles.status} data-changed={status.changed || undefined}>
            {devStatusLabel(status)}
          </span>
        )}
      </div>
      <div className={styles.focusActions}>
        <button type="button" className={primitives.button} disabled={status?.state === 'COMPLETED' && !status.changed} onClick={() => setDevStatus(editor, [node.id], 'COMPLETED')}>
          Mark as completed
        </button>
      </div>
    </section>
  );
}
