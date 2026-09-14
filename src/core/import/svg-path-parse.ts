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

import type { PathCommand } from '../geometry/corners';

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/;

/**
 * An elliptical arc (SVG endpoint parameterization) as cubic curves, at most a quarter turn each, following the SVG
 * implementation notes: out-of-range radii are scaled up, a zero radius makes a straight line, and an arc to the same
 * point draws nothing.
 */
export function arcToCubics(x1: number, y1: number, rx: number, ry: number, rotation: number, largeArc: boolean, sweep: boolean, x2: number, y2: number): PathCommand[] {
  if (x1 === x2 && y1 === y2) return [];
  let rxa = Math.abs(rx);
  let rya = Math.abs(ry);
  if (rxa === 0 || rya === 0) return [{ op: 'L', x: x2, y: y2 }];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rxa * rxa) + (y1p * y1p) / (rya * rya);
  if (lambda > 1) {
    rxa *= Math.sqrt(lambda);
    rya *= Math.sqrt(lambda);
  }
  const rx2 = rxa * rxa;
  const ry2 = rya * rya;
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let coefficient = denominator === 0 ? 0 : Math.sqrt(Math.max(0, rx2 * ry2 - denominator) / denominator);
  if (largeArc === sweep) coefficient = -coefficient;
  const cxp = (coefficient * rxa * y1p) / rya;
  const cyp = (-coefficient * rya * x1p) / rxa;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)))));
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const start = angle(1, 0, (x1p - cxp) / rxa, (y1p - cyp) / rya);
  let delta = angle((x1p - cxp) / rxa, (y1p - cyp) / rya, (-x1p - cxp) / rxa, (-y1p - cyp) / rya);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (a: number) => ({ x: cx + rxa * Math.cos(a) * cos - rya * Math.sin(a) * sin, y: cy + rxa * Math.cos(a) * sin + rya * Math.sin(a) * cos });
  const tangent = (a: number) => ({ x: -rxa * Math.sin(a) * cos - rya * Math.cos(a) * sin, y: -rxa * Math.sin(a) * sin + rya * Math.cos(a) * cos });
  const commands: PathCommand[] = [];
  for (let s = 0; s < segments; s++) {
    const a1 = start + step * s;
    const a2 = a1 + step;
    const p1 = point(a1);
    const p2 = s === segments - 1 ? { x: x2, y: y2 } : point(a2);
    const t1 = tangent(a1);
    const t2 = tangent(a2);
    commands.push({ op: 'C', x1: p1.x + k * t1.x, y1: p1.y + k * t1.y, x2: p2.x - k * t2.x, y2: p2.y - k * t2.y, x: p2.x, y: p2.y });
  }
  return commands;
}

/**
 * SVG path data (a `d` attribute) as absolute path commands: moves, lines, cubic curves and closes. Horizontal and
 * vertical lines become lines; quadratic curves, smooth curves and elliptical arcs become cubic curves. As in SVG
 * renderers, parsing stops at the first malformed command and keeps what came before; data that doesn't start with a
 * move gives no commands.
 */
