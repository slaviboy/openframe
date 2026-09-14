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

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { VersionInfo } from '@/platform/idb/persistence';
import { useSession } from '../../hooks/useEditor';
import { Icon } from '../../icons/Icon';
import { Menu, type MenuEntry } from '../../primitives/Menu';
import type { Box } from '../../primitives/position';
import styles from './VersionHistoryPanel.module.css';

interface VersionForm {
  /** The version being named or described; null to save a new version. */
  readonly id: string | null;
  readonly name: string;
  readonly description: string;
}

const versionTitle = (version: VersionInfo) => version.name ?? 'Autosave';

/**
 * Version history in the right sidebar: the current version, then saved versions and autosave checkpoints (newest
 * first). Selecting a version shows it read-only; its menu restores, names or duplicates it.
 */
export function VersionHistoryPanel() {
  const app = useSession();
  const { viewing } = useSyncExternalStore(app.session.subscribe, app.session.getSnapshot);
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [form, setForm] = useState<VersionForm | null>(null);
  const [menu, setMenu] = useState<{ version: VersionInfo; anchor: Box; placement: 'bottom-start' | 'point' } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const refresh = useCallback(() => {
    void app.listVersions().then(setVersions, () => setMessage('The version history could not be loaded.'));
  }, [app]);
  useEffect(refresh, [refresh]);

  const fail = (text: string) => () => setMessage(text);
  const submit = () => {
    if (!form) return;
    const done = () => {
      setForm(null);
      refresh();
    };
    const saving = form.id === null ? app.saveVersion(form.name, form.description) : app.updateVersion(form.id, { name: form.name, description: form.description });
    void saving.then(done, fail('The version could not be saved.'));
  };

  const menuEntries = (version: VersionInfo): MenuEntry[] => [
    {
      kind: 'item',
      id: 'edit',
      label: version.kind === 'named' ? 'Edit version info' : 'Name this version',
      onSelect: () => setForm({ id: version.id, name: version.name ?? '', description: version.description ?? '' }),
    },
    { kind: 'item', id: 'restore', label: 'Restore this version', onSelect: () => void app.restoreVersion(version.id).catch(fail('The version could not be restored.')) },
    {
      kind: 'item',
      id: 'duplicate',
      label: 'Duplicate',
      onSelect: () => void app.duplicateVersion(version.id).then((copy) => setMessage(`Duplicated as “${copy.name}” in Files.`), fail('The version could not be duplicated.')),
    },
  ];

  return (
    <section className={styles.panel} aria-label="Version history">
      <header className={styles.header}>
        <h2 className={styles.title}>Version history</h2>
        {!viewing && (
          <button type="button" className={styles.iconButton} aria-label="Save to version history" title="Save to version history" onClick={() => setForm({ id: null, name: '', description: '' })}>
            <Icon name="plus" size={16} />
          </button>
        )}
      </header>
      {form && (
        <form
          className={styles.form}
          aria-label={form.id === null ? 'Save to version history' : 'Version info'}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') setForm(null);
          }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input className={styles.input} aria-label="Version title" placeholder="Title" value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <textarea className={styles.input} aria-label="Version description" placeholder="Describe what changed" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className={styles.formActions}>
            <button type="button" className={styles.secondary} onClick={() => setForm(null)}>
              Cancel
            </button>
            <button type="submit" className={styles.primary} disabled={form.id === null && form.name.trim() === ''}>
              Save
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
      <ul className={styles.list} aria-label="Versions">
        <li className={styles.item}>
          <button type="button" className={styles.version} aria-current={viewing === null ? 'true' : undefined} onClick={() => viewing && void app.viewVersion(null)}>
            <span className={styles.name}>Current version</span>
          </button>
        </li>
        {versions?.map((version) => (
          <li
            key={version.id}
            className={styles.item}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ version, anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 }, placement: 'point' });
            }}
          >
            <button type="button" className={styles.version} aria-current={viewing?.id === version.id ? 'true' : undefined} onClick={() => viewing?.id !== version.id && void app.viewVersion(version.id)}>
              <span className={styles.name}>{versionTitle(version)}</span>
              <span className={styles.meta}>{new Date(version.createdAt).toLocaleString()}</span>
              {version.description && <span className={styles.description}>{version.description}</span>}
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Version actions"
              aria-haspopup="menu"
              data-menu-root=""
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ version, anchor: { x: r.x, y: r.y, width: r.width, height: r.height }, placement: 'bottom-start' });
              }}
            >
              <Icon name="more" size={16} />
            </button>
          </li>
        ))}
      </ul>
      {versions?.length === 0 && <p className={styles.empty}>No saved versions yet. Save one with +, and autosave checkpoints are added every 30 minutes while you edit.</p>}
      {menu && <Menu label="Version actions" entries={menuEntries(menu.version)} anchor={menu.anchor} placement={menu.placement} onClose={closeMenu} />}
    </section>
  );
}
