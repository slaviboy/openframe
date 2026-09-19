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

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../icons/Icon';
import styles from './Menu.module.css';
import { placeFloating, type Box, type Placement } from './position';

export type MenuEntry =
  | {
      readonly kind: 'item';
      readonly id: string;
      readonly label: string;
      /** Drawn before the label — the reference's endpoint list names each option beside its picture. */
      readonly icon?: IconName;
      /** Drawn instead of the label, where the reference draws the option rather than naming it (a width profile). */
      readonly content?: ReactNode;
      readonly shortcut?: string;
      readonly checked?: boolean;
      readonly disabled?: boolean;
      readonly onSelect: () => void;
    }
  | { readonly kind: 'submenu'; readonly id: string; readonly label: string; readonly entries: readonly MenuEntry[]; readonly disabled?: boolean }
  | { readonly kind: 'separator'; readonly id: string };

export interface MenuProps {
  readonly label: string;
  readonly entries: readonly MenuEntry[];
  readonly anchor: Box;
  readonly placement: Placement;
  /** Called when the whole menu tree should close (selection, Escape, outside click). */
  readonly onClose: () => void;
}

/**
 * Accessible application menu rendered in a portal.
 *
 * Keyboard: ↑/↓ move, Home/End jump, → or Enter opens a submenu, ← or Esc closes it, Enter
 * or Space activates an item, and a letter jumps to the next item starting with it.
 * Disabled items are shown and reachable but cannot be activated. Focus returns to the
 * previously focused element when the menu closes. Elements marked `data-menu-root` (such
 * as the button that toggles the menu) do not count as outside clicks.
 */
