import {
  DecorationOptions,
  ExtensionContext,
  MarkdownString,
  Position,
  Range,
  Selection,
  TextEditor,
  TextEditorDecorationType,
  ThemeColor,
  window,
  workspace,
} from 'vscode';
import * as path from 'path';
import { CsvEntry } from '../model';
import { rangeFromStringDefinition } from './workspace-util';
import { EOL } from 'os';

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

const backgroundColorDefaultID = 'codereview.code.selection.background';
const backgroundColorDefault = new ThemeColor(backgroundColorDefaultID);

/**
 * Highlight a selection in an editor
 *
 * @param selections The selection to highlight
 * @param editor The editor to work on
 * @return TextEditorDecorationType
 */
export const colorizeSelection = (selections: Range[], editor: TextEditor): TextEditorDecorationType => {
  const color = workspace.getConfiguration().get('code-review.codeSelectionBackgroundColor') as string;

  let backgroundColor: string | ThemeColor;
  if (color === backgroundColorDefaultID) {
    backgroundColor = backgroundColorDefault;
  } else if (isValidColorDefinition(color)) {
    backgroundColor = color;
  } else {
    console.log(`Invalid background color definition: ${color}`);
    backgroundColor = backgroundColorDefault;
  }

  const decoration = window.createTextEditorDecorationType({
    backgroundColor: backgroundColor,
  });
  editor.setDecorations(decoration, selections);

  return decoration;
};

/**
 * Check if a color definition is valid or not
 *
 * @param text The definition of the color, in hexadecimal or using rgba
 */
export const isValidColorDefinition = (text: string): boolean => {
  // Matches #FFFFFF and #FFFFFFFF
  const regexHex = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/gm;
  // Matches rgba(111, 222, 333, 0.5)
  const regexRgba = /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(1|(0(.\d{1,2})?))\)$/gm;

  return regexHex.test(text) || regexRgba.test(text);
};

/**
 * Highlight a matching review comment
 *
 * @param context The extensions context
 * @param selections The selection to highlight
 * @param editor The editor to work on
 * @return TextEditorDecorationType
 */
export const displayGutterIcon = (
  context: ExtensionContext,
  csvEntries: CsvEntry[],
  editor: TextEditor,
): TextEditorDecorationType => {
  const decoration = window.createTextEditorDecorationType({
    gutterIconPath: context.asAbsolutePath(path.join('dist', 'speech-bubble-light.svg')),
    dark: {
      gutterIconPath: context.asAbsolutePath(path.join('dist', 'speech-bubble-dark.svg')),
    },
    isWholeLine: true,
  });

  const decorationOptions: DecorationOptions[] = [];

  // build decoration options for each comment block
  csvEntries.forEach((entry) => {
    const additionalDescription = entry.additional
      ? `${EOL}${EOL}**Additional Information:**${EOL}${EOL}${entry.additional}`
      : '';
    entry.lines.split('|').forEach((range: string) => {
      decorationOptions.push({
        range: rangeFromStringDefinition(range),
        hoverMessage: new MarkdownString(`## ${entry.title}${EOL}${EOL}${EOL}${entry.comment}${additionalDescription}`),
        renderOptions: {
          after: {
            contentText: '•',
            color: themeColorForPriority(entry.priority),
            margin: '5px',
            fontWeight: 'bold',
          },
        },
      });
    });
  });
  editor.setDecorations(decoration, decorationOptions);
  return decoration;
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
