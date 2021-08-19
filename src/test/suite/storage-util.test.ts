import * as assert from 'assert';
import * as fs from 'fs';
import { afterEach } from 'mocha';
import { EOL } from 'os';
import path from 'path';
import {
  cleanCsvStorage,
  getCsvFileHeader,
  getCsvFileLinesAsArray,
  getCsvFileLinesAsIterable,
  setCsvFileContent,
  setCsvFileLines,
} from '../../utils/storage-utils';

suite('Storage Utils', () => {
  const pathToFile = path.normalize('file1.csv');

  afterEach(() => {
    if (fs.existsSync(pathToFile)) {
      fs.unlinkSync(pathToFile);
    }
  });

  suite('cleanCsvStorage', () => {
    test('should remove a trailing slash from a string', () => {
      assert.deepStrictEqual(cleanCsvStorage(['foo', 'bar']), ['foo', 'bar']);
      assert.deepStrictEqual(cleanCsvStorage(['foo', '']), ['foo']);
      assert.deepStrictEqual(cleanCsvStorage(['foo', 'bar ']), ['foo', 'bar ']);
      assert.deepStrictEqual(cleanCsvStorage(['foo', ' bar ']), ['foo', ' bar ']);
      assert.deepStrictEqual(cleanCsvStorage(['foo', '    ']), ['foo']);
    });
  });

  suite('getCsvFileLinesAsIterable', () => {
    test('should yield CSV line values', () => {
      // create csv file
      fs.writeFileSync(pathToFile, `foo${EOL}bar${EOL}baz${EOL}`);

      // setup generator function
      const generator = getCsvFileLinesAsIterable(pathToFile);

      // check yielded values
      assert.strictEqual(generator.next().value, 'foo');
      assert.strictEqual(generator.next().value, 'bar');
      assert.strictEqual(generator.next().value, 'baz');
    });
  });

  suite('getCsvFileLinesAsArray', () => {
    test('should return all CSV file lines as an array of strings', () => {
      fs.writeFileSync(pathToFile, `foo${EOL}bar${EOL}baz${EOL}`);
      assert.deepStrictEqual(getCsvFileLinesAsArray(pathToFile), ['foo', 'bar', 'baz']);
    });
    test('should an empty array when CSV file is empty too', () => {
      fs.writeFileSync(pathToFile, '');
      assert.deepStrictEqual(getCsvFileLinesAsArray(pathToFile), []);
    });
  });

  suite('getCsvFileHeader', () => {
    test('should return the CSV header line as string', () => {
      fs.writeFileSync(pathToFile, `foo,foo1,foo2${EOL}bar,bar1,bar2${EOL}baz,baz1,baz2${EOL}`);
      assert.deepStrictEqual(getCsvFileHeader(pathToFile), 'foo,foo1,foo2');
    });
    test('should return an empty string, when CSV file is empty', () => {
      fs.writeFileSync(pathToFile, '');
      assert.deepStrictEqual(getCsvFileHeader(pathToFile), '');
    });
  });

  suite('setCsvFileLines', () => {
    test('should create the file when trying to append and file does not exist', () => {
      assert.ok(setCsvFileLines(pathToFile, ['foo', 'bar', 'baz'], false));
      assert.strictEqual(fs.readFileSync(pathToFile, 'utf8'), `foo${EOL}bar${EOL}baz${EOL}`);
    });
    test('should create the file when trying override and file does not exist', () => {
      assert.ok(setCsvFileLines(pathToFile, ['foo', 'bar', 'baz'], true));
      assert.strictEqual(fs.readFileSync(pathToFile, 'utf8'), `foo${EOL}bar${EOL}baz${EOL}`);
    });
    test('should append to an existing file with some content', () => {
      fs.writeFileSync(pathToFile, `foo${EOL}bar${EOL}baz${EOL}`);
      assert.ok(setCsvFileLines(pathToFile, ['foo1', 'bar1', 'baz1'], false));
      assert.strictEqual(
        fs.readFileSync(pathToFile, 'utf8'),
        `foo${EOL}bar${EOL}baz${EOL}foo1${EOL}bar1${EOL}baz1${EOL}`,
      );
    });
    test('should override an existing file with some content', () => {
      fs.writeFileSync(pathToFile, `foo${EOL}bar${EOL}baz${EOL}`);
      assert.ok(setCsvFileLines(pathToFile, ['foo1', 'bar1', 'baz1'], true));
      assert.strictEqual(fs.readFileSync(pathToFile, 'utf8'), `foo1${EOL}bar1${EOL}baz1${EOL}`);
    });
  });

  suite('setCsvFileContent', () => {
    const content = `foo${EOL}bar${EOL}baz${EOL}`;
    test('should create the file when trying override and file does not exist', () => {
      assert.ok(setCsvFileContent(pathToFile, content));
      assert.strictEqual(fs.readFileSync(pathToFile, 'utf8'), content);
    });
    test('should override content of a file when when it exist', () => {
      fs.writeFileSync(pathToFile, 'some-existing-content');
      assert.ok(setCsvFileContent(pathToFile, content));
      assert.strictEqual(fs.readFileSync(pathToFile, 'utf8'), content);
    });
  });
});
