import * as assert from 'assert';
import { compareLocation } from '../../export-factory';
import { suite, test } from 'mocha';

suite('Export Factory', () => {
  suite('compareLocation', () => {
    const cases = [
      {
        lhs: undefined,
        rhs: undefined,
        expected: 0,
      },
      {
        lhs: { lineStart: 1, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        rhs: undefined,
        expected: -1,
      },
      {
        lhs: undefined,
        rhs: { lineStart: 1, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        expected: 1,
      },
      {
        lhs: { lineStart: 1, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        rhs: { lineStart: 1, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        expected: 0,
      },
      {
        lhs: { lineStart: 1, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        rhs: { lineStart: 2, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        expected: -1,
      },
      {
        lhs: { lineStart: 2, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        rhs: { lineStart: 1, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        expected: 1,
      },
      {
        lhs: { lineStart: 1, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        rhs: { lineStart: 1, columnStart: 2, lineEnd: 1, columnEnd: 1 },
        expected: -1,
      },
      {
        lhs: { lineStart: 1, columnStart: 2, lineEnd: 1, columnEnd: 1 },
        rhs: { lineStart: 1, columnStart: 1, lineEnd: 1, columnEnd: 1 },
        expected: 1,
      },
    ];

    cases.forEach((value, idx) => {
      test(`should compare ${value.expected} (#${idx})`, () => {
        const result = compareLocation(value.lhs, value.rhs);
        assert.strictEqual(result, value.expected);
      });
    });
  });
});
