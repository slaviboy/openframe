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

import { useState, type KeyboardEvent } from 'react';
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
  reactionSummary,
  TRANSITION_LABELS,
  TRANSITION_TYPES,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  triggerAllowed,
  type ActionKind,
  type EasingType,
  type TransitionDirection,
  type TransitionType,
  type TriggerType,
} from '@/core/prototype/reactions';
import type { PrototypeAction, PrototypeEasing, PrototypeTransition, Reaction, SceneNode } from '@/core/schema/document';
import { addInteraction, removeInteraction, updateInteraction } from '@/editor/commands/prototype';
import type { Editor } from '@/editor/editor';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { IconButton } from '../../primitives/IconButton';
import primitives from '../../primitives/primitives.module.css';
import inspector from '../inspector/Inspector.module.css';
import styles from './PrototypePanel.module.css';

const SPRING_TYPES: ReadonlySet<EasingType> = new Set(['GENTLE', 'QUICK', 'BOUNCY', 'SLOW', 'CUSTOM_SPRING']);
const MODIFIER_CODES: ReadonlySet<string> = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

/** A key as the Key field shows it: KeyK as K, Digit1 as 1. */
const keyLabel = (code: string) => code.replace(/^Key(?=[A-Z]$)/, '').replace(/^Digit(?=\d$)/, '');

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

function ActionFields({ editor, hotspotId, action, suffix, onChange, onRemove }: { editor: Editor; hotspotId: Id; action: PrototypeAction; suffix: string; onChange: (action: PrototypeAction) => void; onRemove: (() => void) | null }) {
  const kind = actionKind(action);
  const candidates = action.type === 'NODE' ? destinationCandidates(editor.doc, hotspotId, kind) : [];
  const changeKind = (next: ActionKind) => {
    const made = makeAction(next, action);
    // A destination the new action can't reach is cleared.
    onChange(made.type === 'NODE' && made.destinationId && !destinationCandidates(editor.doc, hotspotId, next).includes(made.destinationId) ? { ...made, destinationId: null } : made);
  };
  return (
    <div className={styles.action} role="group" aria-label={`Action${suffix} settings`}>
      <div className={styles.row}>
        <select className={primitives.select} aria-label={`Action${suffix}`} value={kind} onKeyDown={stopKeys} onChange={(e) => changeKind(e.target.value as ActionKind)}>
          {ACTION_KINDS.map((option) => (
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
        </>
      )}
    </div>
  );
}

/** The Interaction details of one interaction: its trigger (with its delay or key) and its actions. */
function InteractionDetails({ ids, hotspotId, reactions, index }: { ids: readonly Id[]; hotspotId: Id; reactions: readonly Reaction[]; index: number }) {
  const editor = useEditor();
  const reaction = reactions[index]!;
  const change = (next: Reaction) => updateInteraction(editor, ids, index, next);
  const { trigger } = reaction;
  return (
    <div className={styles.details} role="group" aria-label="Interaction details">
      <select className={primitives.select} aria-label="Trigger" value={trigger.type} onKeyDown={stopKeys} onChange={(e) => change({ ...reaction, trigger: makeTrigger(e.target.value as TriggerType) })}>
        {TRIGGER_TYPES.map((type) => (
          <option key={type} value={type} disabled={!triggerAllowed(reactions, type, index)}>
            {TRIGGER_LABELS[type]}
          </option>
        ))}
      </select>
      {trigger.type === 'AFTER_TIMEOUT' && <CommitNumber label="Delay (ms)" value={trigger.timeout} min={0} max={600_000} onCommit={(timeout) => change({ ...reaction, trigger: { ...trigger, timeout } })} />}
      {trigger.type === 'ON_KEY_DOWN' && (
        <input
          className={primitives.textInput}
          aria-label="Key"
          readOnly
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
          onChange={(next) => change({ ...reaction, actions: reaction.actions.map((existing, j) => (j === i ? next : existing)) })}
          onRemove={reaction.actions.length > 1 ? () => change({ ...reaction, actions: reaction.actions.filter((_, j) => j !== i) }) : null}
        />
      ))}
      <button type="button" className={styles.textButton} disabled={reaction.actions.length >= 32} onClick={() => change({ ...reaction, actions: [...reaction.actions, makeAction('NAVIGATE')] })}>
        Add action
      </button>
    </div>
  );
}

/**
 * The Prototype tab of the right sidebar: the selected layers' interactions. + adds one (to each selected layer), and
 * an interaction opens its details — trigger, actions, destination and animation.
 */
export function PrototypePanel() {
  const editor = useEditor();
  useDocumentRevision();
  const selection = useEditorState((s) => s.selection);
  const [open, setOpen] = useState<number | null>(null);
  const nodes = selection.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && 'transform' in node);

  if (nodes.length === 0) {
    return (
      <div className={styles.panel} role="tabpanel" aria-label="Prototype">
        <p className={inspector.hint}>Select a layer to add interactions.</p>
      </div>
    );
  }
  const ids = nodes.map((node) => node.id);
  const mixed = new Set(nodes.map((node) => JSON.stringify(node.reactions ?? []))).size > 1;
  const reactions = mixed ? [] : (nodes[0]!.reactions ?? []);

  return (
    <div className={styles.panel} role="tabpanel" aria-label="Prototype">
      <section className={inspector.section} aria-label="Interactions">
        <header className={inspector.sectionHeader}>
          <h3 className={inspector.sectionTitle}>Interactions</h3>
          <div className={inspector.sectionActions}>
            <IconButton
              icon="plus"
              label="Add interaction"
              onClick={() => {
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
                  <button type="button" className={styles.summary} aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>
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
                  {open === index && <InteractionDetails ids={ids} hotspotId={ids[0]!} reactions={reactions} index={index} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
