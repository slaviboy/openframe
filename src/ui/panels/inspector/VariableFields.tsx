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

import { useState } from 'react';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type Paint, type SceneNode, type VariableNode } from '@/core/schema/document';
import { isVariable, localCollections, resolveForLayer, variableLookup, VARIANT_BINDING_PREFIX, type BindableField, type VariablePaintField } from '@/core/variables/document';
import type { ResolvedValue } from '@/core/variables/resolve';
import { bindVariable, bindVariantVariable, setExplicitVariableMode, unbindPaintVariable, unbindVariable, unbindVariantVariable, variablesFor, variantVariablesFor } from '@/editor/commands/variables';
import { bindPropertyDefaultVariable, propertyDefaultVariables, unbindPropertyDefaultVariable } from '@/editor/commands/component-properties';
import type { Editor } from '@/editor/editor';
import dialogStyles from '../../dialogs/Dialog.module.css';
import { useEditor } from '../../hooks/useEditor';
import { IconButton } from '../../primitives/IconButton';
import { Menu, type MenuEntry } from '../../primitives/Menu';
import { NumberField, type NumberFieldProps } from '../../primitives/NumberField';
import findStyles from '../find/FindPanel.module.css';
import styles from './Inspector.module.css';
import { Dialog } from './StylesPanel';

