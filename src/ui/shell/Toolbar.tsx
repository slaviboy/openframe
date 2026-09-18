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

import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes } from 'react';
import type { EditorMode, ToolId, VectorEditTool } from '@/editor/stores/editor-store';
import { formatShortcut } from '@/editor/keymap/keymap';
import { Icon, type IconName } from '../icons/Icon';
import { useEditor, useEditorState, useSession } from '../hooks/useEditor';
import { useColorProfile } from '../hooks/useColorProfile';
import { toCss } from '@/core/color/color';
import { ColorPicker } from '../primitives/ColorPicker';
import { NumberField } from '../primitives/NumberField';
import type { Box } from '../primitives/position';
import { IS_MAC } from '../keyboard/keyboard-controller';
import { useHoverTooltip } from '../primitives/HoverTooltip';
import styles from './Toolbar.module.css';

/** Tools shown in the toolbar that are not implemented yet: they appear, but can't be chosen. */
type PendingTool = 'comment';

interface ToolItem {
  readonly tool: ToolId | PendingTool;
  readonly label: string;
  readonly icon: IconName;
  /** The glyph in the tool's dropdown, when it differs from the toolbar button's. */
  readonly menuIcon?: IconName;
  /** Absent for a pending tool. */
  readonly command?: string;
}

interface ToolGroup {
  /** Name of the group's dropdown. */
  readonly label: string;
  readonly items: readonly ToolItem[];
}

const GROUPS: readonly ToolGroup[] = [
  {
    label: 'Move tools',
    items: [
      {
        tool: 'move',
        label: 'Move',
        icon: 'move',
        menuIcon: 'moveMenu',
        command: 'tools.move',
      },
      { tool: 'hand', label: 'Hand tool', icon: 'hand', command: 'tools.hand' },
      { tool: 'scale', label: 'Scale', icon: 'scale', command: 'tools.scale' },
    ],
  },
  {
    label: 'Region tools',
    items: [
      {
        tool: 'frame',
        label: 'Frame',
        icon: 'frame',
        menuIcon: 'frameMenu',
        command: 'tools.frame',
      },
      {
        tool: 'section',
        label: 'Section',
        icon: 'sectionTool',
        command: 'tools.section',
      },
      { tool: 'slice', label: 'Slice', icon: 'slice', command: 'tools.slice' },
    ],
  },
  {
    label: 'Shape tools',
    items: [
      {
        tool: 'rectangle',
        label: 'Rectangle',
        icon: 'rectangle',
        command: 'tools.rectangle',
      },
      { tool: 'line', label: 'Line', icon: 'line', command: 'tools.line' },
      { tool: 'arrow', label: 'Arrow', icon: 'arrow', command: 'tools.arrow' },
      {
        tool: 'ellipse',
        label: 'Ellipse',
        icon: 'ellipse',
        command: 'tools.ellipse',
      },
      {
        tool: 'polygon',
        label: 'Polygon',
        icon: 'polygon',
        command: 'tools.polygon',
      },
      { tool: 'star', label: 'Star', icon: 'star', command: 'tools.star' },
      {
        tool: 'image',
        label: 'Place image',
        icon: 'image',
        command: 'tools.image',
      },
    ],
  },
  {
    label: 'Creation tools',
    items: [
      {
        tool: 'pen',
        label: 'Pen',
        icon: 'pen',
        menuIcon: 'penMenu',
        command: 'tools.pen',
      },
      {
        tool: 'pencil',
        label: 'Pencil',
        icon: 'pencil',
        command: 'tools.pencil',
      },
    ],
  },
  {
    label: 'Type tools',
    items: [
      { tool: 'text', label: 'Text', icon: 'textTool', command: 'tools.text' },
      { tool: 'textOnPath', label: 'Text on a path', icon: 'textOnPath', command: 'tools.textOnPath' },
    ],
  },
  {
    label: 'Comment tools',
    items: [{ tool: 'comment', label: 'Comment', icon: 'comment', command: 'tools.comment' }],
  },
];

