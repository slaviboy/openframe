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

import { useId, useRef, useState } from 'react';
import { hasAdjustments, IMAGE_ADJUSTMENT_LABELS, IMAGE_ADJUSTMENTS } from '@/core/image/adjustments';
import {
  IMAGE_SCALE_MODE_LABELS,
  resetImageAdjustments,
  rotateImage90,
  setImageAdjustment,
  setImageScaleMode,
  setTileScale,
  withImage,
} from '@/core/image/image-paint';
import type { BlendMode, ImagePaint, ImageScaleMode } from '@/core/schema/document';
import { useEditor } from '../../hooks/useEditor';
import { IconButton } from '../../primitives/IconButton';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import { IMAGE_ACCEPT, readImageFile } from '../../images/import-image';
import { useImageUrl } from '../../images/useImageUrl';
import gradientStyles from './Gradient.module.css';
import { PAINT_BLEND_OPTIONS } from './blend-modes';

/** Modes offered in the menu. Crop starts crop mode on the canvas, so it needs a single layer (`onCrop`). */
const MENU_MODES: readonly ImageScaleMode[] = ['FILL', 'FIT', 'TILE'];

export function ImageSwatch({ hash, label }: { hash: string | undefined; label: string }) {
  const url = useImageUrl(hash);
  return (
    <span
      className={gradientStyles.swatch}
      role="img"
      aria-label={label}
      data-loaded={url ? '' : undefined}
      style={url ? { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 8px 8px' }}
    />
  );
}

interface ImageSettingsProps {
  label: string;
  paint: ImagePaint;
  /** A discrete edit as its own undo step. */
  onEdit: (label: string, edit: (paint: ImagePaint) => ImagePaint) => void;
  /** A continuous edit: coalesced between gesture start and end, otherwise its own undo step. */
  onScrub: (edit: (paint: ImagePaint) => ImagePaint) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  /** Starts crop mode for this paint (single layer with an image only). */
  onCrop?: (() => void) | undefined;
}

/** Image fill settings: mode, tile size, rotation, the image itself, and adjustments. */
export function ImageSettings({ label, paint, onEdit, onScrub, onGestureStart, onGestureEnd, onCrop }: ImageSettingsProps) {
  const editor = useEditor();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const canCrop = onCrop !== undefined && paint.imageHash !== undefined && paint.imageSize !== undefined;
  const modes = paint.scaleMode === 'CROP' || canCrop ? [...MENU_MODES, 'CROP' as const] : MENU_MODES;

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const asset = await readImageFile(file);
      await editor.images.add(asset);
      onEdit('Set image', (p) => withImage(p, asset));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The image could not be added.');
    }
  };

  return (
    <li className={gradientStyles.stops} aria-label={`${label} image settings`}>
      <div className={gradientStyles.stopsHeader}>
        <select
          className={primitives.select}
          aria-label={`${label} image mode`}
          value={paint.scaleMode}
          onChange={(e) => {
            const mode = e.target.value as ImageScaleMode;
            if (mode === 'CROP' && canCrop) onCrop();
            else onEdit('Change image mode', (p) => setImageScaleMode(p, mode));
          }}
        >
          {modes.map((mode) => (
            <option key={mode} value={mode}>
              {IMAGE_SCALE_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
        <IconButton icon="rotation" label={`Rotate ${label.toLowerCase()} image 90°`} onClick={() => onEdit('Rotate image', rotateImage90)} />
        <select
          className={primitives.select}
          aria-label={`${label} blend mode`}
          value={paint.blendMode}
          onChange={(e) => onEdit('Change image blend mode', (p) => ({ ...p, blendMode: e.target.value as BlendMode }))}
        >
          {PAINT_BLEND_OPTIONS.map(([mode, name]) => (
            <option key={mode} value={mode}>
              {name}
            </option>
          ))}
        </select>
        {canCrop && (
          <button type="button" className={gradientStyles.textButton} onClick={onCrop}>
            Crop image
          </button>
        )}
      </div>
      {paint.scaleMode === 'TILE' && (
        <NumberField
          label="⊞"
          ariaLabel={`${label} tile size`}
          suffix="%"
          min={1}
          max={10000}
          decimals={0}
          value={Math.round((paint.scalingFactor ?? 1) * 100)}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
          onChange={(v) => onScrub((p) => setTileScale(p, v))}
        />
      )}
      <button type="button" className={gradientStyles.textButton} onClick={() => input.current?.click()}>
        {paint.imageHash ? 'Replace image…' : 'Choose image…'}
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        aria-label={`${label} image file`}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && (
        <p role="alert" className={gradientStyles.error}>
          {error}
        </p>
      )}
      <div className={gradientStyles.stopsHeader}>
        <span>Adjustments</span>
        {hasAdjustments(paint.filters) && (
          <button type="button" className={gradientStyles.textButton} onClick={() => onEdit('Reset adjustments', resetImageAdjustments)}>
            Reset adjustments
          </button>
        )}
      </div>
      {IMAGE_ADJUSTMENTS.map((key) => {
        const value = Math.round((paint.filters?.[key] ?? 0) * 100);
        return (
          <div key={key} className={gradientStyles.adjustRow}>
            <span id={`${id}-${key}`} aria-hidden="true">
              {IMAGE_ADJUSTMENT_LABELS[key]}
            </span>
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              aria-label={`${label} ${key}`}
              value={value}
              onPointerDown={onGestureStart}
              onPointerUp={onGestureEnd}
              onPointerCancel={onGestureEnd}
              onBlur={onGestureEnd}
              onDoubleClick={() => onEdit(`Reset ${key}`, (p) => setImageAdjustment(p, key, 0))}
              onChange={(e) => onScrub((p) => setImageAdjustment(p, key, Number(e.target.value)))}
            />
            <output aria-labelledby={`${id}-${key}`}>{value}</output>
          </div>
        );
      })}
    </li>
  );
}
