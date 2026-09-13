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

import { z } from 'zod';
import { canAddEffect } from '@/core/effects/effects';
import type { Transaction } from '@/core/history/history';
import {
  BlendModeSchema,
  CornerRadiiSchema,
  DashCapSchema,
  EffectSchema,
  hasGeometry,
  IndividualStrokeWeightsSchema,
  PaintSchema,
  StrokeAlignSchema,
  StrokeJoinSchema,
  type SceneNode,
} from '@/core/schema/document';
import { parseUntrustedJson } from '@/core/serialize/safe-json';
import { canonicalStringify } from '@/core/serialize/serialize';
import { selectedSceneNodes } from '../commands/selection-helpers';
import type { Editor } from '../editor';
import { ClipboardError, fromBase64, toBase64 } from './payload';

export const PROPERTIES_FORMAT = 'openframe/properties';
const HTML_MARKER = 'data-openframe-properties';

/**
 * Style properties of a layer (Copy properties). Fields a layer type doesn't have are omitted;
 * `null` records an optional field that is absent, so pasting clears it on the target.
 */
const LayerPropertiesSchema = z.object({
  opacity: z.number().min(0).max(1),
  blendMode: BlendModeSchema,
  effects: z.array(EffectSchema).max(64).nullable(),
  fills: z.array(PaintSchema).max(64).optional(),
  strokes: z.array(PaintSchema).max(64).optional(),
  strokeWeight: z.number().min(0).optional(),
  strokeAlign: StrokeAlignSchema.optional(),
  strokeDashes: z.array(z.number().min(0)).max(64).nullable().optional(),
  strokeCap: DashCapSchema.nullable().optional(),
  strokeJoin: StrokeJoinSchema.nullable().optional(),
  strokeMiterAngle: z.number().min(0).max(180).nullable().optional(),
  cornerRadius: z.number().min(0).nullable().optional(),
  cornerRadii: CornerRadiiSchema.nullable().optional(),
  individualStrokeWeights: IndividualStrokeWeightsSchema.nullable().optional(),
});
export type LayerProperties = z.infer<typeof LayerPropertiesSchema>;

/** `copiedAt` (ms since epoch) lets a paste prefer the newer of the system clipboard and this tab's copy. */
const header = { format: z.literal(PROPERTIES_FORMAT), version: z.literal(1), copiedAt: z.number().optional() };
const PropertiesPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ ...header, kind: z.literal('all'), properties: LayerPropertiesSchema }),
  z.object({ ...header, kind: z.literal('paint'), field: z.enum(['fills', 'strokes']), paint: PaintSchema }),
  z.object({ ...header, kind: z.literal('effect'), effect: EffectSchema }),
]);
/** Clipboard content for properties: all of a layer's properties, or one fill, stroke or effect row. */
export type PropertiesPayload = z.infer<typeof PropertiesPayloadSchema>;

const orNull = <T>(value: T | undefined): T | null => (value === undefined ? null : value);
const orUndefined = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

/** The properties Copy properties records for a layer. */
export function layerProperties(node: SceneNode): LayerProperties {
  const props: LayerProperties = { opacity: node.opacity, blendMode: node.blendMode, effects: orNull(node.effects) };
  if (hasGeometry(node)) {
    props.strokes = node.strokes;
    props.strokeWeight = node.strokeWeight;
    props.strokeDashes = orNull(node.strokeDashes);
    props.strokeCap = orNull(node.strokeCap);
    props.strokeJoin = orNull(node.strokeJoin);
    props.strokeMiterAngle = orNull(node.strokeMiterAngle);
    if (node.type !== 'LINE') {
      props.fills = node.fills;
      props.strokeAlign = node.strokeAlign;
    }
  }
  if (node.type === 'FRAME' || node.type === 'RECTANGLE') {
    props.cornerRadius = node.cornerRadius;
    props.cornerRadii = orNull(node.cornerRadii);
    props.individualStrokeWeights = orNull(node.individualStrokeWeights);
  } else if (node.type === 'POLYGON' || node.type === 'STAR') {
    props.cornerRadius = orNull(node.cornerRadius);
  }
  return props;
}

/** Sets a field only when the value differs (absent and `undefined` are the same). */
function assign(tx: Transaction, node: SceneNode, field: string, value: unknown): void {
  const current = (node as unknown as Record<string, unknown>)[field];
  if (canonicalStringify(current ?? null) === canonicalStringify(value ?? null)) return;
  tx.set(node.id, field as never, value as never);
}