const hex2 = (channel: number) =>
  Math.round(channel * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

/** A resolved variable value as shown in pickers. */
function formatValue(value: ResolvedValue | null): string {
  if (value === null) return '';
  if (typeof value === 'object') return `#${hex2(value.r)}${hex2(value.g)}${hex2(value.b)}${value.a < 1 ? ` ${Math.round(value.a * 100)}%` : ''}`;
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  return String(value);
}

/** Apply variable: the variables offered for a property of the selected layers (by type and scope), searchable by name. */
export function VariablePicker({ ids, field, onClose }: { ids: readonly Id[]; field: BindableField; onClose: () => void }) {
  const editor = useEditor();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const lookup = variableLookup(editor.doc);
  const offered = variablesFor(editor, ids, field);
  const found = offered.filter((v) => v.name.toLowerCase().includes(needle));
  return (
    <Dialog
      title="Apply variable"
      onClose={onClose}
      footer={
        <button type="button" className={dialogStyles.secondary} onClick={onClose}>
          Close
        </button>
      }
    >
      <input className={dialogStyles.input} type="search" aria-label="Search variables" placeholder="Search variables" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
      {found.length === 0 ? (
        <p>{offered.length === 0 ? 'No variables can be applied to this property. Create one in the variables view.' : 'No matching variables.'}</p>
      ) : (
        <ul className={findStyles.results} aria-label="Variables">
          {found.map((variable) => (
            <li key={variable.id}>
              <button
                type="button"
                className={findStyles.result}
                title={variable.description}
                onClick={() => {
                  bindVariable(editor, ids, field, variable.id);
                  onClose();
                }}
              >
                {variable.name}
                <span className={styles.hint}> {editor.doc.get(editor.doc.parentOf(variable.id) ?? '')?.name}</span>
                <span className={styles.hint}> {formatValue(ids[0] === undefined ? null : resolveForLayer(editor.doc, lookup, ids[0], variable.id))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/**
 * A number field for a property variables can be bound to: = opens Apply variable; while every layer has the same
 * variable bound, the field shows it, with Detach variable (the layers keep the value).
 */
export function VariableNumberField({ nodes, field, ...props }: NumberFieldProps & { nodes: readonly SceneNode[]; field: BindableField }) {
  const editor = useEditor();
  const [picking, setPicking] = useState(false);
  const ids = nodes.map((n) => n.id);
  const refs = new Set(nodes.map((n) => n.boundVariables?.[field]?.id));
  const [ref] = refs;
  const variable = refs.size === 1 && ref !== undefined ? editor.doc.get(ref) : undefined;
  return (
    <>
      <NumberField
        {...props}
        variable={isVariable(variable) ? { name: variable.name, onDetach: () => unbindVariable(editor, ids, field) } : undefined}
        onApplyVariable={() => setPicking(true)}
      />
      {picking && <VariablePicker ids={ids} field={field} onClose={() => setPicking(false)} />}
    </>
  );
}

/** A solid paint whose color comes from a color variable: its color, the variable's name and Detach variable. */
export function BoundPaint({ ids, field, index, paint, label }: { ids: readonly Id[]; field: VariablePaintField; index: number; paint: Extract<Paint, { type: 'SOLID' }>; label: string }) {
  const editor = useEditor();
  const variable = paint.boundVariables ? editor.doc.get(paint.boundVariables.color.id) : undefined;
  const name = isVariable(variable) ? variable.name : 'Missing variable';
  const { r, g, b, a } = paint.color;
  return (
    <span className={styles.boundPaint} role="group" aria-label={`${label} variable`}>
      <span className={styles.boundSwatch} style={{ background: `rgb(${r * 255} ${g * 255} ${b * 255} / ${a})` }} aria-hidden="true" />
      <span className={styles.boundName} title={isVariable(variable) ? variable.description : undefined}>
        {name}
      </span>
      <IconButton icon="detach" label={`Detach variable from ${label.toLowerCase()}`} onClick={() => unbindPaintVariable(editor, ids, field, index)} />
    </span>
  );
}

/**
 * Apply variable mode, for layers or a page: for each collection with more than one mode, Auto (the mode inherited from
 * the containers, else the default mode) or one of its modes.
 */
export function VariableModeButton({ ids }: { ids: readonly Id[] }) {
  const editor = useEditor();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const collections = localCollections(editor.doc).filter((c) => c.modes.length > 1);
  if (collections.length === 0 || ids.length === 0) return null;
  const current = (collectionId: Id) => {
    const modes = new Set(ids.map((id) => ((editor.doc.get(id) as { explicitVariableModes?: Record<string, string> } | undefined)?.explicitVariableModes ?? {})[collectionId]));
    return modes.size === 1 ? { mixed: false, modeId: [...modes][0] } : { mixed: true, modeId: undefined };
  };
  const entries: MenuEntry[] = collections.map((collection) => {
    const { mixed, modeId } = current(collection.id);
    return {
      kind: 'submenu',
      id: collection.id,
      label: collection.name,
      entries: [
        { kind: 'item', id: 'auto', label: `Auto (${collection.modes[0]!.name})`, checked: !mixed && modeId === undefined, onSelect: () => setExplicitVariableMode(editor, ids, collection.id, null) },
        { kind: 'separator', id: 'auto-separator' },
        ...collection.modes.map((mode): MenuEntry => ({ kind: 'item', id: mode.modeId, label: mode.name, checked: !mixed && modeId === mode.modeId, onSelect: () => setExplicitVariableMode(editor, ids, collection.id, mode.modeId) })),
      ],
    };
  });
  return (
    <>
      <IconButton icon="variables" label="Apply variable mode" aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())} />
      {anchor && <Menu label="Variable modes" entries={entries} anchor={anchor} placement="bottom-start" onClose={() => setAnchor(null)} />}
    </>
  );
}

/**
 * Assign variable, for a variant property of an instance: a string or number variable (or a boolean for true and false
 * properties) whose value picks the variant, in the modes the instance uses. A bound property shows its variable, with
 * Detach variable.
 */
export function VariantVariableButton({ instanceId, property }: { instanceId: Id; property: string }) {
  const editor = useEditor();
  const [picking, setPicking] = useState(false);
  const instance = editor.doc.get(instanceId);
  const alias = instance && isSceneNode(instance) ? instance.boundVariables?.[`${VARIANT_BINDING_PREFIX}${property}`] : undefined;
  const variable = alias ? editor.doc.get(alias.id) : undefined;
  const candidates = picking ? variantVariablesFor(editor, instanceId, property) : [];
  return (
    <>
      {isVariable(variable) ? (
        <span className={styles.boundPaint} role="group" aria-label={`${property} variable`}>
          <span className={styles.boundName}>{variable.name}</span>
          <IconButton icon="detach" label={`Detach variable from ${property}`} onClick={() => unbindVariantVariable(editor, instanceId, property)} />
        </span>
      ) : (
        <IconButton icon="variables" label={`Assign variable to ${property}`} onClick={() => setPicking(true)} />
      )}
      {picking && (
        <Dialog
          title="Assign variable"
          onClose={() => setPicking(false)}
          footer={
            <button type="button" className={dialogStyles.secondary} onClick={() => setPicking(false)}>
              Close
            </button>
          }
        >
          {candidates.length === 0 ? (
            <p>No string, number or boolean variables that can select a variant. Create one in the variables view.</p>
          ) : (
            <ul className={findStyles.results} aria-label="Variables">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={findStyles.result}
                    title={candidate.description}
                    onClick={() => {
                      bindVariantVariable(editor, instanceId, property, candidate.id);
                      setPicking(false);
                    }}
                  >
                    {candidate.name}
                    <span className={styles.hint}> {formatValue(resolveForLayer(editor.doc, variableLookup(editor.doc), instanceId, candidate.id))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </>
  );
}

/** The variable bound to a property on every one of the layers, when they share one. */
export function sharedBoundVariable(editor: Editor, nodes: readonly SceneNode[], field: BindableField): VariableNode | undefined {
  const refs = new Set(nodes.map((n) => n.boundVariables?.[field]?.id));
  const [ref] = refs;
  const variable = refs.size === 1 && ref !== undefined ? editor.doc.get(ref) : undefined;
  return isVariable(variable) ? variable : undefined;
}

/** A property's variable: its name (click to change it) with Detach variable while the layers share one, else Apply variable. */
export function VariableBindingControl({ nodes, field, label }: { nodes: readonly SceneNode[]; field: BindableField; label: string }) {
  const editor = useEditor();
  const [picking, setPicking] = useState(false);
  const ids = nodes.map((n) => n.id);
  const variable = sharedBoundVariable(editor, nodes, field);
  return (
    <>
      {variable ? (
        <span className={styles.boundPaint} role="group" aria-label={`${label} variable`}>
          <button type="button" className={styles.boundNameButton} title="Change variable" onClick={() => setPicking(true)}>
            {variable.name}
          </button>
          <IconButton icon="detach" label={`Detach variable from ${label.toLowerCase()}`} onClick={() => unbindVariable(editor, ids, field)} />
        </span>
      ) : (
        <IconButton icon="variables" label={`Apply variable to ${label.toLowerCase()}`} onClick={() => setPicking(true)} />
      )}
      {picking && <VariablePicker ids={ids} field={field} onClose={() => setPicking(false)} />}
    </>
  );
}

/** Shows or hides the selected layers; right-click to apply a boolean (or "true"/"false" string) variable to their visibility. */
export function VisibilityControl({ nodes }: { nodes: readonly SceneNode[] }) {
  const editor = useEditor();
  const [picking, setPicking] = useState(false);
  const ids = nodes.map((n) => n.id);
  const variable = sharedBoundVariable(editor, nodes, 'visible');
  const hidden = nodes.length > 0 && nodes.every((n) => !n.visible);
  return (
    <>
      {variable ? (
        <span className={styles.boundPaint} role="group" aria-label="Visibility variable">
          <button type="button" className={styles.boundNameButton} title="Change variable" onClick={() => setPicking(true)}>
            {variable.name}
          </button>
          <IconButton icon="detach" label="Detach variable from visibility" onClick={() => unbindVariable(editor, ids, 'visible')} />
        </span>
      ) : (
        <span
          onContextMenu={(e) => {
            e.preventDefault();
            setPicking(true);
          }}
        >
          <IconButton
            icon={hidden ? 'eyeOff' : 'eye'}
            label={hidden ? 'Show layers' : 'Hide layers'}
            onClick={() => editor.history.run(hidden ? 'Show layers' : 'Hide layers', (tx) => ids.forEach((id) => tx.set(id, 'visible', hidden)))}
          />
        </span>
      )}
      {picking && <VariablePicker ids={ids} field="visible" onClose={() => setPicking(false)} />}
    </>
  );
}

/**
 * Apply variable, for a boolean or text component property's default value: a variable the default follows (in the
 * component's variable modes). A bound default shows its variable, with Detach variable.
 */
export function PropertyDefaultVariableButton({ ownerId, name }: { ownerId: Id; name: string }) {
  const editor = useEditor();
  const [picking, setPicking] = useState(false);
  const owner = editor.doc.get(ownerId);
  const definition = owner?.type === 'FRAME' ? owner.componentPropertyDefinitions?.[name] : undefined;
  const alias = definition && (definition.type === 'BOOLEAN' || definition.type === 'TEXT') ? definition.boundVariables?.defaultValue : undefined;
  const variable = alias ? editor.doc.get(alias.id) : undefined;
  const candidates = picking ? propertyDefaultVariables(editor, ownerId, name) : [];
  return (
    <>
      {isVariable(variable) ? (
        <span className={styles.boundPaint} role="group" aria-label={`Default value of ${name} variable`}>
          <span className={styles.boundName}>{variable.name}</span>
          <IconButton icon="detach" label={`Detach variable from ${name}`} onClick={() => unbindPropertyDefaultVariable(editor, ownerId, name)} />
        </span>
      ) : (
        <IconButton icon="variables" label={`Apply variable to ${name}`} onClick={() => setPicking(true)} />
      )}
      {picking && (
        <Dialog
          title="Apply variable"
          onClose={() => setPicking(false)}
          footer={
            <button type="button" className={dialogStyles.secondary} onClick={() => setPicking(false)}>
              Close
            </button>
          }
        >
          {candidates.length === 0 ? (
            <p>No variables of a type this property takes. Create one in the variables view.</p>
          ) : (
            <ul className={findStyles.results} aria-label="Variables">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={findStyles.result}
                    title={candidate.description}
                    onClick={() => {
                      bindPropertyDefaultVariable(editor, ownerId, name, candidate.id);
                      setPicking(false);
                    }}
                  >
                    {candidate.name}
                    <span className={styles.hint}> {formatValue(resolveForLayer(editor.doc, variableLookup(editor.doc), ownerId, candidate.id))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </>
  );
}
