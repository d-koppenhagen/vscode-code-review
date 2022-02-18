import { Position, Range, Selection, TextEditor, TextEditorDecorationType, ThemeColor, window } from 'vscode';

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
 * @return boolean
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
 * @return string The string representation of the selected lines
 */
export const getSelectionStringDefinition = (editor: TextEditor): string => {
  return editor.selections.reduce((acc, cur) => {
    const tmp = acc ? `${acc}|` : '';
    return `${tmp}${cur.start.line + 1}:${cur.start.character}-${cur.end.line + 1}:${cur.end.character}`;
  }, '');
};

export interface Location {
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
}

/**
 * Extracts the parts of a selected location (lines and columns) squashed together via `getSelectionStringDefinition`
 * back into a handy structure.
 */
export const parseLocation = (line: string): Location | undefined => {
  let match = line.match(/(\d+):(\d+)-(\d+):(\d+)/);

  if (!match) {
    return undefined;
  }

  return {
    lineStart: Number(match[1]),
    lineEnd: Number(match[2]),
    columnStart: Number(match[3]),
    columnEnd: Number(match[4]),
  };
};

/**
 * Get the selected lines in an editor
 *
 * @param editor The editor to work on
 * @return Range[]
 */
export const getSelectionRanges = (editor: TextEditor): Range[] => {
  return editor.selections.map((el) => {
    return new Range(el.start, el.end);
  });
};

/**
 * Check if a color definition is valid or not
 *
 * @param text The definition of the color, in hexadecimal or using rgba
 */
export const isValidColorDefinition = (text: string): boolean => {
  // Matches #FFFFFF and #FFFFFFFF
  const regexHex = /^#[0-9a-fA-F]{8}$|#[0-9a-fA-F]{6}$|#[0-9a-fA-F]{4}$|#[0-9a-fA-F]{3}$/gm;
  // Matches rgba(111, 222, 333, 0.5)
  const regexRgba = /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(1|(0(.\d{1,2})?))\)$/gm;

  return regexHex.test(text) || regexRgba.test(text);
};

/**
 * Determine the color value based on the priority
 * @param priority the priority value
 * @returns a matching theme color based on the priority and configured color values for the extension in `settings.json`
 */
export const themeColorForPriority = (priority: number): ThemeColor | undefined => {
  switch (priority) {
    case 3:
      return new ThemeColor('codereview.priority.red');
    case 2:
      return new ThemeColor('codereview.priority.yellow');
    case 1:
      return new ThemeColor('codereview.priority.green');
    default:
      return undefined; // private comments
  }
};

/**
 * Determine the representing ASCII symbol based on the priority
 * @param priority the priority value
 * @returns a matching string representation (text icon) for the priority
 */
export const symbolForPriority = (priority: number): string | undefined => {
  switch (priority) {
    case 3:
      return '⇡';
    case 2:
      return '⇢';
    case 1:
      return '⇣';
    default:
      return undefined; // private comments
  }
};
