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

import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { moveAction, type ActionPath } from '@/core/prototype/action-paths';
import { formatDescription, type DescriptionFormat } from '@/core/prototype/description';
import { gamepadCode, gamepadLabel } from '@/core/prototype/gamepad';
import { FlowDescription } from '../../present/FlowDescription';
import type { Id } from '@/core/ids/ids';
import {
  ACTION_KINDS,
  ACTION_LABELS,
  actionKind,
  destinationCandidates,
  DIRECTION_LABELS,
  DIRECTIONS,
  EASING_LABELS,
  EASING_TYPES,
  hasDirection,
  isSpringEasing,
  makeAction,
  makeEasing,
  makeTransition,
  makeTrigger,
  MEDIA_ACTION_LABELS,
  MEDIA_ACTIONS,
  MEDIA_ACTIONS_WITH_AMOUNT,
  MEDIA_TRIGGERS,
  reactionSummary,
  TRANSITION_LABELS,
  TRANSITION_TYPES,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  triggerAllowed,
  videoLayerCandidates,
  type ActionKind,
  type EasingType,
  type TransitionDirection,
  type TransitionType,
  type TriggerType,
} from '@/core/prototype/reactions';
import { DEFAULT_OVERLAY_BACKGROUND, flowsOf, isOverlayDestination, OVERLAY_POSITION_LABELS, overlaySettings } from '@/core/prototype/flows';
import { topLevelFrame } from '@/core/prototype/reactions';
import type { Color, MediaAction, OverlaySettings, PrototypeAction, PrototypeEasing, PrototypeTransition, Reaction, SceneNode } from '@/core/schema/document';
import { addFlowStartingPoint, addInteraction, removeFlowStartingPoint, removeInteraction, setOverflowDirection, setOverlaySettings, setPrototypeBackground, setPrototypeDevice, setScrollBehavior, updateFlowStartingPoint, updateInteraction } from '@/editor/commands/prototype';
import { DEVICE_CATEGORIES, presetsIn } from '@/core/document/frame-presets';
import { effectiveDevice } from '@/core/prototype/device';
import { parseExpression } from '@/core/prototype/expressions';
import { collectionVariables, isVariableCollection, localCollections } from '@/core/variables/document';
import { isAutoLayoutFrame } from '@/core/layout/auto-layout';
import { needsBiggerContent, OVERFLOW_DIRECTIONS, OVERFLOW_LABELS, overflowOf, SCROLL_BEHAVIOR_LABELS, SCROLL_BEHAVIORS, scrollFrameOf, type OverflowDirection, type ScrollBehavior } from '@/core/prototype/scroll';
import { videoFillsOf, videoOptionsOf, type VideoOptions } from '@/core/prototype/video';
import { setVideoOptions } from '@/editor/commands/video';
import type { Editor } from '@/editor/editor';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { useGamepadButtons } from '../../hooks/useGamepadButtons';
import { IconButton } from '../../primitives/IconButton';
import primitives from '../../primitives/primitives.module.css';
import inspector from '../inspector/Inspector.module.css';
import styles from './PrototypePanel.module.css';

const SPRING_TYPES: ReadonlySet<EasingType> = new Set(['GENTLE', 'QUICK', 'BOUNCY', 'SLOW', 'CUSTOM_SPRING']);
const MODIFIER_CODES: ReadonlySet<string> = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

/** A key or gamepad button as the Key field shows it: KeyK as K, Digit1 as 1, Gamepad0 as Gamepad A / ✕. */
const keyLabel = (code: string) => gamepadLabel(code) ?? code.replace(/^Key(?=[A-Z]$)/, '').replace(/^Digit(?=\d$)/, '');

const stopKeys = (e: KeyboardEvent) => e.stopPropagation();

