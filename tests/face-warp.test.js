import assert from 'node:assert/strict';
import test from 'node:test';
import { affineFromTriangles, triangulate, validateWarpLandmarks } from '../src/face-warp.js';

test('triangulate cria uma malha sem usar pontos artificiais', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
  const triangles = triangulate(points);
  assert.equal(triangles.length, 4);
  assert.ok(triangles.every((triangle) => triangle.every((index) => index >= 0 && index < points.length)));
});

test('affineFromTriangles reproduz escala e translação', () => {
  const matrix = affineFromTriangles(
    [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
    [{ x: 5, y: 7 }, { x: 9, y: 7 }, { x: 5, y: 11 }],
  );
  assert.deepEqual(Object.fromEntries(Object.entries(matrix).map(([key, value]) => [key, Math.round(value)])),
    { a: 2, b: 0, c: 0, d: 2, e: 5, f: 7 });
});

test('validateWarpLandmarks rejeita malha incompleta e aceita landmarks coerentes', () => {
  assert.equal(validateWarpLandmarks([], []), false);
  const points = Array.from({ length: 478 }, (_, index) => ({ x: 100 + index % 20, y: 100 + Math.floor(index / 20) }));
  points[33] = { x: 80, y: 100 }; points[263] = { x: 140, y: 100 };
  assert.equal(validateWarpLandmarks(points, points), true);
});
