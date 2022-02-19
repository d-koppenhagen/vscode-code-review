import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder, Position, Range, TextEditor } from 'vscode';
import { EOL } from 'os';
import { CsvEntry } from '../model';

/**
 * remove a trailing slash from a string when exists
 * @param s the input string
 */
export const removeTrailingSlash = (s: string): string => s.replace(/\/$|\\$/, '');

/**
 * remove a leading slash from a string when exists
 * @param s the input string
 */
export const removeLeadingSlash = (s: string): string => s.replace(/^\/|^\\/, '');

/**
 * remove leading and trailing slash from a string when exists
 * @param s the input string
 */
export const removeLeadingAndTrailingSlash = (s: string): string => removeLeadingSlash(removeTrailingSlash(s));

/**
 * Check is `dir` is a proper subpath of `base`.
 * @param dir Directory to check if being a subpath of `base`.
 * @param base Base directory.
 * @returns Whether `dir` is a proper subpath of `base`.
 */
export const isProperSubpathOf = (dir: string, base: string): boolean => {
  const relative = path.relative(base, dir);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

/**
 * Get the path name of the workspace
 * workspace root, assumed to be the first item in the array
 * @param folders the workspace folder object from vscode (via: `vscode.workspace.workspaceFolders`)
 */
export const getWorkspaceFolder = (folders: WorkspaceFolder[] | undefined, activeTextEditor?: TextEditor): string => {
  if (!folders || !folders[0] || !folders[0].uri || !folders[0].uri.fsPath) {
    // Edge-Case (See Issue #108): Handle the case we are not actually in an workspace but a single file has been picked for review in VSCode
    // In this case, the review file will be stored next to this file in the same directory
    const currentFile = activeTextEditor?.document.fileName;
    return currentFile ? path.dirname(currentFile) : '';
  }
  return folders[0].uri.fsPath;
};

/**
 * takes the workspace root and a filename or relative path and returns an absolute path
 * @param workspaceRoot the the workspace path
 * @param filename the name of the file
 */
export const toAbsolutePath = (workspaceRoot: string, filename: string): string => {
  const harmonizedFileName = filename.replace(/\\/g, '/');
  return path.resolve(workspaceRoot, removeLeadingSlash(harmonizedFileName));
};

/**
 * Get the content of a file for a defined line range
 * @param pathToFile the actual file path and name
 * @param range the selection range
 */
export const getFileContentForRange = (pathToFile: string, range: Range): string => {
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(pathToFile, 'utf8');
  } catch (error) {
    console.log('Error reading file', pathToFile, error);
  }
  const fileContentLines = fileContent.split(EOL);
  return fileContentLines.slice(range.start.line, range.end.line).join(EOL);
};

/**
 * Double quotes must be escaped in CSV files using another leading double quote
 * @param input the string that should be escaped
 */
