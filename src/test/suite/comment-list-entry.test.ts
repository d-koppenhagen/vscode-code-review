import * as assert from 'assert';
import { TreeItemCollapsibleState } from 'vscode';
import { CommentListEntry } from '../../comment-list-entry';

suite('CommentListEntry', () => {
  test('should return the label as tooltip when hover label is not defined', () => {
    const entry = new CommentListEntry(
      '1',
      'entry-label',
      'some description',
      undefined,
      TreeItemCollapsibleState.Expanded,
      {
        group: '/foo/bar.ts',
        lines: [],
      },
    );
    assert.strictEqual(entry.tooltip, 'entry-label');
  });

  test('should return the label and hover label as tooltip when hover label is defined', () => {
    const entry = new CommentListEntry(
      '1',
      'entry-label',
      'some description',
      'my hover label',
      TreeItemCollapsibleState.Expanded,
      {
        group: '/foo/bar.ts',
        lines: [],
      },
    );
    assert.strictEqual(entry.tooltip, 'entry-label\n\nmy hover label');
  });

  test('should return the text as description', () => {
    const entry = new CommentListEntry(
      '1',
      'entry-label',
      'some description',
      undefined,
      TreeItemCollapsibleState.Expanded,
      {
        group: '/foo/bar.ts',
        lines: [],
      },
    );
    assert.strictEqual(entry.description, 'some description');
  });

  test('should return an empty text as description when no "text" is defined', () => {
    const entry = new CommentListEntry('1', 'entry-label', undefined, undefined, TreeItemCollapsibleState.Expanded, {
      group: '/foo/bar.ts',
      lines: [],
    });
    assert.strictEqual(entry.description, '');
  });

  test('should return replace new lines with a space in the description text', () => {
    const entry = new CommentListEntry(
      '1',
      'entry-label',
      'some\ndescription',
      undefined,
      TreeItemCollapsibleState.Expanded,
      {
        group: '/foo/bar.ts',
        lines: [],
      },
    );
    assert.strictEqual(entry.description, 'some description');
  });
});
