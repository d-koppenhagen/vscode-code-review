import path from 'path';
import {
  DecorationOptions,
  ExtensionContext,
  Position,
  Range,
  TextEditor,
  TextEditorDecorationType,
  ThemeColor,
  window,
} from 'vscode';
import { CsvEntry } from '../model';
import { isValidColorDefinition } from './editor-utils';
import { rangesFromStringDefinition } from './workspace-util';

export const EDITOR_MAX_LETTER = 1024;

/**
 * Highlight a matching review comment with decorations (underline, icon next to the line)
 *
 * @param context The extensions context
 * @param selections The selection to highlight
 * @param editor The editor to work on
 * @return all highlighting decorations
 */
export const gutterDecorations = (
  context: ExtensionContext,
  csvEntries: CsvEntry[],
  editor: TextEditor,
): TextEditorDecorationType[] => {
  return [underlineDecoration(csvEntries, editor), commentIconDecoration(context, csvEntries, editor)];
};

/**
 * Highlight a matching review comment with decorations an underline decoration
 *
 * @param context The extensions context
 * @param selections The selection to highlight
 * @param editor The editor to work on
 * @return all highlighting decorations
 */
export const underlineDecoration = (csvEntries: CsvEntry[], editor: TextEditor): TextEditorDecorationType => {
  const decoration = window.createTextEditorDecorationType({
    isWholeLine: false,
    opacity: '0.9',
    borderWidth: '1px',
    borderColor: '#0f0f0f',
    borderStyle: 'none none dashed none',
    dark: {
      borderColor: '#F6F6F6',
    },
  });

  const decorationOptions: DecorationOptions[] = [];

  // build decoration options for each comment block
  csvEntries.forEach((entry) => {
    // iterate over multi-selections
    rangesFromStringDefinition(entry.lines).forEach((range: Range) => {
      decorationOptions.push({ range });
    });
  });
  editor.setDecorations(decoration, decorationOptions);
  return decoration;
};

/**
 * Highlight a matching review comment with an icon next to the start of the selection on the right
 *
 * @param context The extensions context
 * @param selections The selection to highlight
 * @param editor The editor to work on
 * @return all highlighting decorations
 */
export const commentIconDecoration = (
  context: ExtensionContext,
  csvEntries: CsvEntry[],
  editor: TextEditor,
): TextEditorDecorationType => {
  const decoration = window.createTextEditorDecorationType({
    isWholeLine: true,
    after: {
      contentIconPath: context.asAbsolutePath(path.join('dist', 'speech-bubble-light.svg')),
      margin: '5px',
    },
    dark: {
      after: {
        contentIconPath: context.asAbsolutePath(path.join('dist', 'speech-bubble-dark.svg')),
      },
    },
  });

  const decorationOptions: DecorationOptions[] = [];

  // build decoration options for each comment block
  csvEntries.forEach((entry) => {
    // iterate over multi-selections
    rangesFromStringDefinition(entry.lines).forEach((range: Range) => {
      decorationOptions.push({
        range: new Range(
          new Position(range.start.line, EDITOR_MAX_LETTER),
          new Position(range.start.line, EDITOR_MAX_LETTER),
        ),
      });
    });
  });
  editor.setDecorations(decoration, decorationOptions);
  return decoration;
};

/**
 * Highlight a selection in an editor
 *
 * @param selections The selection to highlight
 * @param editor The editor to work on
 * @return TextEditorDecorationType
 */
export const colorizedBackgroundDecoration = (
  selections: Range[],
  editor: TextEditor,
  color: string,
): TextEditorDecorationType => {
  const backgroundColorDefaultID = 'codereview.code.selection.background';
  const backgroundColorDefault = new ThemeColor(backgroundColorDefaultID);
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
