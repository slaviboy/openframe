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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Id } from '@/core/ids/ids';
import { compareVersions, type LayerChange } from '@/core/dev/compare';
import { generateCode } from '@/core/dev/code-gen';
import type { DocumentStore } from '@/core/document/store';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { VersionInfo } from '@/platform/idb/persistence';
import { useDocumentRevision, useEditor, useSession } from '../../hooks/useEditor';
import primitives from '../../primitives/primitives.module.css';
import { InspectSection } from './InspectSection';
import styles from './InspectPanel.module.css';

/** How large each drawing is in the comparison, in CSS pixels. */
const THUMBNAIL_SIZE = 160;

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
  const [view, setView] = useState<'properties' | 'code' | 'visual'>('properties');
  const [overlaid, setOverlaid] = useState(false);

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
    <InspectSection id="Compare changes" title="Compare changes">
      <div className={styles.groupBody}>
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
            {(['properties', 'code', 'visual'] as const).map((value) => (
              <button key={value} type="button" role="tab" className={styles.tab} aria-selected={view === value} data-selected={view === value || undefined} onClick={() => setView(value)}>
                {value === 'properties' ? 'Properties' : value === 'code' ? 'Code' : 'Visual'}
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
          ) : view === 'visual' ? (
            <VisualCompare saved={saved} nodeId={selected ?? null} overlaid={overlaid} onOverlaid={setOverlaid} />
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
      </div>
    </InspectSection>
  );
}

/** The two drawings of a layer, set beside each other or laid over one another. */
function VisualCompare({ saved, nodeId, overlaid, onOverlaid }: { saved: DocumentStore; nodeId: Id | null; overlaid: boolean; onOverlaid: (value: boolean) => void }) {
  const editor = useEditor();
  const revision = useDocumentRevision();

  // The drawings are made as the layer or the file changes, and let go of when they are replaced.
  const images = useMemo(() => {
    const engine = editor.thumbnails;
    if (engine === null || nodeId === null) return { before: null, after: null };
    const draw = (store: DocumentStore, pageId: Id | null) => {
      if (pageId === null) return null;
      const bytes = engine.thumbnail(store, new SceneIndex(store), pageId, nodeId, THUMBNAIL_SIZE, 2);
      return bytes === null ? null : URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
    };
    return { before: draw(saved, saved.pageOf(nodeId)), after: draw(editor.doc, editor.doc.pageOf(nodeId)) };
    // The revision is what says the file has moved on, so the drawing of it is made again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, saved, nodeId, revision]);

  useEffect(
    () => () => {
      if (images.before) URL.revokeObjectURL(images.before);
      if (images.after) URL.revokeObjectURL(images.after);
    },
    [images],
  );

  if (nodeId === null) return <p className={styles.empty}>Select a layer to compare how it looks.</p>;
  if (editor.thumbnails === null) return <p className={styles.empty}>The rendering engine is still loading.</p>;
  if (images.before === null && images.after === null) return <p className={styles.empty}>This layer has nothing to draw.</p>;

  return (
    <>
      <label className={styles.scale}>
        <span>Overlay</span>
        <input type="checkbox" aria-label="Lay the drawings over one another" checked={overlaid} onChange={(e) => onOverlaid(e.target.checked)} />
      </label>
      <div className={overlaid ? styles.overlay : styles.sideBySide} data-testid="compare-visual">
        {images.before !== null && <img className={styles.shot} src={images.before} alt="The layer as the version has it" />}
        {images.after !== null && <img className={styles.shot} src={images.after} alt="The layer as the file has it" />}
      </div>
    </>
  );
}
