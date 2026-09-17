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

import type { Id } from '../ids/ids';
import type { AnimatedProperty, PageAnimation } from '../schema/document';
import { valuesAt } from '../motion/animation';

/** The shapes an animation is handed over in. */
export type AnimationCodeFormat = 'CSS' | 'REACT' | 'JSON';

export const ANIMATION_CODE_LABELS: Readonly<Record<AnimationCodeFormat, string>> = { CSS: 'CSS', REACT: 'React', JSON: 'JSON' };

/** A number as code reads it: at most three decimals, and no trailing zeroes. */
const num = (value: number) => `${Math.round(value * 1000) / 1000}`;

/** A name CSS and JavaScript can both carry, worked out from the layer's own. */
function identifier(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' || /^[0-9]/.test(cleaned) ? `layer-${cleaned}` : cleaned;
}

/** The moments a layer is keyframed at, earliest first. */
function timesOf(animation: PageAnimation, nodeId: Id): number[] {
  const times = animation.tracks.filter((track) => track.nodeId === nodeId).flatMap((track) => track.keyframes.map((keyframe) => keyframe.time));
  return [...new Set(times)].sort((a, b) => a - b);
}

/** The properties a layer is animated on. */
function propertiesOf(animation: PageAnimation, nodeId: Id): AnimatedProperty[] {
  return [...new Set(animation.tracks.filter((track) => track.nodeId === nodeId).map((track) => track.property))];
}

/** The CSS declarations a layer's animated values come to at one moment. */
function declarations(values: Partial<Record<AnimatedProperty, number>>): string[] {
  const out: string[] = [];
  const transforms: string[] = [];
  if (values.x !== undefined || values.y !== undefined) transforms.push(`translate(${num(values.x ?? 0)}px, ${num(values.y ?? 0)}px)`);
  if (values.rotation !== undefined) transforms.push(`rotate(${num(-values.rotation)}deg)`);
  if (transforms.length > 0) out.push(`transform: ${transforms.join(' ')};`);
  if (values.width !== undefined) out.push(`width: ${num(values.width)}px;`);
  if (values.height !== undefined) out.push(`height: ${num(values.height)}px;`);
  if (values.opacity !== undefined) out.push(`opacity: ${num(values.opacity)};`);
  // A trimmed path is drawn with a dash pattern, which needs the path's own length to work out.
  if (values.trimStart !== undefined || values.trimEnd !== undefined) out.push(`/* path trim ${num(values.trimStart ?? 0)}–${num(values.trimEnd ?? 1)}: set stroke-dasharray from the path's length */`);
  return out;
}

/** How the animation repeats, as CSS says it. */
const cssIterations = (playback: PageAnimation['playback']) => (playback === 'ONCE' ? '1' : 'infinite');

function cssFor(animation: PageAnimation, nodeId: Id, name: string): string {
  const times = timesOf(animation, nodeId);
  const frames = times.map((time) => {
    const values = valuesAt(animation, time).get(nodeId) ?? {};
    const percent = num((time / animation.duration) * 100);
    return `  ${percent}% {\n${declarations(values)
      .map((line) => `    ${line}`)
      .join('\n')}\n  }`;
  });
  const direction = animation.playback === 'PING_PONG' ? ' alternate' : '';
  return [
    `@keyframes ${name} {`,
    ...frames,
    '}',
    '',
    `.${name} {`,
    `  animation: ${name} ${animation.duration}ms linear ${cssIterations(animation.playback)}${direction};`,
    '}',
  ].join('\n');
}

function reactFor(animation: PageAnimation, nodeId: Id, name: string): string {
  const times = timesOf(animation, nodeId);
  const properties = propertiesOf(animation, nodeId);
  const snapshots = times.map((time) => valuesAt(animation, time).get(nodeId) ?? {});
  const animate = properties.map((property) => `    ${property}: [${snapshots.map((values) => num(values[property] ?? 0)).join(', ')}],`);
  const stops = times.map((time) => num(time / animation.duration));
  const repeat = animation.playback === 'ONCE' ? '0' : 'Infinity';
  const repeatType = animation.playback === 'PING_PONG' ? `\n    repeatType: 'reverse',` : '';
  return [
    `// ${name}, with Framer Motion`,
    '<motion.div',
    '  animate={{',
    ...animate,
    '  }}',
    '  transition={{',
    `    duration: ${num(animation.duration / 1000)},`,
    `    times: [${stops.join(', ')}],`,
    `    repeat: ${repeat},${repeatType}`,
    `    ease: 'linear',`,
    '  }}',
    '/>',
  ].join('\n');
}

function jsonFor(animation: PageAnimation, nodeId: Id, name: string): string {
  return JSON.stringify(
    {
      name,
      duration: animation.duration,
      playback: animation.playback,
      tracks: animation.tracks
        .filter((track) => track.nodeId === nodeId)
        .map((track) => ({ property: track.property, keyframes: track.keyframes.map((keyframe) => ({ time: keyframe.time, value: keyframe.value, ...(keyframe.easing ? { easing: keyframe.easing } : {}) })) })),
    },
    null,
    2,
  );
}

/**
 * The code that rebuilds a layer's animation: its keyframes as CSS, as a Framer Motion component, or as the data
 * itself. The easing each stretch carries shapes the values the keyframes are written from, so a curve that CSS has no
 * word for still comes out as the motion it makes.
 */
export function generateAnimationCode(animation: PageAnimation | undefined, nodeId: Id, layerName: string, format: AnimationCodeFormat): string | null {
  if (!animation || timesOf(animation, nodeId).length === 0) return null;
  const name = identifier(layerName);
  switch (format) {
    case 'CSS':
      return cssFor(animation, nodeId, name);
    case 'REACT':
      return reactFor(animation, nodeId, name);
    case 'JSON':
      return jsonFor(animation, nodeId, name);
  }
}
