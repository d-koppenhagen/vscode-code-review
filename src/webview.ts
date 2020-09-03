import { window, ViewColumn, ExtensionContext, workspace, Range, WebviewPanel, Uri } from 'vscode';
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
    const decorations = selections.map((selection) => {
      return commentService.colorizeSelection(selection);
    });

    // initialize new web tab
    this.panel = window.createWebviewPanel(
      'text',
      'Edit code review comment',
      { viewColumn: ViewColumn.Beside },
      {
        enableScripts: true,
      },
    );

    this.panel.webview.html = this.getWebviewContent();
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
      decorations.forEach((decoration) => {
        decoration.dispose();
      });
    });
  }

  addComment(commentService: ReviewCommentService) {
    // highlight selected lines
    const decoration = commentService.colorizeSelection();

    this.panel = window.createWebviewPanel(
      'text',
      'Add code review comment',
      { viewColumn: ViewColumn.Beside },
      {
        enableScripts: true,
      },
    );

    this.panel.webview.html = this.getWebviewContent();
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

  getWebviewContent(): string {
    let selectListString = this.categories.reduce((current, category) => {
      return (current += `<option value="${category}">${category}</option>`);
    }, '');
    const uri = Uri.parse(this.context.asAbsolutePath(path.join('dist', 'webview.html')));
    const pathUri = uri.with({ scheme: 'vscode-resource' });
    return fs.readFileSync(pathUri.fsPath, 'utf8').replace('SELECT_LIST_STRING', selectListString);
  }
}
