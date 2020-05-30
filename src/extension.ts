// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import { commands, workspace, window, ExtensionContext, WorkspaceFolder } from 'vscode';
import { FileGenerator } from './file-generator';
import { ReviewCommentService } from './review-comment';
import { getWorkspaceFolder } from './utils/workspace-util';
import { WebViewComponent } from './webview';
import { ExportFactory } from './ExportFactory';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  const workspaceRoot: string = getWorkspaceFolder(workspace.workspaceFolders as WorkspaceFolder[]);
  const generator = new FileGenerator(workspaceRoot, window);
  const webview = new WebViewComponent(context);
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const addNoteRegistration = commands.registerCommand('codeReview.addNote', () => {
    // The code you place here will be executed every time your command is executed

    // create a new file if not already exist
    const reviewFile = generator.execute();
    const commentService = new ReviewCommentService(reviewFile, workspaceRoot);
    webview.addComment(commentService);
  });

  /**
   * allow users to export the report as HTML using the default output
   */
  const exportAsHtmlWithDefaultTemplateRegistration = commands.registerCommand(
    'codeReview.exportAsHtmlWithDefaultTemplate',
    () => {
      const exportFactory = new ExportFactory(workspaceRoot);
      exportFactory.exportAsHtml();
    },
  );

  /**
   * allow users to export the report as HTML using a specific handlebars template
   */
  const exportAsHtmlWithHandlebarsTemplateRegistration = commands.registerCommand(
    'codeReview.exportAsHtmlWithHandlebarsTemplate',
    () => {
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
          const exportFactory = new ExportFactory(workspaceRoot, template);
          exportFactory.exportAsHtml();
        });
    },
  );

  /**
   * allow users to export the report as GitLab importable CSV file
   */
  const exportAsGitLabImportableCsvRegistration = commands.registerCommand(
    'codeReview.exportAsGitLabImportableCsv',
    () => {
      const exportFactory = new ExportFactory(workspaceRoot);
      exportFactory.exportAsGitLabCsv();
    },
  );

  /**
   * allow users to export the report as GitHub importable CSV file
   * @see https://github.com/gavinr/github-csv-tools
   */
  const exportAsGitHubImportableCsvRegistration = commands.registerCommand(
    'codeReview.exportAsGitHubImportableCsv',
    () => {
      const exportFactory = new ExportFactory(workspaceRoot);
      exportFactory.exportAsGitHubCsv();
    },
  );

  /**
   * allow users to export the report as JIRA importable CSV file
   */
  const exportAsJiraImportableCsvRegistration = commands.registerCommand('codeReview.exportAsJiraImportableCsv', () => {
    const exportFactory = new ExportFactory(workspaceRoot);
    exportFactory.exportAsJiraCsv();
  });

  /**
   * allow users to export the report as JSON file
   */
  const exportAsJsonRegistration = commands.registerCommand('codeReview.exportAsJson', () => {
    const exportFactory = new ExportFactory(workspaceRoot);
    exportFactory.exportAsJson();
  });

  /**
   * push all registration into subscriptions
   */
  context.subscriptions.push(
    addNoteRegistration,
    exportAsHtmlWithDefaultTemplateRegistration,
    exportAsHtmlWithHandlebarsTemplateRegistration,
    exportAsGitLabImportableCsvRegistration,
    exportAsGitHubImportableCsvRegistration,
    exportAsJiraImportableCsvRegistration,
    exportAsJsonRegistration,
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
