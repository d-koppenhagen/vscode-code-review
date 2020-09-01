import * as assert from 'assert';
import * as fs from 'fs';
import { EOL } from 'os';

import { WorkspaceFolder, Uri, Range, Position } from 'vscode';

import {
  toAbsolutePath,
  removeTrailingSlash,
  removeLeadingSlash,
  removeLeadingAndTrailingSlash,
  getWorkspaceFolder,
  getFileContentForRange,
  getCsvFileHeader,
  startLineNumberFromStringDefinition,
  startPositionNumberFromStringDefinition,
  endLineNumberFromStringDefinition,
  endPositionNumberFromStringDefinition,
  sortLineSelections,
  sortCsvEntryForLines,
  escapeDoubleQuotesForCsv,
  rangeFromStringDefinition,
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
    const range = new Range(new Position(1, 0), new Position(2, 0));

    test('should return the content from some line in a file', () => {
      const filename = 'a.js';
      fs.writeFileSync(filename, `foo${EOL}bar${EOL}baz${EOL}`);
      const result = getFileContentForRange(filename, range);
      assert.equal(result, 'bar');
      fs.unlinkSync(filename); // cleanup created file
    });

    test('should return an empty string when workspace folder cannot be determined', () => {
      const result = getFileContentForRange('some-non-existing-file', range);
      assert.equal(result, '');
    });
  });

  suite('getCsvFileHeader', () => {
    test('should return the content from the first line in a file', () => {
      const filename = 'a.js';
      fs.writeFileSync(filename, `col1,col2,col3${EOL}val1,val2,val3`);
      const result = getCsvFileHeader(filename);
      assert.equal(result, 'col1,col2,col3');
      fs.unlinkSync(filename); // cleanup created file
    });

    test('should return an empty string when workspace folder cannot be determined', () => {
      const result = getCsvFileHeader('some-non-existing-file');
      assert.equal(result, '');
    });
  });

  suite('escapeDoubleQuotesForCsv', () => {
    test('should escape a double quote sign as expected for CSV files (with another ")', () => {
      assert.equal(escapeDoubleQuotesForCsv('aa"bb'), 'aa""bb');
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

  suite('startPositionNumberFromStringDefinition', () => {
    test('should return the matching position after the colon', () => {
      assert.equal(startPositionNumberFromStringDefinition('2:4'), 4);
      assert.equal(startPositionNumberFromStringDefinition('103:18-12:4'), 18);
      assert.equal(startPositionNumberFromStringDefinition(''), 0);
      assert.equal(startPositionNumberFromStringDefinition(':3-12-4'), 3);
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

  suite('endPositionNumberFromStringDefinition', () => {
    test('should return the matching position after the colon', () => {
      assert.equal(endPositionNumberFromStringDefinition('103:18-12:4'), 4);
      assert.equal(endPositionNumberFromStringDefinition('2:4'), 0);
      assert.equal(endPositionNumberFromStringDefinition(''), 0);
      assert.equal(endPositionNumberFromStringDefinition(':3-:4'), 4);
    });
  });

  suite('rangeFromStringDefinition', () => {
    test('should return a range class based on the given string definition', () => {
      const result = rangeFromStringDefinition('103:18-12:4');
      assert.equal(result instanceof Range, true);
      assert.equal(result.start.line, 12);
      assert.equal(result.start.character, 4);
      assert.equal(result.end.line, 103);
      assert.equal(result.end.character, 18);
    });

    test('should fallback to 0', () => {
      const result = rangeFromStringDefinition('0');
      assert.equal(result instanceof Range, true);
      assert.equal(result.start.line, 0);
      assert.equal(result.start.character, 0);
      assert.equal(result.end.line, 0);
      assert.equal(result.end.character, 0);
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
      priority: 0,
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
