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

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { hsbToRgb, parseHex, rgbToHsb, toCss, type RGBA } from '@/core/color/color';
import { COLOR_FORMAT_FIELDS, COLOR_FORMAT_LABELS, formatColorFields, parseColorFields, type ColorFormat } from '@/core/color/format';
import styles from './ColorPicker.module.css';
import { placeFloating, type Box } from './position';

interface EyeDropperResult {
  readonly sRGBHex: string;
}
interface EyeDropperConstructor {
  new (): { open: () => Promise<EyeDropperResult> };
}

import type { BlendMode } from '@/core/schema/document';
import primitiveStyles from './primitives.module.css';

export interface ColorPickerProps {
  readonly label: string;
  /** Opaque color being edited (its alpha is ignored; `opacity` is edited separately). */
  readonly color: RGBA;
  /** 0–1. */
  readonly opacity: number;
  /** Screen box of the swatch that opened the picker. */
  readonly anchor: Box;
  readonly onColor: (color: RGBA) => void;
  readonly onOpacity: (opacity: number) => void;
  /** The picker session (open to close) is one gesture, so it undoes in one step. */
  readonly onGestureStart: () => void;
  readonly onGestureEnd: () => void;
  readonly onClose: () => void;
  /** Paint blend mode, shown as a menu at the top of the picker when all three are given. */
  readonly blendMode?: BlendMode | undefined;
  readonly blendOptions?: readonly (readonly [BlendMode, string])[] | undefined;
  readonly onBlendMode?: ((mode: BlendMode) => void) | undefined;
  /** Picks a color by clicking the canvas; used when the browser has no EyeDropper API. */
  readonly onPickFromCanvas?: (() => Promise<RGBA | null>) | undefined;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const FORMATS: readonly ColorFormat[] = ['hex', 'rgb', 'hsl', 'hsb'];

/**
 * Color picker popover: saturation/brightness area, hue and alpha sliders, Hex/RGB/HSL/HSB
 * fields, and a screen eyedropper where the browser provides one. Esc or a click outside closes it.
 */
export function ColorPicker(props: ColorPickerProps) {
  const { label, color, opacity, anchor, onColor, onOpacity, onClose } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  // While picking from the canvas, clicks outside and Escape belong to the eyedropper.
  const picking = useRef(false);
  const hsb = rgbToHsb(color);
  // Hue is undefined for grays; remember the last chosen hue so the area keeps its tint.
  const [hueMemory, setHueMemory] = useState(hsb.h);
  const hue = hsb.s === 0 || hsb.b === 0 ? hueMemory : hsb.h;
  const [format, setFormat] = useState<ColorFormat>('hex');
  const eyeDropper = typeof window !== 'undefined' ? (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper : undefined;

  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    propsRef.current.onGestureStart();
    return () => propsRef.current.onGestureEnd();
  }, []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const size = el.getBoundingClientRect();
    const pos = placeFloating(anchor, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight }, 'bottom-start');
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.visibility = 'visible';
  }, [anchor]);

  // Escape closes the picker before anything else handles it (e.g. deselecting the layer),
  // wherever focus is.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || picking.current) return;
      e.preventDefault();
      e.stopPropagation();
      propsRef.current.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent) => {
      if (picking.current || rootRef.current?.contains(e.target as Node)) return;
      const { anchor: a } = propsRef.current;
      // The swatch toggles the picker itself.
      if (e.clientX >= a.x && e.clientX <= a.x + a.width && e.clientY >= a.y && e.clientY <= a.y + a.height) return;
      propsRef.current.onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  const setHsb = (h: number, s: number, b: number) => onColor(hsbToRgb({ h, s: clamp01(s), b: clamp01(b) }, 1));

  const onAreaPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHsb(hue, (e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height);
  };

  const onAreaKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setHsb(hue, hsb.s + move[0], hsb.b + move[1]);
  };

  const commitFields = () => {
    const inputs = [...(fieldsRef.current?.querySelectorAll('input') ?? [])];
    const parsed = parseColorFields(
      inputs.map((input) => input.value),
      format,
    );    if (parsed) {
      const nextHsb = rgbToHsb(parsed);
      if (nextHsb.s > 0 && nextHsb.b > 0) setHueMemory(nextHsb.h);
      onColor(parsed);
    }
  };

  const values = formatColorFields(color, format);

  return createPortal(
    <div
      ref={rootRef}
      className={styles.picker}
      role="dialog"
      aria-label={`${label} picker`}
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      onKeyDown={(e) => {
        // Keys stay inside the picker (no tool shortcuts); Esc closes it.
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {props.blendMode && props.blendOptions && props.onBlendMode && (
        <select
          className={primitiveStyles.select}
          style={{ width: '100%', marginBottom: 8 }}
          aria-label={`${label} blend mode`}
          value={props.blendMode}
          onChange={(e) => props.onBlendMode?.(e.target.value as BlendMode)}
        >
          {props.blendOptions.map(([mode, name]) => (
            <option key={mode} value={mode}>
              {name}
            </option>
          ))}
        </select>
      )}
      <div
        className={styles.area}
        style={{ background: `hsl(${hue} 100% 50%)` }}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`Saturation ${Math.round(hsb.s * 100)}%, brightness ${Math.round(hsb.b * 100)}%`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onAreaPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) onAreaPointer(e);
        }}
        onKeyDown={onAreaKey}
      >
        <div className={styles.white} />
        <div className={styles.black} />
        <div className={styles.thumb} style={{ left: `${hsb.s * 100}%`, top: `${(1 - hsb.b) * 100}%`, background: toCss({ ...color, a: 1 }) }} />
      </div>
      <input
        className={`${styles.slider} ${styles.hue}`}
        type="range"
        min={0}
        max={360}
        step={1}
        aria-label="Hue"
        value={Math.round(hue)}
        onChange={(e) => {
          const h = Number(e.target.value);
          setHueMemory(h);
          setHsb(h, hsb.s, hsb.b);
        }}
      />
      <input
        className={`${styles.slider} ${styles.alpha}`}
        type="range"
        min={0}
        max={100}
        step={1}
        aria-label="Alpha"
        value={Math.round(opacity * 100)}
        style={{ background: `linear-gradient(to right, transparent, ${toCss({ ...color, a: 1 })})` }}
        onChange={(e) => onOpacity(Number(e.target.value) / 100)}
      />
      <div className={styles.row}>
        <select className={styles.format} aria-label="Color format" value={format} onChange={(e) => setFormat(e.target.value as ColorFormat)}>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {COLOR_FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
        <div ref={fieldsRef} className={styles.fields} key={`${format}:${values.join(',')}`}>
          {COLOR_FORMAT_FIELDS[format].map((field, i) => (
            <input
              key={field}
              className={styles.field}
              aria-label={field}
              defaultValue={values[i]}
              spellCheck={false}
              onBlur={commitFields}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitFields();
              }}
            />
          ))}
        </div>
        {(eyeDropper || props.onPickFromCanvas) && (
          <button
            type="button"
            className={styles.eyedropper}
            aria-label={eyeDropper ? 'Pick color from screen' : 'Pick color from canvas'}
            title={eyeDropper ? 'Pick color from screen' : 'Pick color from canvas'}
            onClick={() => {
              if (eyeDropper) {
                new eyeDropper()
                  .open()
                  .then((result) => {
                    const picked = parseHex(result.sRGBHex);
                    if (picked) onColor({ ...picked, a: 1 });
                  })
                  .catch(() => undefined);
                return;
              }
              const pickFromCanvas = props.onPickFromCanvas;
              if (!pickFromCanvas) return;
              picking.current = true;
              void pickFromCanvas().then((picked) => {
                picking.current = false;
                if (picked) onColor({ ...picked, a: 1 });
              });
            }}
          >
            ⌖
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