export function Menu({ label, entries, anchor, placement, onClose }: MenuProps) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-menu-root]')) onClose();
    };
    const onWindowChange = () => onClose();
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onWindowChange);
    window.addEventListener('resize', onWindowChange);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onWindowChange);
      window.removeEventListener('resize', onWindowChange);
      // Restore focus only if it was lost with the menu: a selected item may already have
      // focused something else (e.g. an inline rename field), which must keep focus.
      const current = document.activeElement;
      if (previous?.isConnected && (current === null || current === document.body)) previous.focus({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(<MenuList label={label} entries={entries} anchor={anchor} placement={placement} onCloseAll={onClose} depth={0} />, document.body);
}

interface MenuListProps {
  readonly label: string;
  readonly entries: readonly MenuEntry[];
  readonly anchor: Box;
  readonly placement: Placement;
  readonly onCloseAll: () => void;
  readonly onCloseSelf?: () => void;
  readonly depth: number;
}

function MenuList({ label, entries, anchor, placement, onCloseAll, onCloseSelf, depth }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(() => firstFocusable(entries, 0, 1));
  const [submenu, setSubmenu] = useState<{ id: string; anchor: Box } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = placeFloating(anchor, { width: rect.width, height: rect.height }, { width: window.innerWidth, height: window.innerHeight }, placement);
    // The owner rebuilds the entries whenever it renders (e.g. when autosave updates the save status): keep
    // the same position when nothing moved, so this menu doesn't take focus back from an open submenu.
    setPosition((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next));
  }, [anchor, placement, entries]);

  useEffect(() => {
    if (position) ref.current?.focus({ preventScroll: true });
  }, [position]);

  /** Opens a submenu next to its item; the item's rect is read in the event, not during render. */
  const openSubmenuFor = (entry: MenuEntry | undefined) => {
    if (entry?.kind !== 'submenu' || entry.disabled) return;
    const rect = itemRefs.current.get(entry.id)?.getBoundingClientRect();
    if (rect) setSubmenu({ id: entry.id, anchor: { x: rect.x, y: rect.y - 8, width: rect.width, height: rect.height } });
  };

  const activate = (entry: MenuEntry) => {
    if (entry.kind === 'separator' || entry.disabled) return;
    if (entry.kind === 'submenu') {
      openSubmenuFor(entry);
      return;
    }
    onCloseAll();
    entry.onSelect();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = entries[active];
    let handled = true;
    switch (e.key) {
      case 'ArrowDown':
        setActive((i) => firstFocusable(entries, i + 1, 1));
        break;
      case 'ArrowUp':
        setActive((i) => firstFocusable(entries, i - 1, -1));
        break;
      case 'Home':
        setActive(firstFocusable(entries, 0, 1));
        break;
      case 'End':
        setActive(firstFocusable(entries, entries.length - 1, -1));
        break;
      case 'ArrowRight':
        openSubmenuFor(current);
        break;
      case 'ArrowLeft':
        if (onCloseSelf) onCloseSelf();
        else handled = false;
        break;
      case 'Escape':
        if (onCloseSelf) onCloseSelf();
        else onCloseAll();
        break;
      case 'Enter':
      case ' ':
        if (current) activate(current);
        break;
      case 'Tab':
        onCloseAll();
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const next = findByLetter(entries, active, e.key);
          if (next >= 0) setActive(next);
        } else {
          handled = false;
        }
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const activeEntry = entries[active];
  const submenuEntry = submenu ? entries.find((entry) => entry.kind === 'submenu' && entry.id === submenu.id) : undefined;

  return (
    <div data-menu-root="">
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        aria-orientation="vertical"
        aria-activedescendant={activeEntry && activeEntry.kind !== 'separator' ? `menu-${depth}-${activeEntry.id}` : undefined}
        tabIndex={-1}
        className={styles.menu}
        style={{ left: position?.x ?? 0, top: position?.y ?? 0, visibility: position ? 'visible' : 'hidden' }}
        onKeyDown={onKeyDown}
      >
        {entries.map((entry, index) => {
          if (entry.kind === 'separator') return <div key={entry.id} role="separator" className={styles.separator} />;
          return (
            <div
              key={entry.id}
              id={`menu-${depth}-${entry.id}`}
              ref={(el) => {
                if (el) itemRefs.current.set(entry.id, el);
                else itemRefs.current.delete(entry.id);
              }}
              role={entry.kind === 'item' && entry.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={entry.kind === 'item' && entry.checked !== undefined ? entry.checked : undefined}
              aria-disabled={entry.disabled || undefined}
              aria-haspopup={entry.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={entry.kind === 'submenu' ? submenu?.id === entry.id : undefined}
              className={styles.item}
              data-active={index === active || undefined}
              data-disabled={entry.disabled || undefined}
              data-icon={(entry.kind === 'item' && entry.icon !== undefined) || undefined}
              onPointerEnter={() => {
                setActive(index);
                if (entry.kind === 'submenu' && !entry.disabled) openSubmenuFor(entry);
                else setSubmenu(null);
              }}
              onClick={() => activate(entry)}
            >
              <span className={styles.check} aria-hidden="true">
                {entry.kind === 'item' && entry.checked ? '✓' : ''}
              </span>
              {entry.kind === 'item' && entry.icon !== undefined && <Icon name={entry.icon} size={24} className={styles.entryIcon} />}
              <span className={styles.label}>
                {/* An option drawn rather than named keeps its name for a screen reader and for testing. */}
                {entry.kind === 'item' && entry.content !== undefined ? (
                  <>
                    <span className="visually-hidden">{entry.label}</span>
                    {entry.content}
                  </>
                ) : (
                  entry.label
                )}
              </span>
              {entry.kind === 'item' && entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
              {entry.kind === 'submenu' && <Icon name="caretRight" size={16} className={styles.chevron} />}
            </div>
          );
        })}
      </div>
      {submenu && submenuEntry?.kind === 'submenu' && (
        <MenuList
          label={submenuEntry.label}
          entries={submenuEntry.entries}
          anchor={submenu.anchor}
          placement="right-start"
          onCloseAll={onCloseAll}
          onCloseSelf={() => {
            setSubmenu(null);
            ref.current?.focus({ preventScroll: true });
          }}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

function firstFocusable(entries: readonly MenuEntry[], start: number, step: 1 | -1): number {
  const n = entries.length;
  if (n === 0) return -1;
  for (let k = 0; k < n; k++) {
    const i = (((start + k * step) % n) + n) % n;
    if (entries[i]!.kind !== 'separator') return i;
  }
  return -1;
}

function findByLetter(entries: readonly MenuEntry[], from: number, letter: string): number {
  const n = entries.length;
  const lower = letter.toLowerCase();
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const entry = entries[i]!;
    if (entry.kind !== 'separator' && entry.label.toLowerCase().startsWith(lower)) return i;
  }
  return -1;
}
