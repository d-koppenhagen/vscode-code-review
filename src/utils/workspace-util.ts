// takes an array of workspace folder objects and return
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder } from 'vscode';
import { EOL } from 'os';
import { CsvEntry } from '../interfaces';

// workspace root, assumed to be the first item in the array
export const getWorkspaceFolder = (folders: WorkspaceFolder[] | undefined): string => {
  if (!folders || !folders[0] || !folders[0].uri || !folders[0].uri.fsPath) {
    return '';
  }
  return folders[0].uri.fsPath;
};

/**
 * takes a filename or relative path and returns an absolute path
 * @param filename the name of the file
 */
export const toAbsolutePath = (workspaceRoot: string, filename: string): string => {
  const harmonizedFileName = filename.replace(/\\/g, '/');
  return path.resolve(workspaceRoot, removeLeadingSlash(harmonizedFileName));
};

/**
 * Get the content of a file for a defined line range
 * @param pathToFile the actual file path and name
 * @param start the first line that's content should be included
 * @param end the last line that's content should be included
 */
export const getFileContentForRange = (pathToFile: string, start: number, end: number): string => {
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(pathToFile, 'utf8');
  } catch (error) {
    console.log('Error reading file', pathToFile, error);
  }
  const fileContentLines = fileContent.split(EOL);
  return fileContentLines.slice(start - 1, end + 1).join(EOL);
};

export const startLineNumberFromStringDefinition = (input: string): number => {
  const matches = input.match(/^\d+/s);
  return matches ? Number(matches[0]) : 0;
};

export const endLineNumberFromStringDefinition = (input: string): number => {
  const matches = input.match(/(?<=-)\d+/s);
  return matches ? Number(matches[0]) : 0;
};

export const sortLineSelections = (localA: string, localB: string): number =>
  startLineNumberFromStringDefinition(localA) - startLineNumberFromStringDefinition(localB);

export const sortCsvEntryForLines = (a: CsvEntry, b: CsvEntry): number => {
  const aSplit = a.lines.split('|');
  const bSplit = b.lines.split('|');

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

export const removeTrailingSlash = (s: string): string => s.replace(/\/$|\\$/, '');
export const removeLeadingSlash = (s: string): string => s.replace(/^\/|^\\/, '');
export const removeLeadingAndTrailingSlash = (s: string): string => removeLeadingSlash(removeTrailingSlash(s));
