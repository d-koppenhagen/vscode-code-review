import { window, Uri, ViewColumn, ExtensionContext } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewCommentService } from './review-comment';
import { ReviewComment } from './interfaces';

export class WebViewComponent {
  constructor(public context: ExtensionContext) {}
  addComment(commentService: ReviewCommentService) {
    // initialize new web tab
    const panel = window.createWebviewPanel(
      'text',
      'Add code review comment',
      { viewColumn: ViewColumn.Beside },
      {
        enableScripts: true,
      },
    );
    const pathToHtml = Uri.file(path.join(this.context.extensionPath, 'src', 'webview.html'));
    const pathUri = pathToHtml.with({ scheme: 'vscode-resource' });
    panel.webview.html = fs.readFileSync(pathUri.fsPath, 'utf8');

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'submit':
            const comment = JSON.parse(message.text) as ReviewComment;
            commentService.addComment(comment);
            panel.dispose();
            return;
          case 'cancel':
            panel.dispose();
            return;
        }
      },
      undefined,
      this.context.subscriptions,
    );
  }
}