export function parseSvgPath(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && (d[i] === ',' || d[i] === ' ' || d[i] === '\t' || d[i] === '\n' || d[i] === '\r' || d[i] === '\f')) i++;
  };
  const number = (): number | null => {
    skip();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (!match) return null;
    i = NUMBER.lastIndex;
    return Number(match[0]);
  };
  const flag = (): boolean | null => {
    skip();
    if (d[i] !== '0' && d[i] !== '1') return null;
    return d[i++] === '1';
  };
  const hasNumber = () => {
    skip();
    NUMBER.lastIndex = i;
    return NUMBER.test(d);
  };

  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // The previous curve's second control point, reflected by smooth curves.
  let cubicControl: { x: number; y: number } | null = null;
  let quadControl: { x: number; y: number } | null = null;
  let command: string | null = null;

  for (;;) {
    skip();
    if (i >= d.length) break;
    if (COMMAND.test(d[i]!)) {
      command = d[i++]!;
    } else if (command === null || command === 'Z' || command === 'z' || !hasNumber()) {
      break;
    }
    // After a move, further coordinate pairs are lines.
    const current: string = command!;
    if (out.length === 0 && current !== 'M' && current !== 'm') return [];
    const relative: boolean = current === current.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    const upper = current.toUpperCase();
    let nextCubic: { x: number; y: number } | null = null;
    let nextQuad: { x: number; y: number } | null = null;
    if (upper === 'Z') {
      out.push({ op: 'Z' });
      x = startX;
      y = startY;
    } else if (upper === 'M' || upper === 'L') {
      const px = number();
      const py = px === null ? null : number();
      if (px === null || py === null) break;
      x = ox + px;
      y = oy + py;
      if (upper === 'M') {
        out.push({ op: 'M', x, y });
        startX = x;
        startY = y;
        command = relative ? 'l' : 'L';
      } else {
        out.push({ op: 'L', x, y });
      }
    } else if (upper === 'H' || upper === 'V') {
      const value = number();
      if (value === null) break;
      if (upper === 'H') x = (relative ? x : 0) + value;
      else y = (relative ? y : 0) + value;
      out.push({ op: 'L', x, y });
    } else if (upper === 'C' || upper === 'S') {
      const values: number[] = [];
      for (let n = upper === 'C' ? 6 : 4; n > 0; n--) {
        const value = number();
        if (value === null) break;
        values.push(value);
      }
      if (values.length !== (upper === 'C' ? 6 : 4)) break;
      const [a, b, c, e, f, g] = values as [number, number, number, number, number?, number?];
      const first = upper === 'C' ? { x: ox + a, y: oy + b } : cubicControl ? { x: 2 * x - cubicControl.x, y: 2 * y - cubicControl.y } : { x, y };
      const second = upper === 'C' ? { x: ox + c, y: oy + e } : { x: ox + a, y: oy + b };
      const end = upper === 'C' ? { x: ox + f!, y: oy + g! } : { x: ox + c, y: oy + e };
      out.push({ op: 'C', x1: first.x, y1: first.y, x2: second.x, y2: second.y, x: end.x, y: end.y });
      nextCubic = second;
      x = end.x;
      y = end.y;
    } else if (upper === 'Q' || upper === 'T') {
      const values: number[] = [];
      for (let n = upper === 'Q' ? 4 : 2; n > 0; n--) {
        const value = number();
        if (value === null) break;
        values.push(value);
      }
      if (values.length !== (upper === 'Q' ? 4 : 2)) break;
      const control: { x: number; y: number } = upper === 'Q' ? { x: ox + values[0]!, y: oy + values[1]! } : quadControl ? { x: 2 * x - quadControl.x, y: 2 * y - quadControl.y } : { x, y };
      const end = upper === 'Q' ? { x: ox + values[2]!, y: oy + values[3]! } : { x: ox + values[0]!, y: oy + values[1]! };
      out.push({ op: 'C', x1: x + (2 / 3) * (control.x - x), y1: y + (2 / 3) * (control.y - y), x2: end.x + (2 / 3) * (control.x - end.x), y2: end.y + (2 / 3) * (control.y - end.y), x: end.x, y: end.y });
      nextQuad = control;
      x = end.x;
      y = end.y;
    } else if (upper === 'A') {
      const rx = number();
      const ry = rx === null ? null : number();
      const rotation = ry === null ? null : number();
      const large = rotation === null ? null : flag();
      const sweep = large === null ? null : flag();
      const ex = sweep === null ? null : number();
      const ey = ex === null ? null : number();
      if (rx === null || ry === null || rotation === null || large === null || sweep === null || ex === null || ey === null) break;
      const end = { x: ox + ex, y: oy + ey };
      out.push(...arcToCubics(x, y, rx, ry, rotation, large, sweep, end.x, end.y));
      x = end.x;
      y = end.y;
    }
    cubicControl = nextCubic;
    quadControl = nextQuad;
  }
  return out;
}
