import * as assert from 'assert';
import { beforeEach, afterEach } from 'mocha';
import { Position, Selection, TextEditor, TextEditorDecorationType, ThemeColor } from 'vscode';
import {
  clearSelection,
  getSelectionRanges,
  getSelectionStringDefinition,
  hasSelection,
  isValidColorDefinition,
  symbolForPriority,
  themeColorForPriority,
} from '../../utils/editor-utils';

suite('Editor Utils', () => {
  let editorStub: TextEditor;
  let lastSetDecorationConf: TextEditorDecorationType | undefined;
  let lastSetDecorationSelection: Selection[] | undefined;
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

  suite('clearSelection', () => {
    test('should mutate selection and reset everything to 0', () => {
      clearSelection(editorStub);
      assert.deepStrictEqual(editorStub.selections, [new Selection(new Position(0, 0), new Position(0, 0))]);
    });
  });

  suite('hasSelection', () => {
    test('should detect an active selection', () => {
      const result = hasSelection(editorStub);
      assert.ok(result);
    });
    test('should detect no active selection when no positions are set', () => {
      editorStub.selections = [];
      const result = hasSelection(editorStub);
      assert.strictEqual(result, false);
    });
    test('should detect no active selection when selection positions (start, end) are equal', () => {
      editorStub.selections = [new Selection(new Position(2, 5), new Position(2, 5))];
      const result = hasSelection(editorStub);
      assert.strictEqual(result, false);
    });
  });

  suite('getSelectionStringDefinition', () => {
    test('should return a string representing the current selection', () => {
      assert.strictEqual(getSelectionStringDefinition(editorStub), '1:1-3:6');
    });
    test('should return an empty string representing when no selection is active', () => {
      editorStub.selections = [];
      assert.strictEqual(getSelectionStringDefinition(editorStub), '');
    });
  });

  suite('getSelectionRanges', () => {
    test('should return a range for the current selection', () => {
      const ranges = getSelectionRanges(editorStub);
      assert.strictEqual(ranges.length, 1);
      assert.strictEqual(ranges[0].start.line, 0);
      assert.strictEqual(ranges[0].start.character, 1);
      assert.strictEqual(ranges[0].end.line, 2);
      assert.strictEqual(ranges[0].end.character, 6);
    });
  });

  suite('isValidColorDefinition', () => {
    test('should determine if a color value is RGBA or HEX', () => {
      // empty and invalid
      assert.strictEqual(isValidColorDefinition(''), false);
      assert.strictEqual(isValidColorDefinition('ffffff'), false);
      assert.strictEqual(isValidColorDefinition('#11'), false);
      assert.strictEqual(isValidColorDefinition('#22222'), false);
      assert.strictEqual(isValidColorDefinition('#3333333'), false);
      assert.strictEqual(isValidColorDefinition('some-other'), false);
      assert.strictEqual(isValidColorDefinition('rgb(10,20,44)'), false);
      assert.strictEqual(isValidColorDefinition('rgba(,20,44)'), false);
      assert.strictEqual(isValidColorDefinition('rgba(23)'), false);
      assert.strictEqual(isValidColorDefinition('rgba(23,34)'), false);
      assert.strictEqual(isValidColorDefinition('rgba(23,34)'), false);
      assert.strictEqual(isValidColorDefinition('rgba(10,20,44)'), false);
      assert.strictEqual(isValidColorDefinition('rgba(100,200,300,1.1)'), false);

      // hex
      assert.strictEqual(isValidColorDefinition('#fff'), true);
      assert.strictEqual(isValidColorDefinition('#FFF'), true);
      assert.strictEqual(isValidColorDefinition('#dddd'), true);
      assert.strictEqual(isValidColorDefinition('#DDDD'), true);
      assert.strictEqual(isValidColorDefinition('#ababab'), true);
      assert.strictEqual(isValidColorDefinition('#ABABAB'), true);
      assert.strictEqual(isValidColorDefinition('#ababab33'), true);
      assert.strictEqual(isValidColorDefinition('#ABABAB33'), true);

      // rgba
      assert.strictEqual(isValidColorDefinition('rgba(100,200,300,0.8)'), true);
    });
  });

  suite('themeColorForPriority', () => {
    test('should colorize the given selection with decoration', () => {
      assert.deepStrictEqual(themeColorForPriority(3), new ThemeColor('codereview.priority.red'));
      assert.deepStrictEqual(themeColorForPriority(2), new ThemeColor('codereview.priority.yellow'));
      assert.deepStrictEqual(themeColorForPriority(1), new ThemeColor('codereview.priority.green'));
      assert.strictEqual(themeColorForPriority(0), undefined);
    });
  });

  suite('symbolForPriority', () => {
    test('should colorize the given selection with decoration', () => {
      assert.strictEqual(symbolForPriority(3), '⇡');
      assert.strictEqual(symbolForPriority(2), '⇢');
      assert.strictEqual(symbolForPriority(1), '⇣');
      assert.strictEqual(symbolForPriority(0), undefined);
    });
  });
});
