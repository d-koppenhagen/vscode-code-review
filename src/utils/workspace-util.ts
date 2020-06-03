// takes an array of workspace folder objects and return
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { WorkspaceFolder } from 'vscode';

// workspace root, assumed to be the first item in the array
export const getWorkspaceFolder = (folders: WorkspaceFolder[] | undefined): string => {
  if (!folders) {
    return '';
  }

  const folder = folders[0] || {};
  const uri = folder.uri;

  return uri.fsPath;
};

/**
 * takes a filename or relative path and returns an absolute path
 * @param filename the name of the file
 */
export const toAbsolutePath = (workspaceRoot: string, filename: string): string => {
  // if it's just the name of the duck,
  // assume that it will be in 'src/state/ducks/'
  return path.resolve(workspaceRoot, filename);
};

/**
 * get the content of the first line in file
 * @param pathToFile the path to the file
 */
export const getFirstLine = async (pathToFile: string) => {
  const readable = fs.createReadStream(pathToFile);
  const reader = readline.createInterface({ input: readable });
  const line = await new Promise((resolve) => {
    reader.on('line', (line) => {
      reader.close();
      resolve(line);
    });
  });
  readable.close();
  return line;
};

export const removeTrailingSlash = (s: string): string => s.replace(/\/$/, '');
export const removeLeadingSlash = (s: string): string => s.replace(/^\//, '');
export const removeLeadingAndTrailingSlash = (s: string): string => s.replace(/^\/|\/$/g, '');
