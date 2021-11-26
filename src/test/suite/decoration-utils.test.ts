import * as assert from 'assert';
import { beforeEach, afterEach } from 'mocha';
import {
  DecorationOptions,
  ExtensionContext,
  Position,
  Range,
  Selection,
  TextEditor,
  TextEditorDecorationType,
} from 'vscode';
import { CsvEntry } from '../../model';
import { colorizedBackgroundDecoration, Decorations } from '../../utils/decoration-utils';

suite('Decoration Utils', () => {
  let editorStub: TextEditor;
  let lastSetDecorationConf: TextEditorDecorationType | undefined;
  let lastSetDecorationSelection!: Selection[] | DecorationOptions[] | undefined;
  beforeEach(() => {
    editorStub = ({
      selections: [new Selection(new Position(0, 1), new Position(2, 6))],
      setDecorations: (conf: TextEditorDecorationType, selection: Selection[]) => {
        lastSetDecorationConf = conf;
        lastSetDecorationSelection = selection;
      },
    } as unknown) as TextEditor;
  });

  afterEach(() => {
    lastSetDecorationConf = undefined;
    lastSetDecorationSelection = undefined;
  });

  suite('underlineDecoration', () => {
    test('should underline comments', () => {
      const contextStub = {
        asAbsolutePath: (p) => p,
      } as ExtensionContext;
      const deco = new Decorations(contextStub);

      const csvEntries = [{ lines: '1:0-3:4|9:0-11:3' } as CsvEntry, { lines: '17:3-19:2' } as CsvEntry];
      const decoration = deco.underlineDecoration(csvEntries, editorStub);
      const decorationOptions = lastSetDecorationSelection as DecorationOptions[];

      assert.ok(deco);
      assert.deepStrictEqual(lastSetDecorationConf, deco.decorationDeclarationType);

      assert.strictEqual(decorationOptions[0].range.start.line, 0);
      assert.strictEqual(decorationOptions[0].range.start.character, 0);
      assert.strictEqual(decorationOptions[0].range.end.line, 2);
      assert.strictEqual(decorationOptions[0].range.end.character, 4);

      assert.strictEqual(decorationOptions[1].range.start.line, 8);
      assert.strictEqual(decorationOptions[1].range.start.character, 0);
      assert.strictEqual(decorationOptions[1].range.end.line, 10);
      assert.strictEqual(decorationOptions[1].range.end.character, 3);

      assert.strictEqual(decorationOptions[2].range.start.line, 16);
      assert.strictEqual(decorationOptions[2].range.start.character, 3);
      assert.strictEqual(decorationOptions[2].range.end.line, 18);
      assert.strictEqual(decorationOptions[2].range.end.character, 2);
    });
  });

  suite('commentIconDecoration', () => {
    test('should underline comments', () => {
      const contextStub = {
        asAbsolutePath: (p) => p,
      } as ExtensionContext;
      const deco = new Decorations(contextStub);

      const csvEntries = [{ lines: '1:0-3:4|9:0-11:3' } as CsvEntry, { lines: '17:3-19:2' } as CsvEntry];
      const decoration = deco.commentIconDecoration(csvEntries, editorStub);
      const decorationOptions = lastSetDecorationSelection as DecorationOptions[];

      assert.ok(deco);
      assert.deepStrictEqual(lastSetDecorationConf, deco.commentDecorationType);

      assert.strictEqual(decorationOptions[0].range.start.line, 0);
      assert.strictEqual(decorationOptions[0].range.start.character, 1024);
      assert.strictEqual(decorationOptions[0].range.end.line, 0);
      assert.strictEqual(decorationOptions[0].range.end.character, 1024);

      assert.strictEqual(decorationOptions[1].range.start.line, 8);
      assert.strictEqual(decorationOptions[1].range.start.character, 1024);
      assert.strictEqual(decorationOptions[1].range.end.line, 8);
      assert.strictEqual(decorationOptions[1].range.end.character, 1024);

      assert.strictEqual(decorationOptions[2].range.start.line, 16);
      assert.strictEqual(decorationOptions[2].range.start.character, 1024);
      assert.strictEqual(decorationOptions[2].range.end.line, 16);
      assert.strictEqual(decorationOptions[2].range.end.character, 1024);
    });
  });

  suite('colorizedBackgroundDecoration', () => {
    test('should colorize the given selection with decoration', () => {
      const selections = [new Range(new Position(2, 5), new Position(2, 5))];
      const decoration = colorizedBackgroundDecoration(selections, editorStub, '#fdfdfd');
      assert.ok(decoration);
      assert.deepStrictEqual(lastSetDecorationConf, decoration);
      assert.deepStrictEqual(lastSetDecorationSelection, selections);
    });
  });
});
