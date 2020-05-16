// takes an array of workspace folder objects and return
import * as path from 'path';
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
