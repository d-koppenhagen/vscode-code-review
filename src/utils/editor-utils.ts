import { Position, Range, Selection, TextEditor, TextEditorDecorationType, window } from 'vscode';

/**
 * Reset the selection in an editor
 *
 * @param editor The editor to work on
 */
export const clearSelection = (editor: TextEditor): void => {
  if (hasSelection(editor)) {
    editor.selections = [new Selection(new Position(0, 0), new Position(0, 0))];
  }
};

/**
 * Check if there is some selected text in an editor
 *
 * @param editor The editor to check
 * @return bool
 */
export const hasSelection = (editor: TextEditor | null): boolean => {
  const isSelectionNone =
    editor?.selections.reduce((acc: boolean, cur) => {
      return acc && cur.start.isEqual(cur.end);
    }, true) ?? true;

  return !isSelectionNone;
};

/**
 * Get the selected lines string representation in an editor
 *
 * @param editor The editor to work on
 * @return string The string represention of the selected lines
 */
export const getSelectionStringDefinition = (editor: TextEditor): string => {
  return editor.selections.reduce((acc, cur) => {
    const tmp = acc ? `${acc}|` : '';
    return `${tmp}${cur.start.line + 1}:${cur.start.character}-${cur.end.line + 1}:${cur.end.character}`;
  }, '');
};

/**
 * Get the selected lines in an editor
 *
 * @param editor The editor to work on
 * @return Range[]
 */
export const getSelectionRanges = (editor: TextEditor): Range[] => {
  return editor.selections.map((el) => {
    return new Range(new Position(el.start.line, el.start.character), new Position(el.end.line, el.end.character));
  });
};

/**
 * Highlight a selection in an editor
 *
 * @param selections The selection to highlight
 * @param editor The editor to work on
 * @return TextEditorDecorationType
 */
export const colorizeSelection = (selections: Range[], editor: TextEditor): TextEditorDecorationType => {
  const decoration = window.createTextEditorDecorationType({
    backgroundColor: 'rgba(200, 200, 50, 0.15)',
  });
  editor.setDecorations(decoration, selections);

  return decoration;
};
