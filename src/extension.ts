// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import { workspace, ExtensionContext, WorkspaceFolder, window, languages, DocumentFilter } from 'vscode';
import { CommentLensProvider } from './comment-lens-provider';
import { getWorkspaceFolder } from './utils/workspace-util';
import { WorkspaceContext } from './workspace';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  let workspaceRoot: string = getWorkspaceFolder(workspace.workspaceFolders as WorkspaceFolder[]);
  const workspaceContext = new WorkspaceContext(context, workspaceRoot);
  workspaceContext.registerCommands();

  /**
   * detect when active editor changes and the workspace too
   */
  const activeTextEditorWorkspaceChangesRegistration = window.onDidChangeActiveTextEditor((editor) => {
    if (editor?.document.uri) {
      const newWorkspaceRoot = getWorkspaceFolder([
        workspace.getWorkspaceFolder(editor.document.uri),
      ] as WorkspaceFolder[]);
      // prevent refresh everything when workspace stays the same as before
      if (workspaceContext.workspaceRoot !== newWorkspaceRoot) {
        workspaceContext.workspaceRoot = newWorkspaceRoot;
        workspaceContext.refreshCommands();
      }
    }
  });

  context.subscriptions.push(activeTextEditorWorkspaceChangesRegistration);
}

// this method is called when your extension is deactivated
export function deactivate() {}
