// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import { commands, workspace, window, ExtensionContext, WorkspaceFolder, Uri } from 'vscode';
import * as path from 'path';

import { FileGenerator } from './file-generator';
import { ReviewCommentService } from './review-comment';
import { getWorkspaceFolder } from './utils/workspace-util';
import { WebViewComponent } from './webview';
import { ExportFactory } from './export-factory';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  const workspaceRoot: string = getWorkspaceFolder(workspace.workspaceFolders as WorkspaceFolder[]);
  const generator = new FileGenerator(workspaceRoot);
  const webview = new WebViewComponent(context);

  const defaultConfigurationTemplatePath = workspace
    .getConfiguration()
    .get('code-review.defaultTemplatePath') as string;
  const defaultTemplate = defaultConfigurationTemplatePath
    ? Uri.file(defaultConfigurationTemplatePath)
    : Uri.parse(context.asAbsolutePath(path.join('dist', 'template.default.hbs')));

  const exportFactory = new ExportFactory(workspaceRoot);

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
      exportFactory.exportForFormat('html', defaultTemplate);
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
          const template = files?.length ? files[0] : undefined;
          exportFactory.exportForFormat('html', template ?? defaultTemplate);
        });
    },
  );

  /**
   * allow users to export the report as GitLab importable CSV file
   */
  const exportAsGitLabImportableCsvRegistration = commands.registerCommand(
    'codeReview.exportAsGitLabImportableCsv',
    () => {
      exportFactory.exportForFormat('gitlab');
    },
  );

  /**
   * allow users to export the report as GitHub importable CSV file
   * @see https://github.com/gavinr/github-csv-tools
   */
  const exportAsGitHubImportableCsvRegistration = commands.registerCommand(
    'codeReview.exportAsGitHubImportableCsv',
    () => {
      exportFactory.exportForFormat('github');
    },
  );

  /**
   * allow users to export the report as JIRA importable CSV file
   */
  const exportAsJiraImportableCsvRegistration = commands.registerCommand('codeReview.exportAsJiraImportableCsv', () => {
    exportFactory.exportForFormat('jira');
  });

  /**
   * allow users to export the report as JSON file
   */
  const exportAsJsonRegistration = commands.registerCommand('codeReview.exportAsJson', () => {
    exportFactory.exportForFormat('json');
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