/** A number typed and committed on Enter or blur (out-of-range and non-numbers are ignored). */
function CommitNumber({ label, value, min, max, step = 1, onCommit }: { label: string; value: number; min: number; max: number; step?: number; onCommit: (value: number) => void }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        key={value}
        className={primitives.textInput}
        type="number"
        aria-label={label}
        defaultValue={value}
        min={min}
        max={max}
        step={step}
        onBlur={(e) => {
          const next = Number(e.currentTarget.value);
          if (e.currentTarget.value.trim() === '' || !Number.isFinite(next) || next < min || next > max || (step === 1 && !Number.isInteger(next))) {
            e.currentTarget.value = String(value);
            return;
          }
          if (next !== value) onCommit(next);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function EasingFields({ easing, suffix, onChange }: { easing: PrototypeEasing; suffix: string; onChange: (easing: PrototypeEasing) => void }) {
  return (
    <>
      <select className={primitives.select} aria-label={`Easing${suffix}`} value={easing.type} onKeyDown={stopKeys} onChange={(e) => onChange(makeEasing(e.target.value as EasingType, easing))}>
        <optgroup label="Curves">
          {EASING_TYPES.filter((type) => !SPRING_TYPES.has(type)).map((type) => (
            <option key={type} value={type}>
              {EASING_LABELS[type]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Springs">
          {EASING_TYPES.filter((type) => SPRING_TYPES.has(type)).map((type) => (
            <option key={type} value={type}>
              {EASING_LABELS[type]}
            </option>
          ))}
        </optgroup>
      </select>
      {easing.type === 'CUSTOM_CUBIC_BEZIER' && (
        <div className={styles.grid}>
          <CommitNumber label={`X1${suffix}`} value={easing.x1} min={0} max={1} step={0.01} onCommit={(x1) => onChange({ ...easing, x1 })} />
          <CommitNumber label={`Y1${suffix}`} value={easing.y1} min={-10} max={10} step={0.01} onCommit={(y1) => onChange({ ...easing, y1 })} />
          <CommitNumber label={`X2${suffix}`} value={easing.x2} min={0} max={1} step={0.01} onCommit={(x2) => onChange({ ...easing, x2 })} />
          <CommitNumber label={`Y2${suffix}`} value={easing.y2} min={-10} max={10} step={0.01} onCommit={(y2) => onChange({ ...easing, y2 })} />
        </div>
      )}
      {easing.type === 'CUSTOM_SPRING' && (
        <div className={styles.grid}>
          <CommitNumber label={`Stiffness${suffix}`} value={easing.stiffness} min={1} max={10_000} onCommit={(stiffness) => onChange({ ...easing, stiffness })} />
          <CommitNumber label={`Damping${suffix}`} value={easing.damping} min={0} max={1000} onCommit={(damping) => onChange({ ...easing, damping })} />
          <CommitNumber label={`Mass${suffix}`} value={easing.mass} min={0.1} max={100} step={0.1} onCommit={(mass) => onChange({ ...easing, mass })} />
        </div>
      )}
    </>
  );
}

/** The animation of an action: its type, direction, matching layers, easing and duration (springs set their own). */
function TransitionFields({ transition, suffix, scroll, onChange }: { transition: PrototypeTransition; suffix: string; scroll: boolean; onChange: (transition: PrototypeTransition) => void }) {
  // Scroll to is instant or animated.
  const types: readonly TransitionType[] = scroll ? ['INSTANT', 'SMART_ANIMATE'] : TRANSITION_TYPES;
  const label = (type: TransitionType) => (scroll && type === 'SMART_ANIMATE' ? 'Animate' : TRANSITION_LABELS[type]);
  return (
    <>
      <select className={primitives.select} aria-label={`Animation${suffix}`} value={transition.type} onKeyDown={stopKeys} onChange={(e) => onChange(makeTransition(e.target.value as TransitionType, transition))}>
        {types.map((type) => (
          <option key={type} value={type}>
            {label(type)}
          </option>
        ))}
      </select>
      {hasDirection(transition) && (
        <>
          <select className={primitives.select} aria-label={`Direction${suffix}`} value={transition.direction} onKeyDown={stopKeys} onChange={(e) => onChange({ ...transition, direction: e.target.value as TransitionDirection })}>
            {DIRECTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {DIRECTION_LABELS[direction]}
              </option>
            ))}
          </select>
          <label className={inspector.checkbox}>
            <input type="checkbox" checked={transition.matchLayers} onChange={(e) => onChange({ ...transition, matchLayers: e.target.checked })} />
            Animate matching layers
          </label>
        </>
      )}
      {transition.type !== 'INSTANT' && (
        <>
          <EasingFields easing={transition.easing} suffix={suffix} onChange={(easing) => onChange({ ...transition, easing })} />
          {!isSpringEasing(transition.easing) && <CommitNumber label={`Duration (ms)${suffix}`} value={transition.duration} min={1} max={10_000} onCommit={(duration) => onChange({ ...transition, duration })} />}
        </>
      )}
    </>
  );
}

/** Drag data for moving an action: its path. */
const ACTION_DRAG_TYPE = 'application/x-openframe-action';

/** Drop handlers for a place actions can be moved to (`to`): dropping moves the dragged action there. */
function actionDropTarget(to: ActionPath, onMove: (from: ActionPath, to: ActionPath) => void) {
  const dragging = (e: DragEvent) => e.dataTransfer.types.includes(ACTION_DRAG_TYPE);
  return {
    onDragOver: (e: DragEvent) => {
      if (!dragging(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      (e.currentTarget as HTMLElement).dataset['dropTarget'] = '';
    },
    onDragLeave: (e: DragEvent) => {
      delete (e.currentTarget as HTMLElement).dataset['dropTarget'];
    },
    onDrop: (e: DragEvent) => {
      delete (e.currentTarget as HTMLElement).dataset['dropTarget'];
      if (!dragging(e)) return;
      e.preventDefault();
      e.stopPropagation();
      onMove(JSON.parse(e.dataTransfer.getData(ACTION_DRAG_TYPE)) as ActionPath, to);
    },
  };
}

function ActionFields({
  editor,
  hotspotId,
  action,
  suffix,
  path,
  onChange,
  onRemove,
  onMove,
}: {
  editor: Editor;
  hotspotId: Id;
  action: PrototypeAction;
  suffix: string;
  /** Where the action is in its interaction. */
  path: ActionPath;
  onChange: (action: PrototypeAction) => void;
  onRemove: (() => void) | null;
  /** Moves an action (dragged, or with the arrow keys on its handle). */
  onMove: (from: ActionPath, to: ActionPath) => void;
}) {
  const kind = actionKind(action);
  const candidates = action.type === 'NODE' ? destinationCandidates(editor.doc, hotspotId, kind) : [];
  const changeKind = (next: ActionKind) => {
    const made = makeAction(next, action);
    // A destination the new action can't reach is cleared.
    onChange(made.type === 'NODE' && made.destinationId && !destinationCandidates(editor.doc, hotspotId, next).includes(made.destinationId) ? { ...made, destinationId: null } : made);
  };
  return (
    <div className={styles.action} role="group" aria-label={`Action${suffix} settings`} {...actionDropTarget(path, onMove)}>
      <div className={styles.row}>
        {/* Actions run top to bottom: drag the handle to reorder them (or into a Conditional), or press ↑ / ↓ on it. */}
        <button
          type="button"
          className={styles.dragHandle}
          draggable
          aria-label={`Move action${suffix}`}
          onDragStart={(e) => {
            e.dataTransfer.setData(ACTION_DRAG_TYPE, JSON.stringify(path));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            e.stopPropagation();
            const index = path.at(-1)!;
            const parent = path.slice(0, -1);
            // Before the previous action, or before the one after the next.
            if (e.key === 'ArrowUp' && index > 0) onMove(path, [...parent, index - 1]);
            if (e.key === 'ArrowDown') onMove(path, [...parent, index + 2]);
          }}
        >
          ⋮⋮
        </button>
        <select className={primitives.select} aria-label={`Action${suffix}`} value={kind} onKeyDown={stopKeys} onChange={(e) => changeKind(e.target.value as ActionKind)}>
          {ACTION_KINDS.filter(
            (option) =>
              option === kind ||
              (option !== 'CHANGE_TO' && option !== 'UPDATE_MEDIA_RUNTIME') ||
              (option === 'CHANGE_TO' && destinationCandidates(editor.doc, hotspotId, 'CHANGE_TO').length > 0) ||
              // Video actions control the videos in the layer's frame.
              (option === 'UPDATE_MEDIA_RUNTIME' && videoLayerCandidates(editor.doc, hotspotId).length > 0),
          ).map((option) => (
            <option key={option} value={option}>
              {ACTION_LABELS[option]}
            </option>
          ))}
        </select>
        {onRemove && <IconButton icon="minus" label={`Remove action${suffix}`} onClick={onRemove} />}
      </div>
      {action.type === 'URL' && (
        <input
          key={action.url}
          className={primitives.textInput}
          aria-label={`Link${suffix}`}
          placeholder="https://"
          defaultValue={action.url}
          spellCheck={false}
          onBlur={(e) => {
            const url = e.currentTarget.value.trim();
            if (url !== action.url) onChange({ ...action, url });
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      )}
      {action.type === 'SET_VARIABLE' && <SetVariableFields editor={editor} action={action} suffix={suffix} onChange={onChange} />}
      {action.type === 'SET_VARIABLE_MODE' && <SetVariableModeFields editor={editor} action={action} suffix={suffix} onChange={onChange} />}
      {action.type === 'CONDITIONAL' && <ConditionalFields editor={editor} hotspotId={hotspotId} action={action} suffix={suffix} path={path} onChange={onChange} onMove={onMove} />}
      {action.type === 'UPDATE_MEDIA_RUNTIME' && <MediaActionFields editor={editor} hotspotId={hotspotId} action={action} suffix={suffix} onChange={onChange} />}
      {action.type === 'NODE' && (
        <>
          <select className={primitives.select} aria-label={`Destination${suffix}`} value={action.destinationId ?? ''} onKeyDown={stopKeys} onChange={(e) => onChange({ ...action, destinationId: e.target.value || null })}>
            <option value="">None</option>
            {candidates.map((id) => (
              <option key={id} value={id}>
                {editor.doc.get(id)?.name}
              </option>
            ))}
            {action.destinationId && !candidates.includes(action.destinationId) && editor.doc.get(action.destinationId) && (
              <option value={action.destinationId}>{editor.doc.get(action.destinationId)!.name}</option>
            )}
          </select>
          {(action.navigation === 'OVERLAY' || action.navigation === 'SWAP') && action.destinationId && overlaySettings(editor.doc.get(action.destinationId) as SceneNode | undefined).position === 'MANUAL' && (
            <>
              <p className={inspector.hint}>The overlay is positioned manually: its top-left, relative to this layer&apos;s top-left.</p>
              <div className={styles.grid}>
                <CommitNumber
                  label={`Overlay X${suffix}`}
                  value={action.overlayRelativePosition?.x ?? 0}
                  min={-100_000}
                  max={100_000}
                  onCommit={(x) => onChange({ ...action, overlayRelativePosition: { x, y: action.overlayRelativePosition?.y ?? 0 } })}
                />
                <CommitNumber
                  label={`Overlay Y${suffix}`}
                  value={action.overlayRelativePosition?.y ?? 0}
                  min={-100_000}
                  max={100_000}
                  onCommit={(y) => onChange({ ...action, overlayRelativePosition: { x: action.overlayRelativePosition?.x ?? 0, y } })}
                />
              </div>
            </>
          )}
          <TransitionFields transition={action.transition} suffix={suffix} scroll={action.navigation === 'SCROLL_TO'} onChange={(transition) => onChange({ ...action, transition })} />
          {action.navigation !== 'SCROLL_TO' && (
            <label className={inspector.checkbox}>
              <input
                type="checkbox"
                checked={action.resetScrollPosition ?? false}
                onChange={(e) => {
                  const { resetScrollPosition: _reset, ...rest } = action;
                  onChange(e.target.checked ? { ...rest, resetScrollPosition: true } : rest);
                }}
              />
              Reset scroll position
            </label>
          )}
          {action.navigation !== 'SCROLL_TO' && action.navigation !== 'CHANGE_TO' && (
            <label className={inspector.checkbox}>
              <input
                type="checkbox"
                checked={action.resetVideoPosition ?? false}
                onChange={(e) => {
                  const { resetVideoPosition: _reset, ...rest } = action;
                  onChange(e.target.checked ? { ...rest, resetVideoPosition: true } : rest);
                }}
              />
              Reset video state
            </label>
          )}
          {action.navigation !== 'SCROLL_TO' && action.navigation !== 'CHANGE_TO' && (
            <label className={inspector.checkbox}>
              <input
                type="checkbox"
                checked={action.resetInteractiveComponents ?? false}
                onChange={(e) => {
                  const { resetInteractiveComponents: _reset, ...rest } = action;
                  onChange(e.target.checked ? { ...rest, resetInteractiveComponents: true } : rest);
                }}
              />
              Reset component state
            </label>
          )}
        </>
      )}
    </div>
  );
}

/** A video action: the layer whose video it controls, what it does, and the seconds it jumps by or the time it sets. */
function MediaActionFields({
  editor,
  hotspotId,
  action,
  suffix,
  onChange,
}: {
  editor: Editor;
  hotspotId: Id;
  action: Extract<PrototypeAction, { type: 'UPDATE_MEDIA_RUNTIME' }>;
  suffix: string;
  onChange: (action: PrototypeAction) => void;
}) {
  const candidates = videoLayerCandidates(editor.doc, hotspotId);
  return (
    <>
      <select className={primitives.select} aria-label={`Video${suffix}`} value={action.destinationId ?? ''} onKeyDown={stopKeys} onChange={(e) => onChange({ ...action, destinationId: e.target.value || null })}>
        <option value="">None</option>
        {candidates.map((id) => (
          <option key={id} value={id}>
            {editor.doc.get(id)?.name}
          </option>
        ))}
      </select>
      <select
        className={primitives.select}
        aria-label={`Video action${suffix}`}
        value={action.mediaAction}
        onKeyDown={stopKeys}
        onChange={(e) => {
          const mediaAction = e.target.value as MediaAction;
          const { amount, ...rest } = action;
          onChange(MEDIA_ACTIONS_WITH_AMOUNT.has(mediaAction) ? { ...rest, mediaAction, amount: amount ?? (mediaAction === 'SKIP_TO' ? 0 : 5) } : { ...rest, mediaAction });
        }}
      >
        {MEDIA_ACTIONS.map((option) => (
          <option key={option} value={option}>
            {MEDIA_ACTION_LABELS[option]}
          </option>
        ))}
      </select>
      {MEDIA_ACTIONS_WITH_AMOUNT.has(action.mediaAction) && (
        <CommitNumber
          label={action.mediaAction === 'SKIP_TO' ? `Time (s)${suffix}` : `Seconds${suffix}`}
          value={action.amount ?? 0}
          min={0}
          max={86_400}
          step={0.1}
          onCommit={(amount) => onChange({ ...action, amount })}
        />
      )}
    </>
  );
}

const isValidExpression = (text: string): boolean => {
  try {
    parseExpression(text);
    return true;
  } catch {
    return false;
  }
};
const HEX_COLOR = /^#?[0-9a-f]{6}([0-9a-f]{2})?$/i;

/** An expression (or, for colors, a hex code) typed and committed on Enter or blur, outlined in red while it isn't valid. */
function ExpressionInput({ label, value, color = false, onCommit }: { label: string; value: string; color?: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const valid = text.trim() === '' || (color ? HEX_COLOR.test(text.trim()) : isValidExpression(text));
  return (
    <input
      className={`${primitives.textInput} ${valid ? '' : styles.invalid}`}
      aria-label={label}
      aria-invalid={!valid || undefined}
      placeholder={color ? '#000000' : 'e.g. {count} + 1'}
      value={text}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** Set variable: the variable to set and the expression its new value comes from (a hex code for colors). */
function SetVariableFields({ editor, action, suffix, onChange }: { editor: Editor; action: Extract<PrototypeAction, { type: 'SET_VARIABLE' }>; suffix: string; onChange: (action: PrototypeAction) => void }) {
  const variable = action.variableId ? editor.doc.get(action.variableId) : undefined;
  const color = variable?.type === 'VARIABLE' && variable.resolvedType === 'COLOR';
  return (
    <>
      <select className={primitives.select} aria-label={`Variable${suffix}`} value={action.variableId ?? ''} onKeyDown={stopKeys} onChange={(e) => onChange({ ...action, variableId: e.target.value || null })}>
        <option value="">Choose a variable</option>
        {localCollections(editor.doc).map((collection) => (
          <optgroup key={collection.id} label={collection.name}>
            {collectionVariables(editor.doc, collection.id).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ExpressionInput label={`Value${suffix}`} value={action.expression} color={color} onCommit={(expression) => onChange({ ...action, expression })} />
    </>
  );
}

/** Set variable mode: the collection and the mode the page switches it to. */
function SetVariableModeFields({ editor, action, suffix, onChange }: { editor: Editor; action: Extract<PrototypeAction, { type: 'SET_VARIABLE_MODE' }>; suffix: string; onChange: (action: PrototypeAction) => void }) {
  const collection = action.collectionId ? editor.doc.get(action.collectionId) : undefined;
  return (
    <>
      <select className={primitives.select} aria-label={`Collection${suffix}`} value={action.collectionId ?? ''} onKeyDown={stopKeys} onChange={(e) => onChange({ ...action, collectionId: e.target.value || null, modeId: null })}>
        <option value="">Choose a collection</option>
        {localCollections(editor.doc).map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {isVariableCollection(collection) && (
        <select className={primitives.select} aria-label={`Mode${suffix}`} value={action.modeId ?? ''} onKeyDown={stopKeys} onChange={(e) => onChange({ ...action, modeId: e.target.value || null })}>
          <option value="">Choose a mode</option>
          {collection.modes.map((mode) => (
            <option key={mode.modeId} value={mode.modeId}>
              {mode.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

/** Conditional: the If condition and its actions, and the Else actions that run when it doesn't hold. */
function ConditionalFields({
  editor,
  hotspotId,
  action,
  suffix,
  path,
  onChange,
  onMove,
}: {
  editor: Editor;
  hotspotId: Id;
  action: Extract<PrototypeAction, { type: 'CONDITIONAL' }>;
  suffix: string;
  path: ActionPath;
  onChange: (action: PrototypeAction) => void;
  onMove: (from: ActionPath, to: ActionPath) => void;
}) {
  const setBlock = (index: number, block: (typeof action.blocks)[number]) => onChange({ ...action, blocks: action.blocks.map((existing, i) => (i === index ? block : existing)) });
  return (
    <div className={styles.conditional}>
      {action.blocks.map((block, index) => {
        const branch = block.condition === null ? 'else' : 'if';
        return (
          <div key={index} className={styles.block} role="group" aria-label={`${branch === 'if' ? 'If' : 'Else'}${suffix}`}>
            {block.condition === null ? (
              <span className={styles.fieldLabel}>Else</span>
            ) : (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>If</span>
                <ExpressionInput label={`Condition${suffix}`} value={block.condition} onCommit={(condition) => setBlock(index, { ...block, condition })} />
              </label>
            )}
            {block.actions.map((nested, i) => (
              <ActionFields
                key={i}
                editor={editor}
                hotspotId={hotspotId}
                action={nested}
                suffix={`${suffix} ${branch} ${i + 1}`}
                path={[...path, index, i]}
                onChange={(next) => setBlock(index, { ...block, actions: block.actions.map((existing, j) => (j === i ? next : existing)) })}
                onRemove={() => setBlock(index, { ...block, actions: block.actions.filter((_, j) => j !== i) })}
                onMove={onMove}
              />
            ))}
            {/* Dropping an action on the button moves it to the end of this block. */}
            <button
              type="button"
              className={styles.textButton}
              disabled={block.actions.length >= 32}
              onClick={() => setBlock(index, { ...block, actions: [...block.actions, makeAction('NAVIGATE')] })}
              {...actionDropTarget([...path, index, block.actions.length], onMove)}
            >
              {branch === 'if' ? 'Add if action' : 'Add else action'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** The Interaction details of one interaction: its trigger (with its delay or key) and its actions. */
function InteractionDetails({ ids, hotspotId, reactions, index }: { ids: readonly Id[]; hotspotId: Id; reactions: readonly Reaction[]; index: number }) {
  const editor = useEditor();
  const reaction = reactions[index]!;
  const change = (next: Reaction) => updateInteraction(editor, ids, index, next);
  const moveActions = (from: ActionPath, to: ActionPath) => {
    const actions = moveAction(reaction.actions, from, to);
    // An interaction keeps at least one action of its own.
    if (actions && actions.length > 0) change({ ...reaction, actions });
  };
  const { trigger } = reaction;
  // While the Key field has focus, a gamepad button pressed becomes the trigger.
  const [keyFocused, setKeyFocused] = useState(false);
  useGamepadButtons(trigger.type === 'ON_KEY_DOWN' && keyFocused, (button) => change({ ...reaction, trigger: { type: 'ON_KEY_DOWN', keys: [gamepadCode(button)] } }));
  return (
    <div className={styles.details} role="group" aria-label="Interaction details">
      <select className={primitives.select} aria-label="Trigger" value={trigger.type} onKeyDown={stopKeys} onChange={(e) => change({ ...reaction, trigger: makeTrigger(e.target.value as TriggerType) })}>
        {/* Video triggers are for layers with a video fill. */}
        {TRIGGER_TYPES.filter((type) => !MEDIA_TRIGGERS.has(type) || type === trigger.type || videoFillsOf(editor.doc.get(hotspotId) as SceneNode | undefined).length > 0).map((type) => (
          <option key={type} value={type} disabled={!triggerAllowed(reactions, type, index)}>
            {TRIGGER_LABELS[type]}
          </option>
        ))}
      </select>
      {trigger.type === 'AFTER_TIMEOUT' && <CommitNumber label="Delay (ms)" value={trigger.timeout} min={0} max={600_000} onCommit={(timeout) => change({ ...reaction, trigger: { ...trigger, timeout } })} />}
      {trigger.type === 'ON_MEDIA_HIT' && (
        <CommitNumber label="Video time (s)" value={trigger.mediaHitTime} min={0} max={86_400} step={0.1} onCommit={(mediaHitTime) => change({ ...reaction, trigger: { ...trigger, mediaHitTime } })} />
      )}
      {trigger.type === 'ON_KEY_DOWN' && (
        <input
          className={primitives.textInput}
          aria-label="Key"
          readOnly
          onFocus={() => setKeyFocused(true)}
          onBlur={() => setKeyFocused(false)}
          value={trigger.keys.map(keyLabel).join(' + ')}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();
            if (MODIFIER_CODES.has(e.code)) return;
            const modifiers = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter((key): key is string => typeof key === 'string');
            change({ ...reaction, trigger: { type: 'ON_KEY_DOWN', keys: [...modifiers, e.code] } });
          }}
        />
      )}
      {reaction.actions.map((action, i) => (
        <ActionFields
          key={i}
          editor={editor}
          hotspotId={hotspotId}
          action={action}
          suffix={i === 0 ? '' : ` ${i + 1}`}
          path={[i]}
          onChange={(next) => change({ ...reaction, actions: reaction.actions.map((existing, j) => (j === i ? next : existing)) })}
          onRemove={reaction.actions.length > 1 ? () => change({ ...reaction, actions: reaction.actions.filter((_, j) => j !== i) }) : null}
          onMove={moveActions}
        />
      ))}
      <button
        type="button"
        className={styles.textButton}
        disabled={reaction.actions.length >= 32}
        onClick={() => change({ ...reaction, actions: [...reaction.actions, makeAction('NAVIGATE')] })}
        {...actionDropTarget([reaction.actions.length], moveActions)}
      >
        Add action
      </button>
    </div>
  );
}

const hex2 = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
const colorHex = (color: Color) => `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
const hexColor = (hex: string, a: number): Color => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255, a });

/** A text field committed on blur (or Enter, for single-line fields). */
function CommitText({ label, value, multiline = false, onCommit }: { label: string; value: string; multiline?: boolean; onCommit: (value: string) => void }) {
  const props = {
    key: value,
    className: primitives.textInput,
    'aria-label': label,
    defaultValue: value,
    onBlur: (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !multiline) e.currentTarget.blur();
    },
  };
  return multiline ? <textarea {...props} rows={3} placeholder="Description" /> : <input {...props} />;
}

/**
 * With nothing selected: the prototype settings of the page. Device (a device preset — the one matching the first
 * screen when none is set — a custom size, the presentation, or none), its orientation, and the background color
 * presentation view shows behind the prototype.
 */
function PrototypeSettingsSection() {
  const editor = useEditor();
  const pageId = useEditorState((s) => s.activePageId);
  const page = editor.doc.get(pageId);
  if (page?.type !== 'PAGE') return null;
  const device = effectiveDevice(editor.doc, pageId);
  const value = device.kind === 'PRESET' ? device.preset.id : device.kind;
  const rotation = device.kind === 'PRESET' && device.landscape ? 'CCW_90' : 'NONE';
  const background = page.prototypeBackground ?? page.backgroundColor;
  return (
    <section className={inspector.section} aria-label="Prototype settings">
      <header className={inspector.sectionHeader}>
        <h3 className={inspector.sectionTitle}>Prototype settings</h3>
      </header>
      <div className={inspector.sectionBody}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Device</span>
          <select
            className={primitives.select}
            aria-label="Device"
            value={value}
            onKeyDown={stopKeys}
            onChange={(e) => {
              const next = e.target.value;
              // None is stored too, so a matching frame preset doesn't pick a device again.
              if (next === 'NONE' || next === 'CUSTOM' || next === 'PRESENTATION') setPrototypeDevice(editor, pageId, { type: next, rotation: 'NONE' });
              else setPrototypeDevice(editor, pageId, { type: 'PRESET', presetId: next, rotation });
            }}
          >
            <option value="NONE">None</option>
            <option value="CUSTOM">Custom size (Fit)</option>
            <option value="PRESENTATION">Presentation (Full)</option>
            {[...DEVICE_CATEGORIES].map((category) => (
              <optgroup key={category} label={category}>
                {presetsIn(category).map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {device.kind === 'PRESET' && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Orientation</span>
            <select
              className={primitives.select}
              aria-label="Orientation"
              value={rotation}
              onKeyDown={stopKeys}
              onChange={(e) => setPrototypeDevice(editor, pageId, { type: 'PRESET', presetId: device.preset.id, rotation: e.target.value as 'NONE' | 'CCW_90' })}
            >
              <option value="NONE">Portrait</option>
              <option value="CCW_90">Landscape</option>
            </select>
          </label>
        )}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Background</span>
          <input className={styles.color} type="color" aria-label="Prototype background" value={colorHex(background)} onChange={(e) => setPrototypeBackground(editor, pageId, hexColor(e.target.value, 1))} />
        </label>
      </div>
    </section>
  );
}

/** With nothing selected: the page's flows, each with a button selecting its starting frame. */
function FlowsSection() {
  const editor = useEditor();
  const pageId = useEditorState((s) => s.activePageId);
  const flows = flowsOf(editor.doc, pageId);
  return (
    <section className={inspector.section} aria-label="Flows">
      <header className={inspector.sectionHeader}>
        <h3 className={inspector.sectionTitle}>Flows</h3>
      </header>
      <div className={inspector.sectionBody}>
        {flows.length === 0 ? (
          <p className={inspector.hint}>Connect two frames, or select a top-level frame and add a flow starting point.</p>
        ) : (
          <ul className={styles.list} aria-label="Flow list">
            {flows.map((flow) => (
              <li key={flow.nodeId} className={styles.flow}>
                <div className={styles.flowText}>
                  <span className={styles.flowName}>{flow.name}</span>
                  {flow.description && <FlowDescription text={flow.description} className={styles.flowDescription} label={`${flow.name} description`} />}
                </div>
                <button
                  type="button"
                  className={styles.textButton}
                  aria-label={`Select frame of ${flow.name}`}
                  onClick={() => {
                    editor.state.select([flow.nodeId]);
                    editor.commands.run('view.zoomToSelection');
                  }}
                >
                  Select frame
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** For a selected top-level frame: its flow starting point (name and description), or + to add one. */
function FlowStartingPointSection({ frameId, pageId }: { frameId: Id; pageId: Id }) {
  const editor = useEditor();
  const flow = flowsOf(editor.doc, pageId).find((candidate) => candidate.nodeId === frameId);
  return (
    <section className={inspector.section} aria-label="Flow starting point">
      <header className={inspector.sectionHeader}>
        <h3 className={inspector.sectionTitle}>Flow starting point</h3>
        <div className={inspector.sectionActions}>
          {flow ? (
            <IconButton icon="minus" label="Remove starting point" onClick={() => removeFlowStartingPoint(editor, frameId)} />
          ) : (
            <IconButton icon="plus" label="Add starting point" onClick={() => addFlowStartingPoint(editor, frameId)} />
          )}
        </div>
      </header>
      {flow && (
        <div className={inspector.sectionBody}>
          <CommitText label="Flow name" value={flow.name} onCommit={(name) => updateFlowStartingPoint(editor, frameId, { name })} />
          {flow.description && <FlowDescription text={flow.description} className={styles.flowDescription} />}
          <DescriptionEditor value={flow.description ?? ''} onSave={(description) => updateFlowStartingPoint(editor, frameId, { description })} />
        </div>
      )}
    </section>
  );
}

/** Links a description can hold: web pages and email. */
const LINK_ADDRESS = /^(https?:\/\/\S+|mailto:\S+)$/i;

/**
 * Edit description: the flow's description with formatting buttons (bold, bulleted and numbered lists, links) and a
 * preview of how it shows; closing the panel saves it. The text holds its formatting as light markup.
 */
function DescriptionEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [href, setHref] = useState('https://');
  const area = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  // After formatting, the formatted text stays selected.
  useLayoutEffect(() => {
    const range = selection.current;
    if (!range || !area.current) return;
    selection.current = null;
    area.current.focus();
    area.current.setSelectionRange(range.start, range.end);
  });
  if (!open) {
    return (
      <button
        type="button"
        className={styles.textButton}
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        Edit description
      </button>
    );
  }
  const format = (kind: DescriptionFormat) => {
    const start = area.current?.selectionStart ?? draft.length;
    const end = area.current?.selectionEnd ?? draft.length;
    const next = formatDescription(draft, start, end, kind, href.trim());
    selection.current = { start: next.start, end: next.end };
    setDraft(next.text);
  };
  return (
    <div className={styles.details} role="group" aria-label="Description">
      <div className={styles.row}>
        <button type="button" className={styles.textButton} onClick={() => format('bold')}>
          Bold
        </button>
        <button type="button" className={styles.textButton} onClick={() => format('bullets')}>
          Bulleted list
        </button>
        <button type="button" className={styles.textButton} onClick={() => format('numbers')}>
          Numbered list
        </button>
        <IconButton
          icon="close"
          label="Close description"
          onClick={() => {
            if (draft !== value) onSave(draft);
            setOpen(false);
          }}
        />
      </div>
      <textarea ref={area} className={primitives.textInput} aria-label="Flow description" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={stopKeys} />
      <div className={styles.row}>
        <input className={primitives.textInput} aria-label="Link address" value={href} spellCheck={false} onChange={(e) => setHref(e.target.value)} onKeyDown={stopKeys} />
        <button type="button" className={styles.textButton} disabled={!LINK_ADDRESS.test(href.trim())} onClick={() => format('link')}>
          Add link
        </button>
      </div>
      {draft.trim() && <FlowDescription text={draft} className={styles.flowDescription} label="Description preview" />}
    </div>
  );
}

/**
 * Scroll behavior: the Overflow of selected frames, and the Position of selected layers in a frame that scrolls (Sticky
 * needs vertical scrolling; Fixed isn't available in auto layout unless the layer has absolute position).
 */
function ScrollBehaviorSection({ nodes }: { nodes: readonly SceneNode[] }) {
  const editor = useEditor();
  const ids = nodes.map((node) => node.id);
  const frames = nodes.filter((node) => node.type === 'FRAME');
  const allFrames = frames.length === nodes.length;
  const scrollFrames = nodes.map((node) => scrollFrameOf(editor.doc, node.id));
  const inScrollFrames = scrollFrames.every((id) => id !== null);
  if (!allFrames && !inScrollFrames) return null;
  const common = <T,>(values: readonly T[]): T | '' => (values.every((value) => value === values[0]) ? values[0]! : '');
  const overflow = common(frames.map((node) => overflowOf(node)));
  const position = common(nodes.map((node) => node.scrollBehavior ?? 'SCROLLS'));
  const stickyAllowed = scrollFrames.every((id) => id !== null && ['VERTICAL', 'BOTH'].includes(overflowOf(editor.doc.get(id) as SceneNode)));
  const fixedAllowed = nodes.every((node) => !isAutoLayoutFrame(editor.doc.get(node.parent.id)) || node.layoutPositioning === 'ABSOLUTE');
  const tooSmall = allFrames && frames.some((node) => needsBiggerContent(editor.doc, editor.scene, node.id));
  return (
    <section className={inspector.section} aria-label="Scroll behavior">
      <header className={inspector.sectionHeader}>
        <h3 className={inspector.sectionTitle}>Scroll behavior</h3>
      </header>
      <div className={inspector.sectionBody}>
        {allFrames && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Overflow</span>
            <select className={primitives.select} aria-label="Overflow" value={overflow} onKeyDown={stopKeys} onChange={(e) => setOverflowDirection(editor, ids, e.target.value as OverflowDirection)}>
              {overflow === '' && <option value="">Mixed</option>}
              {OVERFLOW_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {OVERFLOW_LABELS[direction]}
                </option>
              ))}
            </select>
          </label>
        )}
        {tooSmall && (
          <p className={inspector.hint} role="alert">
            For scrolling to work on this frame, the content needs to be bigger than the frame.
          </p>
        )}
        {inScrollFrames && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Position</span>
            <select className={primitives.select} aria-label="Scroll position" value={position} onKeyDown={stopKeys} onChange={(e) => setScrollBehavior(editor, ids, e.target.value as ScrollBehavior)}>
              {position === '' && <option value="">Mixed</option>}
              {SCROLL_BEHAVIORS.map((behavior) => (
                <option key={behavior} value={behavior} disabled={(behavior === 'STICKY_SCROLLS' && !stickyAllowed) || (behavior === 'FIXED' && !fixedAllowed)}>
                  {SCROLL_BEHAVIOR_LABELS[behavior]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}

/** For a selected frame that opens as an overlay: its position, closing when clicking outside, and background. */
function OverlaySection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const settings = overlaySettings(node);
  const change = (patch: Partial<OverlaySettings>) => setOverlaySettings(editor, node.id, patch);
  return (
    <section className={inspector.section} aria-label="Overlay">
      <header className={inspector.sectionHeader}>
        <h3 className={inspector.sectionTitle}>Overlay</h3>
      </header>
      <div className={inspector.sectionBody}>
        <select className={primitives.select} aria-label="Overlay position" value={settings.position} onKeyDown={stopKeys} onChange={(e) => change({ position: e.target.value as OverlaySettings['position'] })}>
          {(Object.keys(OVERLAY_POSITION_LABELS) as OverlaySettings['position'][]).map((position) => (
            <option key={position} value={position}>
              {OVERLAY_POSITION_LABELS[position]}
            </option>
          ))}
        </select>
        {settings.position === 'MANUAL' && <p className={inspector.hint}>Each interaction that opens this overlay sets where it shows, relative to the layer it is on.</p>}
        <label className={inspector.checkbox}>
          <input type="checkbox" checked={settings.closeOnClickOutside} onChange={(e) => change({ closeOnClickOutside: e.target.checked })} />
          Close when clicking outside
        </label>
        <label className={inspector.checkbox}>
          <input type="checkbox" checked={settings.background !== null} onChange={(e) => change({ background: e.target.checked ? DEFAULT_OVERLAY_BACKGROUND : null })} />
          Add background behind overlay
        </label>
        {settings.background && (
          <div className={styles.grid}>
            <input className={styles.color} type="color" aria-label="Overlay background color" value={colorHex(settings.background)} onChange={(e) => change({ background: hexColor(e.target.value, settings.background!.a) })} />
            <CommitNumber label="Opacity (%)" value={Math.round(settings.background.a * 100)} min={0} max={100} onCommit={(percent) => change({ background: { ...settings.background!, a: percent / 100 } })} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Video: how the video fills of the selected layers play in presentation view (autoplay, loop and sound). */
function VideoSection({ nodes }: { nodes: readonly SceneNode[] }) {
  const editor = useEditor();
  const options = nodes.flatMap((node) => videoFillsOf(node)).map((fill) => videoOptionsOf(fill.paint));
  if (options.length === 0) return null;
  const ids = nodes.map((node) => node.id);
  const every = (key: keyof VideoOptions) => options.every((option) => option[key]);
  return (
    <section className={inspector.section} aria-label="Video">
      <header className={inspector.sectionHeader}>
        <h3 className={inspector.sectionTitle}>Video</h3>
      </header>
      <div className={inspector.sectionBody}>
        <label className={inspector.checkbox}>
          <input type="checkbox" checked={every('autoplay')} onChange={(e) => setVideoOptions(editor, ids, { autoplay: e.target.checked })} />
          Autoplay
        </label>
        <label className={inspector.checkbox}>
          <input type="checkbox" checked={every('loop')} onChange={(e) => setVideoOptions(editor, ids, { loop: e.target.checked })} />
          Loop
        </label>
        <label className={inspector.checkbox}>
          <input type="checkbox" checked={!options.some((option) => option.muted)} onChange={(e) => setVideoOptions(editor, ids, { muted: !e.target.checked })} />
          Sound
        </label>
      </div>
    </section>
  );
}

/**
 * The Prototype tab of the right sidebar: the page's flows while nothing is selected; for a selected top-level frame, its
 * flow starting point (and its overlay settings when it opens as an overlay); and the selected layers' interactions. +
 * adds one (to each selected layer), and an interaction opens its details — trigger, actions, destination and animation.
 */
export function PrototypePanel() {
  const editor = useEditor();
  useDocumentRevision();
  const selection = useEditorState((s) => s.selection);
  const selectedConnections = useEditorState((s) => s.selectedConnections);
  const [open, setOpen] = useState<number | null>(null);
  const nodes = selection.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && 'transform' in node);

  if (nodes.length === 0) {
    return (
      <div className={styles.panel} role="tabpanel" aria-label="Prototype">
        <PrototypeSettingsSection />
        <FlowsSection />
      </div>
    );
  }
  const ids = nodes.map((node) => node.id);
  const mixed = new Set(nodes.map((node) => JSON.stringify(node.reactions ?? []))).size > 1;
  const reactions = mixed ? [] : (nodes[0]!.reactions ?? []);
  const frame = nodes.length === 1 && topLevelFrame(editor.doc, nodes[0]!.id) === nodes[0]!.id ? nodes[0]! : null;
  // A connection selected on the canvas opens its interaction's details.
  const focused = selectedConnections.length === 1 && nodes.length === 1 && selectedConnections[0]!.sourceId === nodes[0]!.id ? selectedConnections[0]!.reactionIndex : null;
  const openIndex = focused ?? open;

  return (
    <div className={styles.panel} role="tabpanel" aria-label="Prototype">
      {frame && <FlowStartingPointSection frameId={frame.id} pageId={editor.doc.pageOf(frame.id) ?? frame.parent.id} />}
      <section className={inspector.section} aria-label="Interactions">
        <header className={inspector.sectionHeader}>
          <h3 className={inspector.sectionTitle}>Interactions</h3>
          <div className={inspector.sectionActions}>
            <IconButton
              icon="plus"
              label="Add interaction"
              onClick={() => {
                editor.state.selectConnections([]);
                if (addInteraction(editor, ids) && !mixed) setOpen(reactions.length);
              }}
            />
          </div>
        </header>
        {(mixed || reactions.length > 0) && (
          <div className={inspector.sectionBody}>
            {mixed && <p className={inspector.hint}>The selected layers have different interactions. Click + to add one to each.</p>}
            <ul className={styles.list} aria-label="Interaction list">
              {reactions.map((reaction, index) => (
                <li key={index} className={styles.item}>
                  <button
                    type="button"
                    className={styles.summary}
                    aria-expanded={openIndex === index}
                    onClick={() => {
                      editor.state.selectConnections([]);
                      setOpen(openIndex === index ? null : index);
                    }}
                  >
                    {reactionSummary(editor.doc, reaction)}
                  </button>
                  <IconButton
                    icon="minus"
                    label={`Remove interaction ${index + 1}`}
                    onClick={() => {
                      removeInteraction(editor, ids, index);
                      setOpen(null);
                    }}
                  />
                  {openIndex === index && <InteractionDetails ids={ids} hotspotId={ids[0]!} reactions={reactions} index={index} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <VideoSection nodes={nodes} />
      <ScrollBehaviorSection nodes={nodes} />
      {frame && isOverlayDestination(editor.doc, editor.doc.pageOf(frame.id) ?? frame.parent.id, frame.id) && <OverlaySection node={frame} />}
    </div>
  );
}
