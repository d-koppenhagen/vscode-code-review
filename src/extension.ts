// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import { commands, workspace, window, ExtensionContext, WorkspaceFolder } from 'vscode';
import { FileGenerator } from './file-generator';
import { ReviewCommentService } from './review-comment';
import { getWorkspaceFolder } from './utils/workspace-util';
import { WebViewComponent } from './webview';
import { HtmlExporter } from './htmlExport';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  const workspaceRoot: string = getWorkspaceFolder(workspace.workspaceFolders as WorkspaceFolder[]);
  const generator = new FileGenerator(workspaceRoot, window);
  const webview = new WebViewComponent(context);
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  commands.registerCommand('codeReview.addNote', () => {
    // The code you place here will be executed every time your command is executed

    // create a new file if not already exist
    const reviewFile = generator.execute();
    const commentService = new ReviewCommentService(reviewFile, workspaceRoot);
    webview.addComment(commentService);
  });

  /**
   * allow users to export the report as HTML using the default output
   */
  commands.registerCommand('codeReview.exportAsHtmlWithDefaultTemplate', () => {
    const exporter = new HtmlExporter(workspaceRoot);
    exporter.export();
  });

  /**
   * allow users to export the report as HTML using a specific handlebars template
   */
  commands.registerCommand('codeReview.exportAsHtmlWithHandlebarsTemplate', () => {
    window
      .showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false,
        openLabel: 'Use template',
        filters: {
          Template: ['hbs', 'html', 'htm', 'handlebars'],
        },
      })
      .then((files) => {
        const template = files && files.length ? files[0] : undefined;
        const exporter = new HtmlExporter(workspaceRoot, template);
        exporter.export();
      });
  });
}

// this method is called when your extension is deactivated
export function deactivate() {}
