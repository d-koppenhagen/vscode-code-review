// takes an array of workspace folder objects and return
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder } from 'vscode';
import { EOL } from 'os';

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

export const removeTrailingSlash = (s: string): string => s.replace(/\/$|\\$/, '');
export const removeLeadingSlash = (s: string): string => s.replace(/^\/|^\\/, '');
export const removeLeadingAndTrailingSlash = (s: string): string => removeLeadingSlash(removeTrailingSlash(s));
