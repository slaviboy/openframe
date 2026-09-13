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

import { useEffect, useRef, useState } from 'react';
import type { ToolId } from '@/editor/stores/editor-store';
import { formatShortcut } from '@/editor/keymap/keymap';
import { Icon, type IconName } from '../icons/Icon';
import { useEditor, useEditorState } from '../hooks/useEditor';
import { IS_MAC } from '../keyboard/keyboard-controller';
import styles from './Toolbar.module.css';

interface ToolItem {
  readonly tool: ToolId;
  readonly label: string;
  readonly icon: IconName;
  readonly command: string;
}

const GROUPS: readonly (readonly ToolItem[])[] = [
  [
    { tool: 'move', label: 'Move', icon: 'move', command: 'tools.move' },
    { tool: 'hand', label: 'Hand tool', icon: 'hand', command: 'tools.hand' },
    { tool: 'scale', label: 'Scale', icon: 'scale', command: 'tools.scale' },
  ],
  [
    { tool: 'frame', label: 'Frame', icon: 'frame', command: 'tools.frame' },
    { tool: 'section', label: 'Section', icon: 'section', command: 'tools.section' },
    { tool: 'slice', label: 'Slice', icon: 'slice', command: 'tools.slice' },
  ],
  [
    { tool: 'rectangle', label: 'Rectangle', icon: 'rectangle', command: 'tools.rectangle' },
    { tool: 'line', label: 'Line', icon: 'line', command: 'tools.line' },
    { tool: 'arrow', label: 'Arrow', icon: 'arrow', command: 'tools.arrow' },
    { tool: 'ellipse', label: 'Ellipse', icon: 'ellipse', command: 'tools.ellipse' },
    { tool: 'polygon', label: 'Polygon', icon: 'polygon', command: 'tools.polygon' },
    { tool: 'star', label: 'Star', icon: 'star', command: 'tools.star' },
    { tool: 'image', label: 'Place image', icon: 'image', command: 'tools.image' },
  ],
  [{ tool: 'text', label: 'Text', icon: 'text', command: 'tools.text' }],
];

/** Floating bottom toolbar. Each group remembers the last tool picked from its dropdown. */
export function Toolbar() {
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  // Tool last picked from each group's dropdown; shown when the group is not active.
  const [picked, setPicked] = useState<ToolId[]>(GROUPS.map((g) => g[0]!.tool));
  const [openGroup, setOpenGroup] = useState<number | null>(null);

  const shortcut = (command: string) => {
    const first = editor.commands.get(command)?.shortcuts?.[0];
    return first ? formatShortcut(first, IS_MAC) : '';
  };

  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label="Tools"
      onKeyDown={(e) => {
        // ←/→ move focus between tool buttons (F6 focuses the toolbar).
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-tool-button]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        e.preventDefault();
        e.stopPropagation();
        buttons[(index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]!.focus();
      }}
    >
      {GROUPS.map((group, gi) => {
        const active = group.some((t) => t.tool === tool);
        const current = group.find((t) => t.tool === (active ? tool : picked[gi])) ?? group[0]!;
        return (
          <div key={current.command} className={styles.group}>
            <button
              type="button"
              className={styles.tool}
              aria-pressed={active}
              data-active={active || undefined}
              aria-label={`${current.label} (${shortcut(current.command)})`}
              title={`${current.label}  ${shortcut(current.command)}`}
              data-tool-button=""
              onClick={(e) => {
                editor.commands.run(current.command);
                // Chosen from the keyboard: hand focus back to the canvas so Return places the object.
                if (e.detail === 0) e.currentTarget.blur();
              }}
            >
              <Icon name={current.icon} />
            </button>
            {group.length > 1 && (
              <ToolMenu
                items={group}
                open={openGroup === gi}
                onOpenChange={(open) => setOpenGroup(open ? gi : null)}
                activeTool={tool}
                shortcut={shortcut}
                onPick={(item) => {
                  editor.commands.run(item.command);
                  setPicked((prev) => prev.map((t, i) => (i === gi ? item.tool : t)));
                  setOpenGroup(null);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ToolMenuProps {
  items: readonly ToolItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTool: ToolId;
  shortcut: (command: string) => string;
  onPick: (item: ToolItem) => void;
}

function ToolMenu({ items, open, onOpenChange, activeTool, shortcut, onPick }: ToolMenuProps) {
  const [focus, setFocus] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open, onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.chevron}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More tools"
        onClick={() => {
          setFocus(Math.max(0, items.findIndex((i) => i.tool === activeTool)));
          onOpenChange(!open);
        }}
      >
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setFocus((f) => (f + 1) % items.length);
            else if (e.key === 'ArrowUp') setFocus((f) => (f - 1 + items.length) % items.length);
            else if (e.key === 'Enter' || e.key === ' ') onPick(items[focus]!);
            else if (e.key === 'Escape') {
              onOpenChange(false);
              buttonRef.current?.focus();
            } else return;
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {items.map((item, i) => (
            <div
              key={item.tool}
              role="menuitemradio"
              aria-checked={item.tool === activeTool}
              className={styles.menuItem}
              data-focus={i === focus || undefined}
              onPointerEnter={() => setFocus(i)}
              onClick={() => onPick(item)}
            >
              <span className={styles.check}>{item.tool === activeTool ? '✓' : ''}</span>
              <Icon name={item.icon} size={24} />
              <span className={styles.menuLabel}>{item.label}</span>
              <span className={styles.menuShortcut}>{shortcut(item.command)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
