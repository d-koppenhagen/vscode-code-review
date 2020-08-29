import * as assert from 'assert';
import * as fs from 'fs';
import { EOL } from 'os';

import { WorkspaceFolder, Uri } from 'vscode';

import {
  toAbsolutePath,
  removeTrailingSlash,
  removeLeadingSlash,
  removeLeadingAndTrailingSlash,
  getWorkspaceFolder,
  getFileContentForRange,
  startLineNumberFromStringDefinition,
  endLineNumberFromStringDefinition,
  sortLineSelections,
  sortCsvEntryForLines,
} from '../../utils/workspace-util';
import { CsvEntry } from '../../interfaces';

suite('Workspace Utils', () => {
  suite('removeTrailingSlash', () => {
    test('should remove a trailing slash from a string', () => {
      assert.equal(removeTrailingSlash('/foo/bar/'), '/foo/bar');
      assert.equal(removeTrailingSlash('/foo/bar\\'), '/foo/bar');
    });
  });

  suite('removeLeadingSlash', () => {
    test('should remove a trailing slash from a string', () => {
      assert.equal(removeLeadingSlash('/foo/bar/'), 'foo/bar/');
      assert.equal(removeLeadingSlash('\\foo/bar/'), 'foo/bar/');
    });
  });

  suite('removeLeadingAndTrailingSlash', () => {
    test('should remove a trailing slash from a string', () => {
      assert.equal(removeLeadingAndTrailingSlash('/foo/bar/'), 'foo/bar');
      assert.equal(removeLeadingAndTrailingSlash('\\foo/bar\\'), 'foo/bar');
    });
  });

  suite('getWorkspaceFolder', () => {
    test('should return an empty string when undefined', () => {
      assert.equal(getWorkspaceFolder(undefined), '');
    });

    test('should return the workspace folder string', () => {
      const workspaceFolders: WorkspaceFolder[] = [
        {
          uri: Uri.parse('/foo/bar/baz.js'),
          name: 'baz.js',
          index: 1,
        },
      ];
      const folders = workspaceFolders as WorkspaceFolder[];
      assert.equal(getWorkspaceFolder(folders), '/foo/bar/baz.js');
    });
  });

  suite('toAbsolutePath', () => {
    test('should generate a harmonized absolute path', () => {
      let input = toAbsolutePath('/foo/bar', 'baz.js');
      assert.equal(input, '/foo/bar/baz.js');

      input = toAbsolutePath('/foo/bar/', 'baz.js');
      assert.equal(input, '/foo/bar/baz.js');

      input = toAbsolutePath('/foo/bar/', '/baz.js');
      assert.equal(input, '/foo/bar/baz.js');

      input = toAbsolutePath('/foo/bar/', 'baz.js');
      assert.equal(input, '/foo/bar/baz.js');

      input = toAbsolutePath('/foo/bar/', '/a/baz.js');
      assert.equal(input, '/foo/bar/a/baz.js');

      input = toAbsolutePath('/foo/bar/', 'a/baz.js');
      assert.equal(input, '/foo/bar/a/baz.js');

      input = toAbsolutePath('/foo/bar/', 'a\\baz.js');
      assert.equal(input, '/foo/bar/a/baz.js');

      input = toAbsolutePath('/foo/bar/', '\\a\\baz.js');
      assert.equal(input, '/foo/bar/a/baz.js');

      input = toAbsolutePath('/foo/bar/', '\\a\\baz/');
      assert.equal(input, '/foo/bar/a/baz');

      input = toAbsolutePath('/foo/bar/', '\\b/a\\baz/');
      assert.equal(input, '/foo/bar/b/a/baz');
    });
  });

  suite('getFileContentForRange', () => {
    test('should return the content from the first line in a file', () => {
      const filename = 'a.js';
      fs.writeFileSync(filename, `foo${EOL}bar${EOL}baz${EOL}`);
      const result = getFileContentForRange(filename, 1, 0);
      assert.equal(result, 'foo');
      fs.unlinkSync(filename); // cleanup created file
    });

    test('should return an empty string when workspace folder cannot be determined', () => {
      const result = getFileContentForRange('some-non-existing-file', 1, 0);
      assert.equal(result, '');
    });
  });

  suite('startLineNumberFromStringDefinition', () => {
    test('should return the matching line before the colon', () => {
      assert.equal(startLineNumberFromStringDefinition('2:4'), 2);
      assert.equal(startLineNumberFromStringDefinition('103:18-12:4'), 103);
      assert.equal(startLineNumberFromStringDefinition(''), 0);
      assert.equal(startLineNumberFromStringDefinition(':3-12-4'), 0);
    });
  });

  suite('endLineNumberFromStringDefinition', () => {
    test('should return the matching line before the colon', () => {
      assert.equal(endLineNumberFromStringDefinition('103:18-12:4'), 12);
      assert.equal(endLineNumberFromStringDefinition('2:4'), 0);
      assert.equal(endLineNumberFromStringDefinition(''), 0);
      assert.equal(endLineNumberFromStringDefinition(':3-:4'), 0);
    });
  });

  suite('sortLineSelections', () => {
    test('should sort the line selection', () => {
      assert.deepEqual(['5:3-12:4', '8:2-10:5'].sort(sortLineSelections), ['5:3-12:4', '8:2-10:5']);
      assert.deepEqual(['5:3-12:4', '2:2-10:5'].sort(sortLineSelections), ['2:2-10:5', '5:3-12:4']);
    });
  });

  suite('sortCsvEntryForLines', () => {
    const dummyEntry = {
      sha: 'string',
      filename: 'string',
      url: 'string',
      title: 'string',
      comment: 'string',
      priority: 'string',
      category: 'string',
      additional: 'string',
    };
    const testData: CsvEntry[] = [
      {
        ...dummyEntry,
        lines: '5:3-8:2',
      },
      {
        ...dummyEntry,
        lines: '4:2-6:7|9:0-12:8|6:3-12:8',
      },
      {
        ...dummyEntry,
        lines: '8:6-9:3',
      },
      {
        ...dummyEntry,
        lines: '10:5-10:12|7:2-11:3',
      },
      {
        ...dummyEntry,
        lines: '3:2-14:6',
      },
      {
        ...dummyEntry,
        lines: '4:5-15:0',
      },
    ];

    test('should sort the lines association correctly', () => {
      const result = testData.sort(sortCsvEntryForLines);
      assert.equal(result[0].lines, '3:2-14:6');
      assert.equal(result[1].lines, '4:5-15:0');
      assert.equal(result[2].lines, '4:2-6:7|9:0-12:8|6:3-12:8');
      assert.equal(result[3].lines, '5:3-8:2');
      assert.equal(result[4].lines, '10:5-10:12|7:2-11:3');
      assert.equal(result[5].lines, '8:6-9:3');
    });
  });
});
