import { window, ViewColumn, ExtensionContext, workspace, Range, WebviewPanel, Uri, TextEditor } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ReviewCommentService } from './review-comment';
import { CsvEntry } from './interfaces';
import { CommentListEntry } from './comment-list-entry';
import { unescapeEndOfLineFromCsv } from './utils/workspace-util';
import { clearSelection, colorizeSelection, getSelectionRanges } from './utils/editor-utils';

export class WebViewComponent {
  private categories: string[] = [];
  public panel: WebviewPanel | null = null;
  /** Reference to the working editor during note edition */
  private editor: TextEditor | null = null;

  constructor(public context: ExtensionContext) {
    this.categories = workspace.getConfiguration().get('code-review.categories') as string[];
  }

  /**
   * Get and store the working text editor
   *
   * @return TextEditor
   */
  private getWorkingEditor(): TextEditor {
    if (this.editor === null) {
      this.editor = window.activeTextEditor ?? window.visibleTextEditors[0];
    }

    return this.editor;
  }

  /**
   * Dispose the stored working editor
   */
  private disposeWorkingEditor() {
    this.editor = null;
  }

  deleteComment(commentService: ReviewCommentService, entry: CommentListEntry) {
    commentService.deleteComment(entry);
    this.panel?.dispose();
  }

  editComment(commentService: ReviewCommentService, selections: Range[], data: CsvEntry) {
    const editor = this.getWorkingEditor();
    // Clear the current text selection to avoid unwanted code selection changes.
    // (see `ReviewCommentService::getSelectedLines()`).
    clearSelection(editor);
    // highlight selection
    const decoration = colorizeSelection(selections, editor);

    // initialize new web tab
    this.panel = this.createWebView('Edit code review comment');
    this.panel.webview.html = this.getWebviewContent(editor.document.fileName);
    // const pathToHtml = Uri.file(path.join(this.context.extensionPath, 'src', 'webview.html'));
    // const pathUri = pathToHtml.with({ scheme: 'vscode-resource' });
    // panel.webview.html = fs.readFileSync(pathUri.fsPath, 'utf8');
    const priorities = workspace.getConfiguration().get('code-review.priorities') as string[];

    data.comment = unescapeEndOfLineFromCsv(data.comment);

    const formData = { ...data };
    this.panel.webview.postMessage({ comment: formData });

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'submit':
            const formData = JSON.parse(message.text) as CsvEntry;
            const newEntry: CsvEntry = {
              ...data,
              title: formData.title || '',
              additional: formData.additional || '',
              comment: formData.comment || '',
              category: formData.category || '',
              priority: formData.priority || 0,
            };
            commentService.updateComment(newEntry, this.getWorkingEditor());
            this.panel?.dispose();
            return;
          case 'cancel':
            this.panel?.dispose();
            return;
        }
      },
      undefined,
      this.context.subscriptions,
    );

    this.panel.onDidDispose(() => {
      // reset highlight selected lines
      decoration.dispose();
      this.disposeWorkingEditor();
    });
  }

  addComment(commentService: ReviewCommentService) {
    // highlight selected lines
    const editor = this.getWorkingEditor();
    const decoration = colorizeSelection(getSelectionRanges(editor), editor);

    this.panel = this.createWebView('Add code review comment');
    this.panel.webview.html = this.getWebviewContent(editor.document.fileName);
    // const pathToHtml = Uri.file(path.join(this.context.extensionPath, 'src', 'webview.html'));
    // const pathUri = pathToHtml.with({ scheme: 'vscode-resource' });
    // panel.webview.html = fs.readFileSync(pathUri.fsPath, 'utf8');

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'submit':
            const comment = JSON.parse(message.text) as CsvEntry;
            comment.priority = Number(comment.priority);
            commentService.addComment(comment, this.getWorkingEditor());
            break;

          case 'cancel':
            break;
        }

        this.panel?.dispose();
      },
      undefined,
      this.context.subscriptions,
    );

    this.panel.onDidDispose(() => {
      // reset highlight selected lines
      decoration.dispose();
      this.disposeWorkingEditor();
    });
  }

  private createWebView(title: string): WebviewPanel {
    return window.createWebviewPanel(
      'text',
      title,
      { viewColumn: ViewColumn.Beside },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
  }

  getWebviewContent(fileName: string): string {
    let selectListString = this.categories.reduce((current, category) => {
      return (current += `<option value="${category}">${category}</option>`);
    }, '');
    const uri = Uri.parse(this.context.asAbsolutePath(path.join('dist', 'webview.html')));
    const pathUri = uri.with({ scheme: 'vscode-resource' });
    // const linesString = selections.reduce((prev, curr) => {
    //   const range = curr.isSingleLine ? curr.start.line : `${curr.start.line}-${curr.end.line}`;
    //   return prev + `${prev ? ', ' : ''}${range}`;
    // }, '');
    return fs
      .readFileSync(pathUri.fsPath, 'utf8')
      .replace('SELECT_LIST_STRING', selectListString)
      .replace('FILENAME', path.basename(fileName));
  }
}
