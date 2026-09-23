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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { placeFloating, type Box } from '../../primitives/position';
import { loadPreviewFace } from '../../fonts/google-fonts';
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
  /** The library family's directory, which its one preview file is found under. */
  readonly slug?: string;
}

/** Row height, which the list's windowing counts in. Matches `.option` in the stylesheet. */
const ROW_HEIGHT = 28;
/** Rows kept either side of the window, so a scroll doesn't show a gap before React catches up. */
const OVERSCAN = 8;
/** How long a row has to stay in view before its typeface is asked for, so a fast scroll asks for nothing. */
const PREVIEW_DELAY_MS = 120;

export interface FontPickerProps {
  readonly anchor: Box;
  readonly families: readonly FontPickerFamily[];
  readonly current: string | undefined;
  /** Hovering previews a family on the selection; null ends the preview. */
  readonly onPreview: (family: string | null) => void;
  readonly onPick: (family: string) => void;
  readonly onClose: () => void;
  readonly onUpload: (files: File[]) => void;
  /** A family to scroll to and highlight — the one just uploaded, which is somewhere down the list. */
  readonly reveal?: string | undefined;
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
  const { anchor, families, current, reveal, onPreview, onPick, onClose } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const propsRef = useRef(props);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FontFilter>(lastFilter);
  const needle = query.trim().toLocaleLowerCase();
  const visible = useMemo(
    () =>
      families
        .filter((f) => (filter === 'file' ? f.inFile : filter === 'user' ? f.user : filter === 'variable' ? f.variable : true))
        .filter((f) => needle === '' || f.family.toLocaleLowerCase().includes(needle)),
    [families, filter, needle],
  );
  // Until the pointer or the arrow keys move it, the active row is the family to reveal — the one
  // just uploaded, else the one in use. Which row that is only becomes known once the library's index
  // has loaded, so it is followed rather than captured. The row the user moved to is remembered
  // against the family being revealed at the time, so an upload takes the picker to the new font.
  const [active, setActive] = useState<{ readonly index: number; readonly reveal: string | undefined } | null>(null);
  const moved = active !== null && active.reveal === reveal ? active.index : null;
  const followed = visible.findIndex((f) => f.family === (reveal ?? current));
  const activeIndex = Math.min(moved ?? Math.max(0, followed), Math.max(0, visible.length - 1));
  const moveTo = (index: number) => setActive({ index, reveal });
  // The library is 1,946 families and the list is 280px tall: only the rows in view are rendered.
  const [scroll, setScroll] = useState({ top: 0, height: 280 });
  const first = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(visible.length, Math.ceil((scroll.top + scroll.height) / ROW_HEIGHT) + OVERSCAN);
  const shown = visible.slice(first, last);

  // Each row in view is drawn in its own typeface, which for a library family means reading one file
  // for it. Asked for after a moment, so scrolling past a row costs nothing.
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const wanted = shown.filter((f) => f.slug !== undefined && !loaded.has(f.family));
    if (wanted.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all(wanted.map((f) => loadPreviewFace(f.family, f.slug!))).then(() => {
        if (!cancelled) setLoaded((was) => new Set([...was, ...wanted.map((f) => f.family)]));
      });
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `shown` is rebuilt every render; its families are what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((f) => f.family).join('\n'), loaded]);

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

  // The active row may not be rendered at all, so the list is scrolled by the row's place in it
  // rather than by finding the element.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const top = activeIndex * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
  }, [activeIndex, filter, needle, reveal]);

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
      moveTo(next);
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
      <ul
        ref={listRef}
        className={styles.list}
        role="listbox"
        aria-label="Fonts"
        onMouseLeave={() => onPreview(null)}
        onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
      >
        <li aria-hidden="true" className={styles.spacer} style={{ height: visible.length * ROW_HEIGHT }} />
        {shown.map((f, i) => (
          <li
            key={f.family}
            role="option"
            aria-selected={first + i === activeIndex}
            aria-current={f.family === current || undefined}
            className={styles.option}
            style={{ top: (first + i) * ROW_HEIGHT }}
            onMouseEnter={() => {
              moveTo(first + i);
              onPreview(f.family);
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
