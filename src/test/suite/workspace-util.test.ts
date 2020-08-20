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
} from '../../utils/workspace-util';

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
    });

    test('should return an empty string when workspace folder cannot be determined', () => {
      const result = getFileContentForRange('some-non-existing-file', 1, 0);
      assert.equal(result, '');
    });
  });
});