export const escapeDoubleQuotesForCsv = (input: string): string => {
  return input.replace(/"/g, '""');
};

/**
 * End-of-line must be escaped in CSV files to prevent row discontinuity
 * @param input the string that should be escaped
 */
export const escapeEndOfLineForCsv = (input: string): string => {
  return input.replace(/\n/g, '\\n');
};

/**
 * Restore escaped end-of-line for manipulation
 * @param input the string that should be unescaped
 */
export const unescapeEndOfLineFromCsv = (input: string): string => {
  return input.replace(/\\n/g, '\n');
};

/**
 * Retrieve the first start line definition from the lines string representation for CSV files
 * @param input the input string
 */
export const startLineNumberFromStringDefinition = (input: string): number => {
  const matches = input.match(/^\d+/s);
  return matches ? Number(matches[0]) : 0;
};

/**
 * Retrieve the first start line position definition from the lines string representation for CSV files
 * @param input the input string
 */
export const startPositionNumberFromStringDefinition = (input: string): number => {
  const matches = input.match(/(?<=:)\d+/s);
  return matches ? Number(matches[0]) : 0;
};

/**
 * Retrieve the first end line definition from the lines string representation for CSV files
 * @param input the input string
 */
export const endLineNumberFromStringDefinition = (input: string): number => {
  const matches = input.match(/(?<=-)\d+/s);
  return matches ? Number(matches[0]) : 0;
};

/**
 * Retrieve the first end line position definition from the lines string representation for CSV files
 * @param input the input string
 */
export const endPositionNumberFromStringDefinition = (input: string): number => {
  const matches = input.match(/(?<=:)\d+/g);
  return matches && matches[1] ? Number(matches[1]) : 0;
};

/**
 * Get the range for the lines string representation for CSV files
 * @param input the input string
 */
export const rangeFromStringDefinition = (input: string, offset: number = 0): Range => {
  // Position expects a zero-based index, but line numbers in the csv it saved as one-based index
  const startLine = startLineNumberFromStringDefinition(input) - 1;
  const startPosition = startPositionNumberFromStringDefinition(input);
  const endLine = endLineNumberFromStringDefinition(input) - 1 + offset;
  const endPosition = endPositionNumberFromStringDefinition(input);

  return new Range(
    // fall back to 0 when value is lower than 0
    new Position(startLine > 0 ? startLine : 0, startPosition > 0 ? startPosition : 0),
    new Position(endLine > 0 ? endLine : 0, endPosition > 0 ? endPosition : 0),
  );
};

/**
 * Get the ranges for the lines string representation for CSV files
 * @param input the input string (can have multiple blocks, joined by '|' character)
 */
export const rangesFromStringDefinition = (input: string, offset: number = 0): Range[] => {
  return splitStringDefinition(input).map((str) => rangeFromStringDefinition(str, offset));
};

/**
 * split strings like `0:12-15:14|2:34-19:23` by `|` character
 * @param input the raw string definition
 */
export const splitStringDefinition = (input: string): string[] => input.split('|').map((str) => str.trim());

/**
 * Sort function to order the lines string representation for CSV files
 * @param localA compare value a
 * @param localB compare value b
 */
export const sortLineSelections = (localA: string, localB: string): number =>
  startLineNumberFromStringDefinition(localA) - startLineNumberFromStringDefinition(localB);

/**
 * Sort CSV entries for their lines and
 * @param a compare CSV definition A
 * @param b compare CSV definition B
 * @see https://github.com/d-koppenhagen/vscode-code-review/issues/38
 */
export const sortCsvEntryForLines = (a: CsvEntry, b: CsvEntry): number => {
  const aSplit = splitStringDefinition(a.lines);
  const bSplit = splitStringDefinition(b.lines);

  aSplit.sort(sortLineSelections);
  bSplit.sort(sortLineSelections);

  const lineASplitStart = startLineNumberFromStringDefinition(aSplit[0]);
  const lineASplitEnd = endLineNumberFromStringDefinition(aSplit[0]);
  const lineBSplitStart = startLineNumberFromStringDefinition(bSplit[0]);
  const lineBSplitEnd = endLineNumberFromStringDefinition(bSplit[0]);

  // handle the case that the range is bigger compared to the second range.
  // e.g. 4:5-15:0 VS. 4:2-6:7
  // both ranges starting at line 4. But the first range is bigger (4-15) compared to the second one (4-6)
  if (lineASplitStart <= lineBSplitStart && lineASplitEnd >= lineBSplitEnd) {
    return -1;
  }

  return lineASplitStart - lineBSplitStart;
};

/**
 * Generate a backup file name
 *
 * @param reviewFilePath The full name of the file to backup
 * @return The name of the backup file
 */
export const getBackupFilename = (reviewFilePath: string): string => {
  const timeStamp = new Date().toISOString().replace(/[:,\.]/g, '-');
  return path.join(path.dirname(reviewFilePath), path.parse(reviewFilePath).name + '-' + timeStamp + '.bak');
};

/**
 * Refine a file name
 * @param workspaceRoot The root path of the workspace
 * @param filename The name of the file
 */
export const relativeToWorkspace = (workspaceRoot: string, filename: string): string => {
  return path.relative(workspaceRoot, filename);
};
