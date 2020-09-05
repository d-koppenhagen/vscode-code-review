import { window, ViewColumn, ExtensionContext, workspace, Range, WebviewPanel, Uri, Position } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ReviewCommentService } from './review-comment';
import { CsvEntry } from './interfaces';
import { CommentListEntry } from './comment-list-entry';

export class WebViewComponent {
  private categories: string[] = [];
  public panel: WebviewPanel | null = null;

  constructor(public context: ExtensionContext) {
    this.categories = workspace.getConfiguration().get('code-review.categories') as string[];
  }

  deleteComment(commentService: ReviewCommentService, entry: CommentListEntry) {
    commentService.deleteComment(entry);
  }

  editComment(commentService: ReviewCommentService, selections: Range[], data: CsvEntry) {
    // highlight selection
    const decoration = commentService.colorizeSelection(selections);

    // initialize new web tab
    this.panel = this.createWebView('Edit code review comment');

    const editor = window.activeTextEditor ?? window.visibleTextEditors[0];
    this.panel.webview.html = this.getWebviewContent(editor.document.fileName);
    // const pathToHtml = Uri.file(path.join(this.context.extensionPath, 'src', 'webview.html'));
    // const pathUri = pathToHtml.with({ scheme: 'vscode-resource' });
    // panel.webview.html = fs.readFileSync(pathUri.fsPath, 'utf8');
    const priorities = workspace.getConfiguration().get('code-review.priorities') as string[];

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
            commentService.updateComment(newEntry);
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
    });
  }

  addComment(commentService: ReviewCommentService) {
    // highlight selected lines
    const editor = window.activeTextEditor ?? window.visibleTextEditors[0];
    const ranges: Range[] = editor.selections.map((el) => {
      return new Range(new Position(el.start.line, el.start.character), new Position(el.end.line, el.end.character));
    });
    const decoration = commentService.colorizeSelection(ranges);

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
            commentService.addComment(comment);
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
