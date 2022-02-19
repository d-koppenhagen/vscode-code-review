import * as assert from 'assert';
import * as fs from 'fs';
import path from 'path';
import { EOL } from 'os';

import { WorkspaceFolder, Uri, Range, Position, TextEdit, TextEditor } from 'vscode';

import {
  toAbsolutePath,
  removeTrailingSlash,
  removeLeadingSlash,
  removeLeadingAndTrailingSlash,
  getWorkspaceFolder,
  getFileContentForRange,
  startLineNumberFromStringDefinition,
  startPositionNumberFromStringDefinition,
  endLineNumberFromStringDefinition,
  endPositionNumberFromStringDefinition,
  sortLineSelections,
  sortCsvEntryForLines,
  escapeDoubleQuotesForCsv,
  escapeEndOfLineForCsv,
  unescapeEndOfLineFromCsv,
  rangeFromStringDefinition,
  relativeToWorkspace,
  rangesFromStringDefinition,
  splitStringDefinition,
  getBackupFilename,
  isProperSubpathOf,
} from '../../utils/workspace-util';
import { createCommentFromObject, CsvEntry, CsvStructure } from '../../model';
import { cleanCsvStorage, getCsvFileHeader } from '../../utils/storage-utils';
import { isValidColorDefinition } from '../../utils/editor-utils';

