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

import { useCallback, useEffect, useState } from 'react';
import { mergeDocuments, type MergeConflict } from '@/core/branch/merge';
import type { Editor } from '@/editor/editor';
import type { FileRecord } from '@/platform/idb/persistence';
import type { AppSession } from '@/app/bootstrap';
import primitives from '../../primitives/primitives.module.css';
import dialogStyles from '../../dialogs/Dialog.module.css';
import styles from './BranchesPanel.module.css';

/**
 * Branches: a copy of the file that is worked on apart from it and merged back. The file it came from is the common
 * ground, so a merge can tell what each side changed and what the two moved apart on.
 */
export function BranchesPanel({ app, editor, onClose }: { app: AppSession; editor: Editor; onClose: () => void }) {
  const [branches, setBranches] = useState<FileRecord[]>([]);
  const [parent, setParent] = useState<FileRecord | undefined>(undefined);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<readonly MergeConflict[]>([]);

  const refresh = useCallback(() => {
    void app.listBranches().then(setBranches, () => setBranches([]));
    void app.branchParent().then(setParent, () => setParent(undefined));
  }, [app]);
  useEffect(refresh, [refresh]);

  /** Reads another file against this one and takes what it can, leaving what the two moved apart on. */
  const merge = async (other: FileRecord) => {
    setMessage(null);
    setConflicts([]);
    const sources = await app.mergeSources(other.id);
    if (sources === null) {
      setMessage('These two files have no common ground to merge from.');
      return;
    }
    const result = mergeDocuments(sources.base, editor.doc, sources.theirs);
    if (result.ops.length > 0) {
      editor.history.run(`Merge ${other.name}`, (tx) => {
        for (const op of result.ops) {
          if (op.kind === 'create') tx.create(op.node);
          else if (op.kind === 'delete') tx.delete(op.node.id);
          else tx.set(op.id, op.field, op.value);
        }
      });
    }
    setConflicts(result.conflicts);
    const parts = [
      result.added > 0 ? `${result.added} brought in` : '',
      result.changed > 0 ? `${result.changed} changed` : '',
      result.removed > 0 ? `${result.removed} taken away` : '',
    ].filter((part) => part !== '');
    setMessage(parts.length === 0 && result.conflicts.length === 0 ? `Nothing to take from ${other.name}.` : `${other.name}: ${parts.join(', ') || 'nothing taken'}.`);
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
        aria-labelledby="branches-title"
        className={dialogStyles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id="branches-title" className={dialogStyles.title}>
          Branches
        </h2>

        {parent && (
          <p className={styles.note}>
            This is a branch of{' '}
            <button type="button" className={styles.link} onClick={() => void app.openFileById(parent.id)}>
              {parent.name}
            </button>
            .
          </p>
        )}

        <div className={styles.create}>
          <input
            className={primitives.textInput}
            aria-label="Branch name"
            placeholder="Branch name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && name.trim() !== '') void app.createBranch(name.trim());
            }}
          />
          <button type="button" className={primitives.button} disabled={name.trim() === ''} onClick={() => void app.createBranch(name.trim())}>
            Create branch
          </button>
        </div>

        {branches.length === 0 ? (
          <p className={styles.note}>No branches yet.</p>
        ) : (
          <ul className={styles.list} aria-label="Branches">
            {branches.map((branch) => (
              <li key={branch.id} className={styles.branch}>
                <button type="button" className={styles.link} aria-label={`Open ${branch.name}`} onClick={() => void app.openFileById(branch.id)}>
                  {branch.name}
                </button>
                <button type="button" className={primitives.button} aria-label={`Merge ${branch.name} into this file`} onClick={() => void merge(branch)}>
                  Merge into this file
                </button>
              </li>
            ))}
          </ul>
        )}

        {parent && (
          <button type="button" className={primitives.button} onClick={() => void merge(parent)}>
            Update from {parent.name}
          </button>
        )}

        {message !== null && (
          <p className={styles.note} role="status">
            {message}
          </p>
        )}

        {conflicts.length > 0 && (
          <>
            <p className={styles.note}>
              {conflicts.length === 1 ? '1 thing was left as it is here' : `${conflicts.length} things were left as they are here`}, the two sides having moved apart:
            </p>
            <ul className={styles.list} aria-label="Merge conflicts">
              {conflicts.map((conflict) => (
                <li key={`${conflict.nodeId}:${conflict.field}`} className={styles.branch}>
                  <button
                    type="button"
                    className={styles.link}
                    aria-label={`Select ${conflict.nodeName}`}
                    onClick={() => {
                      editor.state.select([conflict.nodeId]);
                      editor.commands.run('view.zoomToSelection');
                      onClose();
                    }}
                  >
                    {conflict.nodeName}
                  </button>
                  <span className={styles.field}>{conflict.field}</span>
                  {conflict.field !== 'existence' && (
                    <button
                      type="button"
                      className={primitives.button}
                      aria-label={`Take the other side's ${conflict.field} for ${conflict.nodeName}`}
                      onClick={() => {
                        editor.history.run('Settle conflict', (tx) => tx.set(conflict.nodeId, conflict.field, conflict.theirs));
                        setConflicts((current) => current.filter((entry) => entry !== conflict));
                      }}
                    >
                      Take theirs
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
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
