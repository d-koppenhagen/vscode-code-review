import { window, ViewColumn, ExtensionContext, workspace, Range, WebviewPanel, Uri, TextEditor } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ReviewCommentService } from './review-comment';
import { createCommentFromObject, CsvEntry, CsvStructure } from './model';
import { CommentListEntry } from './comment-list-entry';
import { clearSelection, colorizeSelection, getSelectionRanges } from './utils/editor-utils';

export class WebViewComponent {
  private categories: string[] = [];
  /** Panel used to add/edit a comment */
  private panel: WebviewPanel | null = null;
  /** Reference to the working editor during note edition */
  private editor: TextEditor | null = null;

  /**
   * Show the comment edition panel
   *
   * @param title The title of the panel
   * @param fileName The file referenced by the comment
   * @return WebviewPanel The panel object
   */
  private showPanel(title: string, fileName: string): WebviewPanel {
    this.panel?.dispose(); // Dispose existing panel to avoid duplicates
    this.panel = this.createWebView(title);
    this.panel.webview.html = this.getWebviewContent(fileName);

    return this.panel;
  }

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
    const panel = this.showPanel('Edit code review comment', editor.document.fileName);
    // const pathToHtml = Uri.file(path.join(this.context.extensionPath, 'src', 'webview.html'));
    // const pathUri = pathToHtml.with({ scheme: 'vscode-resource' });
    // panel.webview.html = fs.readFileSync(pathUri.fsPath, 'utf8');
    // const priorities = workspace.getConfiguration().get('code-review.priorities') as string[];
    data = CsvStructure.finalizeParse(data);
    panel.webview.postMessage({ comment: { ...data } });

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
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
              private: formData.private || 0,
            };
            commentService.updateComment(newEntry, this.getWorkingEditor());
            panel.dispose();
            break;

          case 'cancel':
            panel.dispose();
            break;
        }
      },
      undefined,
      this.context.subscriptions,
    );

    panel.onDidDispose(() => {
      // reset highlight selected lines
      decoration.dispose();
      this.disposeWorkingEditor();
    });
  }

  addComment(commentService: ReviewCommentService) {
    // highlight selected lines
    const editor = this.getWorkingEditor();
    const decoration = colorizeSelection(getSelectionRanges(editor), editor);

    const panel = this.showPanel('Add code review comment', editor.document.fileName);
    // const pathToHtml = Uri.file(path.join(this.context.extensionPath, 'src', 'webview.html'));
    // const pathUri = pathToHtml.with({ scheme: 'vscode-resource' });
    // panel.webview.html = fs.readFileSync(pathUri.fsPath, 'utf8');

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'submit':
            commentService.addComment(createCommentFromObject(message.text), this.getWorkingEditor());
            break;

          case 'cancel':
            break;
        }

        panel.dispose();
      },
      undefined,
      this.context.subscriptions,
    );

    panel.onDidDispose(() => {
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

    const uri = Uri.joinPath(this.context.extensionUri, 'dist', 'webview.html');
    console.log('CODE REVIEW DEBUG, URI for webview.html', uri);
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
