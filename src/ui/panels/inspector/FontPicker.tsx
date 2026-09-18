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

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { placeFloating, type Box } from '../../primitives/position';
import primitives from '../../primitives/primitives.module.css';
import styles from './FontPicker.module.css';

export type FontFilter = 'all' | 'file' | 'user' | 'variable';

export const FONT_FILTER_LABELS: Record<FontFilter, string> = {
  all: 'All fonts',
  file: 'In this file',
  user: 'Installed and uploaded',
  variable: 'Variable fonts',
};

/** The picker remembers the last filter for the session, like the reference editor. */
let lastFilter: FontFilter = 'all';

export interface FontPickerFamily {
  readonly family: string;
  /** Uploaded, or installed on this device. */
  readonly user: boolean;
  readonly variable: boolean;
  /** Used by a text layer in this file. */
  readonly inFile: boolean;
  /** Not loaded yet: its files are read when it is picked. */
  readonly notLoaded?: boolean;
  /** Where it comes from, which is what the badge says: installed on this device, or the bundled library. */
  readonly from?: 'installed' | 'google';
}

export interface FontPickerProps {
  readonly anchor: Box;
  readonly families: readonly FontPickerFamily[];
  readonly current: string | undefined;
  /** Hovering previews a family on the selection; null ends the preview. */
  readonly onPreview: (family: string | null) => void;
  readonly onPick: (family: string) => void;
  readonly onClose: () => void;
  readonly onUpload: (files: File[]) => void;
  /** Lists installed fonts (only where the browser supports it). */
  readonly onListInstalled?: (() => void) | undefined;
  readonly accept: string;
}

/**
 * Font picker popover: search by name, a filter (all fonts, fonts in this file, installed and
 * uploaded fonts, variable fonts), a list of families shown in their own typeface, hover preview,
 * ↑/↓ and Return, and actions to upload fonts or list installed fonts. Esc or a click outside closes it.
 */
export function FontPicker(props: FontPickerProps) {
  const { anchor, families, current, onPreview, onPick, onClose } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const propsRef = useRef(props);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FontFilter>(lastFilter);
  const needle = query.trim().toLocaleLowerCase();
  const visible = families
    .filter((f) => (filter === 'file' ? f.inFile : filter === 'user' ? f.user : filter === 'variable' ? f.variable : true))
    .filter((f) => needle === '' || f.family.toLocaleLowerCase().includes(needle));
  const [active, setActive] = useState(() => Math.max(0, visible.findIndex((f) => f.family === current)));
  const activeIndex = Math.min(active, Math.max(0, visible.length - 1));

  useEffect(() => {
    propsRef.current = props;
  });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const size = el.getBoundingClientRect();
    const pos = placeFloating(anchor, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight }, 'bottom-start');
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.visibility = 'visible';
    // Focus once visible (hidden elements can't take focus, so autoFocus would be lost).
    searchRef.current?.focus({ preventScroll: true });
  }, [anchor]);

  // Escape closes the picker before anything else handles it (e.g. deselecting the layer), wherever
  // focus is — WebKit doesn't return focus to the page after the upload file chooser closes.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      propsRef.current.onPreview(null);
      propsRef.current.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      const a = propsRef.current.anchor;
      if (e.clientX >= a.x && e.clientX <= a.x + a.width && e.clientY >= a.y && e.clientY <= a.y + a.height) return;
      propsRef.current.onPreview(null);
      propsRef.current.onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, filter, needle]);

  const pick = (family: string) => {
    onPick(family);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onPreview(null);
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(visible.length - 1, Math.max(0, activeIndex + (e.key === 'ArrowDown' ? 1 : -1)));
      setActive(next);
      const family = visible[next];
      if (family && !family.notLoaded) onPreview(family.family);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const family = visible[activeIndex];
      if (family) pick(family.family);
    }
  };

  return createPortal(
    <div ref={rootRef} className={styles.picker} role="dialog" aria-label="Font picker" style={{ left: 0, top: 0, visibility: 'hidden' }} onKeyDown={onKeyDown}>
      <input ref={searchRef} className={styles.search} aria-label="Search fonts" placeholder="Search fonts" value={query} spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
      <select
        className={primitives.select}
        aria-label="Font filter"
        value={filter}
        onChange={(e) => {
          const next = e.target.value as FontFilter;
          lastFilter = next;
          setFilter(next);
        }}
      >
        {(Object.keys(FONT_FILTER_LABELS) as FontFilter[]).map((f) => (
          <option key={f} value={f}>
            {FONT_FILTER_LABELS[f]}
          </option>
        ))}
      </select>
      <ul ref={listRef} className={styles.list} role="listbox" aria-label="Fonts" onMouseLeave={() => onPreview(null)}>
        {visible.map((f, i) => (
          <li
            key={f.family}
            role="option"
            aria-selected={i === activeIndex}
            aria-current={f.family === current || undefined}
            className={styles.option}
            onMouseEnter={() => {
              setActive(i);
              if (!f.notLoaded) onPreview(f.family);
            }}
            onClick={() => pick(f.family)}
          >
            <span style={{ fontFamily: `"${f.family}", var(--font-ui, sans-serif)` }}>{f.family}</span>
            {f.notLoaded && <span className={styles.badge}>{f.from === 'google' ? 'Google' : 'Installed'}</span>}
          </li>
        ))}
        {visible.length === 0 && <li className={styles.empty}>No fonts found</li>}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => fileRef.current?.click()}>
          Upload fonts…
        </button>
        {props.onListInstalled && (
          <button type="button" className={styles.action} onClick={props.onListInstalled}>
            Show installed fonts
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={props.accept}
          multiple
          hidden
          aria-label="Font files"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            searchRef.current?.focus({ preventScroll: true });
            if (files.length > 0) props.onUpload(files);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