/** Applies copied properties to a layer, skipping any the layer type doesn't support. */
export function applyProperties(tx: Transaction, node: SceneNode, props: LayerProperties): void {
  assign(tx, node, 'opacity', props.opacity);
  assign(tx, node, 'blendMode', props.blendMode);
  assign(tx, node, 'effects', orUndefined(props.effects));
  if (hasGeometry(node)) {
    if (props.strokes) assign(tx, node, 'strokes', props.strokes);
    if (props.strokeWeight !== undefined) assign(tx, node, 'strokeWeight', props.strokeWeight);
    if (props.strokeDashes !== undefined) assign(tx, node, 'strokeDashes', orUndefined(props.strokeDashes));
    if (props.strokeCap !== undefined) assign(tx, node, 'strokeCap', orUndefined(props.strokeCap));
    if (props.strokeJoin !== undefined) assign(tx, node, 'strokeJoin', orUndefined(props.strokeJoin));
    if (props.strokeMiterAngle !== undefined) assign(tx, node, 'strokeMiterAngle', orUndefined(props.strokeMiterAngle));
    if (node.type !== 'LINE') {
      if (props.fills) assign(tx, node, 'fills', props.fills);
      if (props.strokeAlign) assign(tx, node, 'strokeAlign', props.strokeAlign);
    }
  }
  if (node.type === 'FRAME' || node.type === 'RECTANGLE') {
    if (props.cornerRadius !== undefined) assign(tx, node, 'cornerRadius', props.cornerRadius ?? 0);
    if (props.cornerRadii !== undefined) assign(tx, node, 'cornerRadii', orUndefined(props.cornerRadii));
    if (props.individualStrokeWeights !== undefined) assign(tx, node, 'individualStrokeWeights', orUndefined(props.individualStrokeWeights));
  } else if ((node.type === 'POLYGON' || node.type === 'STAR') && props.cornerRadius !== undefined) {
    assign(tx, node, 'cornerRadius', props.cornerRadius && props.cornerRadius > 0 ? props.cornerRadius : undefined);
  }
}

const selectedLayers = (editor: Editor): SceneNode[] => selectedSceneNodes(editor).map((id) => editor.doc.getOrThrow(id) as SceneNode);

/** Copy properties: needs exactly one selected layer. */
export function allPropertiesPayload(editor: Editor): PropertiesPayload | null {
  const nodes = selectedLayers(editor);
  if (nodes.length !== 1) return null;
  return { format: PROPERTIES_FORMAT, version: 1, copiedAt: Date.now(), kind: 'all', properties: layerProperties(nodes[0]!) };
}

/** One fill, stroke or effect row of the (first) selected layer, as shown in the properties panel. */
export function rowPropertyPayload(editor: Editor, field: 'fills' | 'strokes' | 'effects', index: number): PropertiesPayload | null {
  const node = selectedLayers(editor)[0];
  if (!node) return null;
  if (field === 'effects') {
    const effect = node.effects?.[index];
    return effect ? { format: PROPERTIES_FORMAT, version: 1, copiedAt: Date.now(), kind: 'effect', effect } : null;
  }
  const paint = hasGeometry(node) ? node[field][index] : undefined;
  return paint ? { format: PROPERTIES_FORMAT, version: 1, copiedAt: Date.now(), kind: 'paint', field, paint } : null;
}

/**
 * Pastes properties onto every selected layer as one undo step: all properties replace the
 * supported ones; a copied fill, stroke or effect is added on top of the layer's list.
 */
export function pasteProperties(editor: Editor, payload: PropertiesPayload): boolean {
  const nodes = selectedLayers(editor);
  if (nodes.length === 0) return false;
  const label = payload.kind === 'all' ? 'Paste properties' : payload.kind === 'effect' ? 'Paste effect' : payload.field === 'fills' ? 'Paste fill' : 'Paste stroke';
  editor.history.run(label, (tx) => {
    for (const node of nodes) {
      if (payload.kind === 'all') applyProperties(tx, node, payload.properties);
      else if (payload.kind === 'effect') {
        // A pasted effect is skipped on layers that already have as many of its type as allowed.
        if (canAddEffect(node.effects ?? [], payload.effect.type)) tx.set(node.id, 'effects', [...(node.effects ?? []), payload.effect]);
      }
      else if (hasGeometry(node) && !(node.type === 'LINE' && payload.field === 'fills')) tx.set(node.id, payload.field, [...node[payload.field], payload.paint]);
    }
  });
  return true;
}

export function encodePropertiesHtml(payload: PropertiesPayload): string {
  const label = payload.kind === 'all' ? 'Layer properties' : payload.kind === 'effect' ? 'Effect' : payload.field === 'fills' ? 'Fill' : 'Stroke';
  return `<meta charset="utf-8"><div ${HTML_MARKER}="v1:${toBase64(canonicalStringify(payload))}">${label}</div>`;
}

/** Reads properties from clipboard HTML: null when absent; throws ClipboardError when damaged or invalid. */
export function decodePropertiesHtml(html: string): PropertiesPayload | null {
  const marker = new RegExp(`${HTML_MARKER}="([^"]*)"`).exec(html);
  if (!marker) return null;
  const value = /^v1:([A-Za-z0-9+/]+={0,2})$/.exec(marker[1]!);
  if (!value) throw new ClipboardError('Clipboard content is damaged');
  let raw: unknown;
  try {
    raw = parseUntrustedJson(fromBase64(value[1]!));
  } catch {
    throw new ClipboardError('Clipboard content is damaged');
  }
  const parsed = PropertiesPayloadSchema.safeParse(raw);
  if (!parsed.success) throw new ClipboardError('Clipboard content is not valid Openframe data');
  return parsed.data;
}