suite('Workspace Utils', () => {
  suite('removeTrailingSlash', () => {
    test('should remove a trailing slash from a string', () => {
      assert.strictEqual(removeTrailingSlash('/foo/bar/'), '/foo/bar');
      assert.strictEqual(removeTrailingSlash('/foo/bar\\'), '/foo/bar');
    });
  });

  suite('removeLeadingSlash', () => {
    test('should remove a trailing slash from a string', () => {
      assert.strictEqual(removeLeadingSlash('/foo/bar/'), 'foo/bar/');
      assert.strictEqual(removeLeadingSlash('\\foo/bar/'), 'foo/bar/');
    });
  });

  suite('removeLeadingAndTrailingSlash', () => {
    test('should remove a trailing slash from a string', () => {
      assert.strictEqual(removeLeadingAndTrailingSlash('/foo/bar/'), 'foo/bar');
      assert.strictEqual(removeLeadingAndTrailingSlash('\\foo/bar\\'), 'foo/bar');
    });
  });

  suite('isProperSubpathOf', () => {
    test('should be true for proper subpaths', () => {
      assert.strictEqual(isProperSubpathOf('/home/user/workspace/file', '/home/user/workspace'), true);
      assert.strictEqual(isProperSubpathOf('/home/user/workspace/file', '/'), true);
    });

    test('should be false for improper subpaths', () => {
      assert.strictEqual(isProperSubpathOf('/home/user/workspace/file', '/home/user/workspace/file'), false);
    });

    test('should be false for non-subpaths', () => {
      assert.strictEqual(isProperSubpathOf('/home/user/workspace', '/home/user/workspace/file'), false);
    });
  });

  suite('getWorkspaceFolder', () => {
    test('should return an empty string when undefined', () => {
      assert.strictEqual(getWorkspaceFolder(undefined), '');
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
      assert.strictEqual(getWorkspaceFolder(folders), path.normalize('/foo/bar/baz.js'));
    });
    test('should fallback to activeTextEditor when defined', () => {
      assert.strictEqual(getWorkspaceFolder([]), '');
      assert.strictEqual(getWorkspaceFolder([], { document: {} } as TextEditor), '');
      assert.strictEqual(getWorkspaceFolder([], { document: { fileName: '' } } as TextEditor), '');
      assert.strictEqual(
        getWorkspaceFolder([], { document: { fileName: '/foo/bar/baz.txt' } } as TextEditor),
        '/foo/bar',
      );
    });
  });

  suite('toAbsolutePath', () => {
    test('should generate a harmonized absolute path', () => {
      let input = toAbsolutePath('/foo/bar', 'baz.js');
      let reRemoveDrivePrefix = /^[A-Za-z]:/g; // remove the drive letter prefix for tests in CI (e.g. "D:")
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/baz.js'));

      input = toAbsolutePath('/foo/bar/', 'baz.js');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/baz.js'));

      input = toAbsolutePath('/foo/bar/', '/baz.js');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/baz.js'));

      input = toAbsolutePath('/foo/bar/', 'baz.js');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/baz.js'));

      input = toAbsolutePath('/foo/bar/', '/a/baz.js');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/a/baz.js'));

      input = toAbsolutePath('/foo/bar/', 'a/baz.js');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/a/baz.js'));

      input = toAbsolutePath('/foo/bar/', 'a\\baz.js');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/a/baz.js'));

      input = toAbsolutePath('/foo/bar/', '\\a\\baz.js');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/a/baz.js'));

      input = toAbsolutePath('/foo/bar/', '\\a\\baz/');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/a/baz'));

      input = toAbsolutePath('/foo/bar/', '\\b/a\\baz/');
      assert.strictEqual(input.replace(reRemoveDrivePrefix, ''), path.normalize('/foo/bar/b/a/baz'));
    });
  });

  suite('getFileContentForRange', () => {
    const range = new Range(new Position(1, 1), new Position(2, 1));

    test('should return the content from some line in a file', () => {
      const filename = 'a.js';
      fs.writeFileSync(filename, `foo${EOL}bar${EOL}baz${EOL}`);
      const result = getFileContentForRange(filename, range);
      assert.strictEqual(result, 'bar');
      fs.unlinkSync(filename); // cleanup created file
    });

    test('should return an empty string when workspace folder cannot be determined', () => {
      const result = getFileContentForRange('some-non-existing-file', range);
      assert.strictEqual(result, '');
    });
  });

  suite('getCsvFileHeader', () => {
    test('should return the content from the first line in a file', () => {
      const filename = 'a.js';
      fs.writeFileSync(filename, `col1,col2,col3${EOL}val1,val2,val3`);
      const result = getCsvFileHeader(filename);
      assert.strictEqual(result, 'col1,col2,col3');
      fs.unlinkSync(filename); // cleanup created file
    });

    test('should return an empty string when workspace folder cannot be determined', () => {
      const result = getCsvFileHeader('some-non-existing-file');
      assert.strictEqual(result, '');
    });
  });

  suite('escapeDoubleQuotesForCsv', () => {
    test('should escape a double quote sign as expected for CSV files (with another ")', () => {
      assert.strictEqual(escapeDoubleQuotesForCsv('aa"bb'), 'aa""bb');
    });
  });

  suite('escapeEndOfLineForCsv', () => {
    test('should escape an end-of-line character as expected for CSV files (with a double anti-slash)', () => {
      assert.strictEqual(escapeEndOfLineForCsv('aa\nbb'), 'aa\\nbb');
    });
  });

  suite('unescapeEndOfLineFromCsv', () => {
    test('should unescape an end-of-line marker as expected for CSV files (with a true eol)', () => {
      assert.strictEqual(unescapeEndOfLineFromCsv('aa\\nbb'), 'aa\nbb');
    });
  });

  suite('startLineNumberFromStringDefinition', () => {
    test('should return the matching line before the colon', () => {
      assert.strictEqual(startLineNumberFromStringDefinition('2:4'), 2);
      assert.strictEqual(startLineNumberFromStringDefinition('103:18-12:4'), 103);
      assert.strictEqual(startLineNumberFromStringDefinition(''), 0);
      assert.strictEqual(startLineNumberFromStringDefinition(':3-12-4'), 0);
    });
  });

  suite('startPositionNumberFromStringDefinition', () => {
    test('should return the matching position after the colon', () => {
      assert.strictEqual(startPositionNumberFromStringDefinition('2:4'), 4);
      assert.strictEqual(startPositionNumberFromStringDefinition('103:18-12:4'), 18);
      assert.strictEqual(startPositionNumberFromStringDefinition(''), 0);
      assert.strictEqual(startPositionNumberFromStringDefinition(':3-12-4'), 3);
    });
  });

  suite('endLineNumberFromStringDefinition', () => {
    test('should return the matching line before the colon', () => {
      assert.strictEqual(endLineNumberFromStringDefinition('103:18-12:4'), 12);
      assert.strictEqual(endLineNumberFromStringDefinition('2:4'), 0);
      assert.strictEqual(endLineNumberFromStringDefinition(''), 0);
      assert.strictEqual(endLineNumberFromStringDefinition(':3-:4'), 0);
    });
  });

  suite('endPositionNumberFromStringDefinition', () => {
    test('should return the matching position after the colon', () => {
      assert.strictEqual(endPositionNumberFromStringDefinition('103:18-12:4'), 4);
      assert.strictEqual(endPositionNumberFromStringDefinition('2:4'), 0);
      assert.strictEqual(endPositionNumberFromStringDefinition(''), 0);
      assert.strictEqual(endPositionNumberFromStringDefinition(':3-:4'), 4);
    });
  });

  suite('rangeFromStringDefinition', () => {
    test('should return a range class based on the given string definition', () => {
      const result = rangeFromStringDefinition('103:18-12:4');
      assert.strictEqual(result instanceof Range, true);
      assert.strictEqual(result.start.line, 11);
      assert.strictEqual(result.start.character, 4);
      assert.strictEqual(result.end.line, 102);
      assert.strictEqual(result.end.character, 18);
    });

    test('should fallback to 0', () => {
      let result = rangeFromStringDefinition('0');
      assert.strictEqual(result instanceof Range, true);
      assert.strictEqual(result.start.line, 0);
      assert.strictEqual(result.start.character, 0);
      assert.strictEqual(result.end.line, 0);
      assert.strictEqual(result.end.character, 0);
      result = rangeFromStringDefinition('0:0');
      assert.strictEqual(result instanceof Range, true);
      assert.strictEqual(result.start.line, 0);
      assert.strictEqual(result.start.character, 0);
      assert.strictEqual(result.end.line, 0);
      assert.strictEqual(result.end.character, 0);
      result = rangeFromStringDefinition('0:0-0:0');
      assert.strictEqual(result instanceof Range, true);
      assert.strictEqual(result.start.line, 0);
      assert.strictEqual(result.start.character, 0);
      assert.strictEqual(result.end.line, 0);
      assert.strictEqual(result.end.character, 0);
    });
  });

  suite('rangesFromStringDefinition', () => {
    test('should return a range class based on the given string definition', () => {
      const result = rangesFromStringDefinition('103:18-12:4|10:3-17:4|19:5-200:1');
      assert.strictEqual(result.length, 3);

      assert.strictEqual(result[0] instanceof Range, true);
      assert.strictEqual(result[0].start.line, 11);
      assert.strictEqual(result[0].start.character, 4);
      assert.strictEqual(result[0].end.line, 102);
      assert.strictEqual(result[0].end.character, 18);

      assert.strictEqual(result[1] instanceof Range, true);
      assert.strictEqual(result[1].start.line, 9);
      assert.strictEqual(result[1].start.character, 3);
      assert.strictEqual(result[1].end.line, 16);
      assert.strictEqual(result[1].end.character, 4);

      assert.strictEqual(result[2] instanceof Range, true);
      assert.strictEqual(result[2].start.line, 18);
      assert.strictEqual(result[2].start.character, 5);
      assert.strictEqual(result[2].end.line, 199);
      assert.strictEqual(result[2].end.character, 1);
    });
  });

  suite('splitStringDefinition', () => {
    test('should split a string definition by the "|" character', () => {
      const result = splitStringDefinition('103:18-12:4|10:3-17:4|19:5-200:1');
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result, ['103:18-12:4', '10:3-17:4', '19:5-200:1']);
    });
  });

  suite('sortLineSelections', () => {
    test('should sort the line selection', () => {
      assert.deepStrictEqual(['5:3-12:4', '8:2-10:5'].sort(sortLineSelections), ['5:3-12:4', '8:2-10:5']);
      assert.deepStrictEqual(['5:3-12:4', '2:2-10:5'].sort(sortLineSelections), ['2:2-10:5', '5:3-12:4']);
    });
  });

  suite('sortCsvEntryForLines', () => {
    const dummyEntry = {
      revision: 'string',
      filename: 'string',
      url: 'string',
      title: 'string',
      comment: 'string',
      priority: 0,
      category: 'string',
      additional: 'string',
      id: 'string',
      private: 0,
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
      assert.strictEqual(result[0].lines, '3:2-14:6');
      assert.strictEqual(result[1].lines, '4:5-15:0');
      assert.strictEqual(result[2].lines, '4:2-6:7|9:0-12:8|6:3-12:8');
      assert.strictEqual(result[3].lines, '5:3-8:2');
      assert.strictEqual(result[4].lines, '10:5-10:12|7:2-11:3');
      assert.strictEqual(result[5].lines, '8:6-9:3');
    });
  });

  suite('cleanCsvStorage', () => {
    test('should return zero rows', () => {
      assert.strictEqual(cleanCsvStorage([]).length, 0);
    });

    test('should return zero rows', () => {
      assert.strictEqual(cleanCsvStorage(['', '  ']).length, 0);
    });

    test('should return non-empty rows', () => {
      assert.strictEqual(cleanCsvStorage(['', '  ', 'row_1', 'row_2', '']).length, 2);
    });
  });

  suite('createCommentFromObject', () => {
    test('should return object with comment and id', () => {
      const object = createCommentFromObject({ comment: 'some text' });
      assert.strictEqual(object.comment, 'some text');
      assert.notStrictEqual(object.id, '');
    });
  });

  suite('formatAsCsvLine', () => {
    test('should work even with an empty object', () => {
      const object = createCommentFromObject({});
      const line = CsvStructure.formatAsCsvLine(object);
      assert.ok(line.length > 0);
    });
  });

  suite('relativeToWorkspace', () => {
    test('should return filename', () => {
      const workspaceRoot = '/path/to/my/workspace';
      const filename = 'file';
      const refined = relativeToWorkspace(workspaceRoot, path.join(workspaceRoot, filename));
      assert.strictEqual(refined, filename);
    });

    test('should return filename with relative folder', () => {
      const workspaceRoot = '/path/to/my/workspace';
      const filename = 'and/my/file';
      const refined = relativeToWorkspace(workspaceRoot, path.join(workspaceRoot, filename));
      assert.strictEqual(refined, filename);
    });
  });

  suite('isValidComment', () => {
    test('should detect empty object', () => {
      assert.ok(!CsvStructure.isValidComment({} as CsvEntry));
    });

    test('should detect null comment', () => {
      assert.ok(!CsvStructure.isValidComment(({ comment: null } as unknown) as CsvEntry));
    });

    test('should detect empty comment', () => {
      assert.ok(!CsvStructure.isValidComment(({ comment: '' } as unknown) as CsvEntry));
    });

    test('should detect null filename', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: null,
        } as unknown) as CsvEntry),
      );
    });

    test('should detect empty filename', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '',
        } as unknown) as CsvEntry),
      );
    });

    test('should detect empty filename', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
        } as unknown) as CsvEntry),
      );
    });

    test('should detect null id', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: null,
        } as unknown) as CsvEntry),
      );
    });

    test('should detect empty id', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: '',
        } as unknown) as CsvEntry),
      );
    });

    test('should detect invalid id', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: '123456',
        } as unknown) as CsvEntry),
      );
    });

    test('should detect null lines', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: '10c2d1ec-b98d-4b88-b7fc-ed141c66070c',
          lines: null,
        } as unknown) as CsvEntry),
      );
    });

    test('should detect empty lines', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: '10c2d1ec-b98d-4b88-b7fc-ed141c66070c',
          lines: '',
        } as unknown) as CsvEntry),
      );
    });

    test('should detect invalid lines', () => {
      assert.ok(
        !CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: '10c2d1ec-b98d-4b88-b7fc-ed141c66070c',
          lines: '0:0',
        } as unknown) as CsvEntry),
      );
    });

    test('should accept single selection', () => {
      assert.ok(
        CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: '10c2d1ec-b98d-4b88-b7fc-ed141c66070c',
          lines: '0:0-0:0',
        } as unknown) as CsvEntry),
      );
    });

    test('should accept multiple selection (1)', () => {
      assert.ok(
        CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: '10c2d1ec-b98d-4b88-b7fc-ed141c66070c',
          lines: '0:0-0:0|0:0-0:0',
        } as unknown) as CsvEntry),
      );
    });

    test('should accept multiple selection (2)', () => {
      assert.ok(
        CsvStructure.isValidComment(({
          comment: 'lorem ipsum',
          filename: '/my/file.txt',
          id: '10c2d1ec-b98d-4b88-b7fc-ed141c66070c',
          lines: '0:0-0:0|0:0-0:0|0:0-0:0',
        } as unknown) as CsvEntry),
      );
    });
  });

  suite('isValidColorDefinition', () => {
    test('should match color definition', () => {
      assert.ok(isValidColorDefinition('#C8C832'));
      assert.ok(isValidColorDefinition('#C8C83226'));

      assert.ok(isValidColorDefinition('rgba(200, 200, 50, 0)'));
      assert.ok(isValidColorDefinition('rgba(200, 200, 50, 1)'));
      assert.ok(isValidColorDefinition('rgba(200, 200, 50, 0.15)'));
    });

    test('should not match color definition', () => {
      assert.ok(!isValidColorDefinition(''));
      assert.ok(!isValidColorDefinition('C8C832'));
      assert.ok(!isValidColorDefinition('C8C83226'));
      assert.ok(!isValidColorDefinition('#ABCDE'));
      assert.ok(!isValidColorDefinition('#ABCDEF1'));

      assert.ok(!isValidColorDefinition('rgba(200, 200, 50)'));
    });
  });

  suite('getBackupFilename', () => {
    test('should return the actual filename with a current timestamp', () => {
      const date = new Date();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toLocaleString('en', { minimumIntegerDigits: 2 });

      assert.ok(getBackupFilename('test-csv').startsWith('test-csv-'));
      assert.ok(getBackupFilename('test-csv').includes(`${year.toString()}-`));
      assert.ok(getBackupFilename('test-csv').includes(`${month.toString()}-`));
      assert.ok(getBackupFilename('test-csv').endsWith('Z.bak'));
    });
  });
});
