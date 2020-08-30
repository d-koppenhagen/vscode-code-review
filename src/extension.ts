// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import { commands, workspace, window, ExtensionContext, WorkspaceFolder, Uri, Range, Position } from 'vscode';
import * as path from 'path';

import { FileGenerator } from './file-generator';
import { ReviewCommentService } from './review-comment';
import {
  getWorkspaceFolder,
  startLineNumberFromStringDefinition,
  endLineNumberFromStringDefinition,
} from './utils/workspace-util';
import { WebViewComponent } from './webview';
import { ExportFactory } from './export-factory';
import { CommentView, CommentsProvider } from './comment-view';
import { ReviewFileExportSection, CsvEntry } from './interfaces';

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

  /**
   * register comment view
   */
  const commentProvider = new CommentsProvider(context, exportFactory);
  window.registerTreeDataProvider('codeReview.commentTree', commentProvider);
  new CommentView(commentProvider);

  /**
   * register comment panel web view
   */
  const addNoteRegistration = commands.registerCommand('codeReview.addNote', () => {
    // The code you place here will be executed every time your command is executed

    // create a new file if not already exist
    const reviewFile = generator.execute();
    const commentService = new ReviewCommentService(reviewFile, workspaceRoot);
    webview.addComment(commentService);
    commentProvider.refresh();
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
   *
   */
  const openSelectionRegistration = commands.registerCommand(
    'codeReview.openSelection',
    (fileSection: ReviewFileExportSection, csvRef?: CsvEntry) => {
      const filePath = path.join(workspaceRoot, fileSection.group);
      workspace.openTextDocument(Uri.parse(filePath)).then(
        (doc) => {
          window.showTextDocument(doc);
          if (csvRef) {
            const start = startLineNumberFromStringDefinition(csvRef.lines);
            const end = endLineNumberFromStringDefinition(csvRef.lines);
            const range: Range = new Range(new Position(start, 0), new Position(end, 0));
            window.activeTextEditor?.revealRange(range);
          }
        },
        (err) => {
          const msg = `Cannot not open file: '${filePath}': File does not exist.`;
          window.showErrorMessage(msg);
          console.log(msg, err);
        },
      );
    },
  );

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
    openSelectionRegistration,
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
