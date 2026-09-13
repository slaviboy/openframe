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

/** Hash of a cell coordinate to 0–1 (Dave Hoskins' hash12), stable across GPUs and the CPU backend. */
const HASH = `
float hash(float2 p) {
  p = fract(p * float2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}`;

/**
 * Noise effect shader, in layer coordinates. Uniforms: cellSize, density, mode (0 mono, 1 duo,
 * 2 multi), color1 (rgba), color2 (rgba), opacity. Returns premultiplied color.
 */
export const NOISE_SKSL = `
uniform float cellSize;
uniform float density;
uniform float mode;
uniform half4 color1;
uniform half4 color2;
uniform float opacity;
${HASH}
half4 main(float2 xy) {
  float2 cell = floor(xy / cellSize);
  if (hash(cell) >= density) return half4(0);
  if (mode < 0.5) return half4(color1.rgb * color1.a, color1.a);
  if (mode < 1.5) {
    half4 c = hash(cell + 19.19) < 0.5 ? color1 : color2;
    return half4(c.rgb * c.a, c.a);
  }
  half3 rgb = half3(hash(cell + 3.1), hash(cell + 7.7), hash(cell + 11.3));
  return half4(rgb * opacity, opacity);
}
`;

/** Texture displacement field: smooth value noise in red and green (0–1), grain `cellSize` design pixels. */
export const TEXTURE_SKSL = `
uniform float cellSize;
${HASH}
float valueNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
half4 main(float2 xy) {
  float2 p = xy / cellSize;
  return half4(valueNoise(p), valueNoise(p + 41.7), 0.0, 1.0);
}
`;