/** Dev Mode's toolbar: only the tools that read the design. Nothing here draws, because Dev Mode does not edit. */
const DEV_GROUPS: readonly ToolGroup[] = [
  { label: 'Move tools', items: GROUPS[0]!.items.filter((item) => item.tool === 'move' || item.tool === 'hand') },
  { label: 'Handoff tools', items: [{ tool: 'measure', label: 'Measurement', icon: 'width', command: 'tools.measure' }] },
  GROUPS.at(-1)!,
];

/** Draw mode's toolbar: the move tools, then the illustration tools. */
const DRAW_GROUPS: readonly ToolGroup[] = [
  GROUPS[0]!,
  {
    label: 'Creation tools',
    items: [
      { tool: 'pen', label: 'Pen', icon: 'pen', menuIcon: 'penMenu', command: 'tools.pen' },
      { tool: 'brush', label: 'Brush', icon: 'paint', command: 'tools.brush' },
      { tool: 'pencil', label: 'Pencil', icon: 'pencil', command: 'tools.pencil' },
    ],
  },
];

/** The toolbar's mode switcher. */
const MODES: readonly {
  readonly mode: EditorMode;
  readonly label: string;
  readonly icon: IconName;
  readonly available: boolean;
}[] = [
  { mode: 'draw', label: 'Draw', icon: 'modeDraw', available: true },
  { mode: 'design', label: 'Design', icon: 'modeDesign', available: true },
  { mode: 'motion', label: 'Motion', icon: 'modeMotion', available: true },
  { mode: 'dev', label: 'Dev Mode', icon: 'modeDev', available: true },
];

/** Vector edit mode's secondary toolbar. */
const VECTOR_TOOLS: readonly {
  readonly tool: VectorEditTool;
  readonly label: string;
  readonly icon: IconName;
  readonly command: string;
}[] = [
  { tool: 'move', label: 'Move', icon: 'move', command: 'vector.toolMove' },
  { tool: 'lasso', label: 'Lasso', icon: 'lasso', command: 'vector.toolLasso' },
  { tool: 'cut', label: 'Cut', icon: 'cut', command: 'vector.toolCut' },
  { tool: 'bend', label: 'Bend', icon: 'bend', command: 'vector.toolBend' },
  { tool: 'paint', label: 'Paint', icon: 'paint', command: 'vector.toolPaint' },
  {
    tool: 'eraser',
    label: 'Eraser',
    icon: 'eraser',
    command: 'vector.toolEraser',
  },
  {
    tool: 'width',
    label: 'Variable width',
    icon: 'width',
    command: 'vector.toolWidth',
  },
  {
    tool: 'shapeBuilder',
    label: 'Shape builder',
    icon: 'boolean',
    command: 'vector.toolShapeBuilder',
  },
];

const firstAvailable = (group: ToolGroup): ToolItem => group.items.find((i) => i.command) ?? group.items[0]!;

