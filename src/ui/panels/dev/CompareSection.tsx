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
import { compareVersions, type LayerChange } from '@/core/dev/compare';
import { generateCode } from '@/core/dev/code-gen';
import type { DocumentStore } from '@/core/document/store';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { VersionInfo } from '@/platform/idb/persistence';
import { useDocumentRevision, useEditor, useSession } from '../../hooks/useEditor';
import primitives from '../../primitives/primitives.module.css';
import styles from './InspectPanel.module.css';

/** How a version reads in the list of ones to compare against. */
const versionLabel = (version: VersionInfo) => version.name ?? new Date(version.createdAt).toLocaleString();

/** How a changed layer reads. */
const KIND_LABELS: Readonly<Record<LayerChange['kind'], string>> = { added: 'Added', removed: 'Removed', changed: 'Changed' };

/**
 * Dev Mode's compare changes: what a saved version of the file had, against what it has now. The properties that read
 * differently are listed layer by layer, and the code of the selected layer is shown either side.
 */
export function CompareSection() {
  const editor = useEditor();
  const app = useSession();
  useDocumentRevision();
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [saved, setSaved] = useState<DocumentStore | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<'properties' | 'code'>('properties');

  useEffect(() => {
    void app.listVersions().then(setVersions, () => setVersions([]));
  }, [app]);

  const open = useCallback(
    (id: string) => {
      setChosen(id);
      setSaved(null);
      setFailed(false);
      if (id === '') return;
      void app.readVersion(id).then(setSaved, () => setFailed(true));
    },
    [app],
  );

  if (versions.length === 0) return null;
  const changes = saved ? compareVersions(saved, editor.doc, editor.pageId) : [];
  const [selected] = editor.state.getSnapshot().selection;
  const node = selected === undefined ? undefined : editor.doc.get(selected);
  const layer = node !== undefined && isSceneNode(node) ? (node as SceneNode) : undefined;
  const wasLayer = saved && selected !== undefined ? saved.get(selected) : undefined;
  const before = wasLayer !== undefined && isSceneNode(wasLayer) ? generateCode(wasLayer as SceneNode, { language: 'CSS', unit: 'px' }) : null;
  const after = layer ? generateCode(layer, { language: 'CSS', unit: 'px' }) : null;

  return (
    <section className={styles.group} aria-label="Compare changes">
      <h3 className={styles.groupTitle}>Compare changes</h3>
      <select className={primitives.select} aria-label="Compare with version" value={chosen} onChange={(e) => open(e.target.value)}>
        <option value="">Choose a version</option>
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {versionLabel(version)}
          </option>
        ))}
      </select>

      {failed && <p className={styles.empty}>That version could not be read.</p>}
      {chosen !== '' && !failed && saved === null && <p className={styles.empty}>Reading the version…</p>}

      {saved !== null && (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Compare view">
            {(['properties', 'code'] as const).map((value) => (
              <button key={value} type="button" role="tab" className={styles.tab} aria-selected={view === value} data-selected={view === value || undefined} onClick={() => setView(value)}>
                {value === 'properties' ? 'Properties' : 'Code'}
              </button>
            ))}
          </div>

          {view === 'properties' ? (
            changes.length === 0 ? (
              <p className={styles.empty}>Nothing on this page has changed since then.</p>
            ) : (
              changes.map((change) => (
                <div key={change.nodeId} className={styles.annotation}>
                  <button type="button" className={styles.link} aria-label={`Select ${change.name}`} onClick={() => editor.state.select([change.nodeId])}>
                    {change.name}
                  </button>
                  <span className={styles.label}>{KIND_LABELS[change.kind]}</span>
                  {change.properties.map((property) => (
                    <div key={property.field} className={styles.row}>
                      <span className={styles.label}>{property.field}</span>
                      <span className={styles.value}>
                        {property.before} → {property.after}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )
          ) : layer === undefined ? (
            <p className={styles.empty}>Select a layer to compare its code.</p>
          ) : (
            <>
              <p className={styles.label}>Then</p>
              <pre className={styles.code} data-testid="compare-code-before">
                {before ?? 'The layer was not there.'}
              </pre>
              <p className={styles.label}>Now</p>
              <pre className={styles.code} data-testid="compare-code-after">
                {after ?? 'The layer is not there.'}
              </pre>
            </>
          )}
        </>
      )}
    </section>
  );
}
