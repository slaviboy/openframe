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

import { useCallback, useSyncExternalStore } from 'react';
import { checkDesigns, type DesignIssue } from '@/editor/commands/check-designs';
import { applyPaintVariable, bindVariable } from '@/editor/commands/variables';
import type { Editor } from '@/editor/editor';
import primitives from '../primitives/primitives.module.css';
import dialogStyles from './Dialog.module.css';
import styles from './CheckDesignsDialog.module.css';

/** The field a suggestion binds to, as the variable commands name it. */
const BINDING: Readonly<Record<string, 'fills' | 'strokes' | 'cornerRadius' | 'itemSpacing' | 'paddingTop'>> = {
  Fill: 'fills',
  Stroke: 'strokes',
  'Corner radius': 'cornerRadius',
  Gap: 'itemSpacing',
  Padding: 'paddingTop',
};

/**
 * Check designs: what the page has that the file could build better — values written out where a variable carries
 * them, text with no style, and layers copying a library component without being an instance of it. A suggestion is
 * taken with one button; what the check only flags is left for the designer to put right.
 */
export function CheckDesignsDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  // The dialog sits outside the editor's own context, so it follows the document the way its siblings do.
  const subscribe = useCallback((listener: () => void) => editor.history.subscribe(() => listener()), [editor]);
  useSyncExternalStore(subscribe, () => editor.doc.rev);
  const issues = checkDesigns(editor);
  const key = (issue: DesignIssue) => `${issue.nodeId}:${issue.field ?? issue.kind}`;

  // Taking a suggestion binds the variable, which puts the issue right, so it leaves the list on the next read.
  const take = (issue: DesignIssue) => {
    if (!issue.suggestion || issue.field === undefined) return;
    const field = BINDING[issue.field];
    if (field === undefined) return;
    if (field === 'fills' || field === 'strokes') applyPaintVariable(editor, [issue.nodeId], field, issue.suggestion.variableId);
    else bindVariable(editor, [issue.nodeId], field, issue.suggestion.variableId);
  };

  return (
    <div
      className={dialogStyles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-designs-title"
        className={dialogStyles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id="check-designs-title" className={dialogStyles.title}>
          Check designs
        </h2>

        {issues.length === 0 ? (
          <p className={styles.empty}>Nothing on this page needs putting right.</p>
        ) : (
          <ul className={styles.list} aria-label="Design issues">
            {issues.map((issue) => (
              <li key={key(issue)} className={styles.issue}>
                <button
                  type="button"
                  className={styles.layer}
                  aria-label={`Select ${issue.nodeName}`}
                  onClick={() => {
                    editor.state.select([issue.nodeId]);
                    editor.commands.run('view.zoomToSelection');
                  }}
                >
                  {issue.nodeName}
                </button>
                <span className={styles.kind}>{issue.kind}</span>
                <span className={styles.message}>{issue.message}</span>
                {issue.suggestion && issue.field !== undefined && BINDING[issue.field] !== undefined && (
                  <button type="button" className={primitives.button} aria-label={`Use ${issue.suggestion.name} for ${issue.nodeName}`} onClick={() => take(issue)}>
                    Use {issue.suggestion.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <button type="button" className={primitives.button} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