/** Floating bottom toolbar. Each group remembers the last tool picked from its dropdown; vector edit mode shows its secondary toolbar instead. */
export function Toolbar() {
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  // Tool last picked from each group's dropdown, by group; shown when the group is not active.
  const [picked, setPicked] = useState<Readonly<Record<string, ToolId | PendingTool>>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const vectorTool = useEditorState((s) => (s.vectorEdit ? (s.vectorEdit.tool ?? 'move') : null));
  const mode = useEditorState((s) => s.mode);

  const shortcut = (command: string | undefined) => {
    const first = command ? editor.commands.get(command)?.shortcuts?.[0] : undefined;
    return first ? formatShortcut(first, IS_MAC) : '';
  };
  const app = useSession();
  const viewingVersion = useSyncExternalStore(app.session.subscribe, () => app.session.getSnapshot().viewing !== null);
  const versionHistoryOpen = useEditorState((s) => s.versionHistoryOpen);

  // Version history: Done exits it (returning from an earlier version to the file as it is now).
  if (versionHistoryOpen || viewingVersion) {
    return (
      <div className={styles.toolbar} role="toolbar" aria-label="Tools">
        <div className={styles.toolsRow}>
          <button
            type="button"
            className={styles.done}
            onClick={() => {
              editor.state.setVersionHistoryOpen(false);
              if (viewingVersion) void app.viewVersion(null);
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {(tool === 'pencil' || tool === 'brush') && <SketchToolbar brush={tool === 'brush'} />}
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label="Tools"
        // In Motion the timeline runs along the bottom, so the toolbar sits above it.
        data-above-timeline={mode === 'motion' || undefined}
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
        {vectorTool !== null && (
          <div className={styles.toolsRow}>
            {VECTOR_TOOLS.map((item) => (
              <div key={item.command} className={styles.group}>
                <ToolButton icon={item.icon} label={item.label} shortcut={shortcut(item.command)} active={vectorTool === item.tool} onClick={() => editor.commands.run(item.command)} />
              </div>
            ))}
            <button type="button" className={styles.done} data-tool-button="" title={`Done  ${shortcut('vector.done')}`} onClick={() => editor.commands.run('vector.done')}>
              Done
            </button>
          </div>
        )}
        {vectorTool === null && (
          <>
            <div className={styles.toolsRow}>
              {(mode === 'draw' ? DRAW_GROUPS : mode === 'dev' ? DEV_GROUPS : GROUPS).map((group) => {
                const active = group.items.some((t) => t.tool === tool);
                const current = group.items.find((t) => t.tool === (active ? tool : picked[group.label])) ?? firstAvailable(group);
                return (
                  <div key={group.label} className={styles.group} role="group" aria-label={current.label}>
                    <ToolButton
                      icon={current.icon}
                      label={current.label}
                      shortcut={shortcut(current.command)}
                      active={active}
                      pending={!current.command}
                      onClick={(e) => {
                        if (!current.command) return;
                        editor.commands.run(current.command);
                        // Chosen from the keyboard: hand focus back to the canvas so Return places the object.
                        if (e.detail === 0) e.currentTarget.blur();
                      }}
                    />
                    <ToolMenu
                      group={group}
                      open={openGroup === group.label}
                      onOpenChange={(open) => setOpenGroup(open ? group.label : null)}
                      activeTool={tool}
                      shortcut={shortcut}
                      onPick={(item) => {
                        if (!item.command) return;
                        editor.commands.run(item.command);
                        setPicked((prev) => ({ ...prev, [group.label]: item.tool }));
                        setOpenGroup(null);
                      }}
                    />
                  </div>
                );
              })}
              {mode === 'design' && <BooleanMenu open={openGroup === BOOLEAN_MENU} onOpenChange={(open) => setOpenGroup(open ? BOOLEAN_MENU : null)} shortcut={shortcut} />}
              <ToolButton icon="actions" label="Actions" shortcut={shortcut('view.commandPalette')} onClick={() => editor.commands.run('view.commandPalette')} />
            </div>
            <div className={styles.divider} role="separator" aria-orientation="vertical" />
            <div className={styles.modesWrap}>
              <div className={styles.modes} role="radiogroup" aria-label="Mode">
                {MODES.map((m) => (
                  <ModeOption
                    key={m.mode}
                    label={m.label}
                    icon={m.icon}
                    checked={mode === m.mode}
                    available={m.available}
                    shortcut={m.mode === 'dev' ? shortcut('view.devMode') : undefined}
                    onSelect={() => editor.state.setMode(m.mode)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** The Pencil's and Brush's secondary toolbar: the stroke their sketches take. ⌘-clicking a stroke on the canvas fills it in. */
function SketchToolbar({ brush }: { brush: boolean }) {
  const editor = useEditor();
  const stroke = useEditorState((s) => s.sketchStroke);
  const [anchor, setAnchor] = useState<Box | null>(null);
  const profile = useColorProfile();
  return (
    <div className={styles.sketchToolbar} role="toolbar" aria-label="Sketch stroke">
      <button
        type="button"
        className={styles.swatch}
        aria-label="Stroke color"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        style={{ background: toCss({ ...stroke.color, a: 1 }, profile) }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
        }}
      />
      {anchor && (
        <ColorPicker
          label="Stroke"
          color={{ ...stroke.color, a: 1 }}
          opacity={stroke.color.a}
          anchor={anchor}
          colorProfile={profile}
          onColor={(color) => editor.state.setSketchStroke({ color: { ...color, a: stroke.color.a } })}
          onOpacity={(a) => editor.state.setSketchStroke({ color: { ...stroke.color, a } })}
          onGestureStart={() => undefined}
          onGestureEnd={() => undefined}
          onClose={() => setAnchor(null)}
        />
      )}
      <NumberField
        label={<Icon name="strokeWeight" size={16} />}
        ariaLabel="Sketch stroke weight"
        min={0.1}
        max={100}
        value={stroke.weight}
        onChange={(weight) => editor.state.setSketchStroke({ weight })}
      />
      <select
        className={styles.sketchSelect}
        aria-label="Sketch stroke style"
        value={stroke.dashed ? 'dashed' : 'solid'}
        onChange={(e) => editor.state.setSketchStroke({ dashed: e.target.value === 'dashed' })}
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
      </select>
      {/* The Brush paints a dynamic stroke: how many bumps it has, how far they go, and how rounded they are. */}
      {brush &&
        (
          [
            ['Frequency', 'frequency'],
            ['Wiggle', 'wiggle'],
            ['Smoothen', 'smoothen'],
          ] as const
        ).map(([label, key]) => (
          <label key={key} className={styles.sketchSlider}>
            <span>{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label={`Brush ${label.toLowerCase()}`}
              value={stroke.dynamic[key]}
              onChange={(e) => editor.state.setSketchStroke({ dynamic: { ...stroke.dynamic, [key]: Number(e.target.value) } })}
            />
          </label>
        ))}
    </div>
  );
}

interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly icon: IconName;
  readonly label: string;
  readonly shortcut: string;
  readonly active?: boolean;
  /** Shown but not implemented yet. */
  readonly pending?: boolean;
}

/** A 32px toolbar button; hovering or focusing it shows its name and shortcut above it. */
function ToolButton({ icon, label, shortcut, active = false, pending = false, ...rest }: ToolButtonProps) {
  const { handlers, tooltip } = useHoverTooltip(label, shortcut || undefined, 'above');
  return (
    <>
      <button
        type="button"
        className={styles.tool}
        aria-pressed={active}
        aria-disabled={pending || undefined}
        data-active={active || undefined}
        aria-label={shortcut ? `${label} (${shortcut})` : label}
        data-tool-button=""
        {...handlers}
        {...rest}
      >
        <Icon name={icon} />
      </button>
      {tooltip}
    </>
  );
}

/** One option of the mode switcher; unavailable modes show but can't be chosen. */
function ModeOption({
  label,
  icon,
  checked,
  available,
  shortcut,
  onSelect,
}: {
  label: string;
  icon: IconName;
  checked: boolean;
  available: boolean;
  shortcut?: string | undefined;
  onSelect: () => void;
}) {
  const { handlers, tooltip } = useHoverTooltip(label, shortcut || undefined, 'above');
  return (
    <>
      <label className={styles.mode} data-checked={checked || undefined} data-unavailable={!available || undefined} {...handlers}>
        <input type="radio" name="toolbar-mode" className={styles.modeInput} aria-label={label} checked={checked} disabled={!available} onChange={onSelect} />
        <Icon name={icon} />
      </label>
      {tooltip}
    </>
  );
}

/** The name the toolbar's open-menu state takes while the boolean menu is the one open. */
const BOOLEAN_MENU = 'Boolean operations';

/** The four boolean operations and Flatten, which is what they are usually followed by. */
const BOOLEAN_ITEMS: readonly { readonly command: string; readonly label: string }[] = [
  { command: 'object.booleanUnion', label: 'Union selection' },
  { command: 'object.booleanSubtract', label: 'Subtract selection' },
  { command: 'object.booleanIntersect', label: 'Intersect selection' },
  { command: 'object.booleanExclude', label: 'Exclude selection' },
  { command: 'object.flatten', label: 'Flatten selection' },
];

/**
 * Boolean operations: the four ways of combining the selected layers, and Flatten. Offered while the selection
 * is something they apply to, which is also how a boolean group's own operation is changed.
 */
function BooleanMenu({ open, onOpenChange, shortcut }: { open: boolean; onOpenChange: (open: boolean) => void; shortcut: (command: string | undefined) => string }) {
  const editor = useEditor();
  useEditorState((s) => s.selection);
  const [focus, setFocus] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { handlers, tooltip } = useHoverTooltip(BOOLEAN_MENU, undefined, 'above');
  const items = BOOLEAN_ITEMS.filter((item) => editor.commands.get(item.command));
  const unavailable = items.every((item) => editor.commands.get(item.command)?.enabled?.(editor) === false);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open, onOpenChange]);

  const pick = (command: string) => {
    if (editor.commands.get(command)?.enabled?.(editor) === false) return;
    editor.commands.run(command);
    onOpenChange(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.tool}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={BOOLEAN_MENU}
        aria-disabled={unavailable || undefined}
        {...handlers}
        onClick={() => {
          if (unavailable) return;
          setFocus(0);
          onOpenChange(!open);
        }}
      >
        <Icon name="boolean" />
      </button>
      {!open && tooltip}
      {open && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-label={BOOLEAN_MENU}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setFocus((f) => (f + 1) % items.length);
            else if (e.key === 'ArrowUp') setFocus((f) => (f - 1 + items.length) % items.length);
            else if (e.key === 'Enter' || e.key === ' ') pick(items[focus]!.command);
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
              key={item.command}
              role="menuitem"
              aria-disabled={editor.commands.get(item.command)?.enabled?.(editor) === false || undefined}
              className={styles.menuItem}
              data-focus={i === focus || undefined}
              onPointerEnter={() => setFocus(i)}
              onClick={() => pick(item.command)}
            >
              <span className={styles.check} />
              <Icon name="boolean" size={24} />
              <span className={styles.menuLabel}>{item.label}</span>
              <span className={styles.menuShortcut}>{shortcut(item.command)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface ToolMenuProps {
  group: ToolGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTool: ToolId;
  shortcut: (command: string | undefined) => string;
  onPick: (item: ToolItem) => void;
}

function ToolMenu({ group, open, onOpenChange, activeTool, shortcut, onPick }: ToolMenuProps) {
  const { items } = group;
  const [focus, setFocus] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { handlers, tooltip } = useHoverTooltip(group.label, undefined, 'above');
  const unavailable = items.every((i) => !i.command);

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
        aria-label={group.label}
        aria-disabled={unavailable || undefined}
        {...handlers}
        onClick={() => {
          if (unavailable) return;
          setFocus(
            Math.max(
              0,
              items.findIndex((i) => i.tool === activeTool),
            ),
          );
          onOpenChange(!open);
        }}
      >
        <Icon name="toolChevron" />
      </button>
      {!open && tooltip}
      {open && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-label={group.label}
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
              aria-disabled={!item.command || undefined}
              className={styles.menuItem}
              data-focus={i === focus || undefined}
              onPointerEnter={() => setFocus(i)}
              onClick={() => onPick(item)}
            >
              <span className={styles.check}>{item.tool === activeTool && <Icon name="check" size={16} />}</span>
              <Icon name={item.menuIcon ?? item.icon} size={24} />
              <span className={styles.menuLabel}>{item.label}</span>
              <span className={styles.menuShortcut}>{shortcut(item.command)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
