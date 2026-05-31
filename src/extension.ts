// The module vscode contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import { workspace, ExtensionContext, WorkspaceFolder, window, commands, languages } from 'vscode';
import { getWorkspaceFolder, isProperSubpathOf } from './utils/workspace-util';
import { WorkspaceContext } from './workspace';
import { AnnotationManager } from './annotationManager';
import { AnnotationHoverProvider } from './annotationHoverProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  let workspaceRoot: string = getWorkspaceFolder(
    workspace.workspaceFolders as WorkspaceFolder[],
    window.activeTextEditor,
  );
  const workspaceContext = new WorkspaceContext(context, workspaceRoot);
  workspaceContext.registerCommands();

  /**
   * detect when active editor changes and the workspace too
   */
  const activeTextEditorWorkspaceChangesRegistration = window.onDidChangeActiveTextEditor((editor) => {
    if (editor?.document.uri) {
      const newWorkspaceRoot = getWorkspaceFolder(
        [workspace.getWorkspaceFolder(editor.document.uri)] as WorkspaceFolder[],
        window.activeTextEditor,
      );

      if (workspaceContext.workspaceRoot === newWorkspaceRoot) {
        // Prevent refresh everything when workspace stays the same as before
        return;
      }

      if (isProperSubpathOf(newWorkspaceRoot, workspaceContext.workspaceRoot)) {
        // Prevents workspace refresh when commenting on a file in a diff view which, apparently, points to a
        return;
        // (temporary?) workspace inside the current one.
      }

      workspaceContext.workspaceRoot = newWorkspaceRoot;
      workspaceContext.refreshCommands();
    }
  });

  context.subscriptions.push(activeTextEditorWorkspaceChangesRegistration);

  // --- Quick annotation mode (uses same CSV storage as Code Review) ---
  const annotationManager = new AnnotationManager(
    workspaceContext.reviewCommentService,
    workspaceContext.fileGenerator,
  );
  annotationManager.setOnUpdate(() => {
    workspaceContext.reviewCommentsProvider.refresh();
    workspaceContext.updateDecorations();
  });
  context.subscriptions.push(annotationManager);

  // Hover provider for code review comments
  const hoverProvider = new AnnotationHoverProvider(
    workspaceContext.fileGenerator.absoluteReviewFilePath,
    workspaceRoot,
  );
  context.subscriptions.push(hoverProvider);
  context.subscriptions.push(
    languages.registerHoverProvider({ scheme: 'file' }, hoverProvider),
    languages.registerHoverProvider({ scheme: 'untitled' }, hoverProvider),
  );

  context.subscriptions.push(
    commands.registerCommand('annote.toggleMode', () => {
      annotationManager.toggleMode();
    }),
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
