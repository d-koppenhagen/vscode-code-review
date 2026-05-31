import { window, ViewColumn, ExtensionContext, workspace, Range, WebviewPanel, Uri, TextEditor } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ReviewCommentService } from './review-comment';
import { createCommentFromObject, CsvEntry, CsvStructure } from './model';
import { CommentListEntry } from './comment-list-entry';
import { clearSelection, getSelectionRanges } from './utils/editor-utils';
import { colorizedBackgroundDecoration } from './utils/decoration-utils';

export class WebViewComponent {
  private categories: string[] = [];
  private highlightDecorationColor: string = '';
  private panel: WebviewPanel | null = null;
  private editor: TextEditor | null = null;
  private cachedTemplate: string = '';
  private currentMessageListener: { dispose(): void } | null = null;
  private currentDisposeListener: { dispose(): void } | null = null;
  private autoCloseTimer: NodeJS.Timeout | null = null;
  private readonly AUTO_CLOSE_MS = 60_000;
  private closePanelAfterAdd: boolean;
  private closePanelAfterEdit: boolean;
  onDidChange?: () => void;
  private currentAddDecoration: { dispose(): void } | null = null;

  constructor(public context: ExtensionContext) {
    this.categories = workspace.getConfiguration().get('code-review.categories') as string[];
    this.highlightDecorationColor = workspace
      .getConfiguration()
      .get('code-review.codeSelectionBackgroundColor') as string;
    this.closePanelAfterAdd = workspace.getConfiguration().get('code-review.closePanelAfterAdd', true) as boolean;
    this.closePanelAfterEdit = workspace.getConfiguration().get('code-review.closePanelAfterEdit', false) as boolean;

    // Cache the HTML template once to avoid disk I/O on every open
    const uri = Uri.joinPath(this.context.extensionUri, 'dist', 'webview.html');
    const pathUri = uri.with({ scheme: 'vscode-resource' });
    this.cachedTemplate = fs.readFileSync(pathUri.fsPath, 'utf8');
  }

  /**
   * Get and store the working text editor
   * @return TextEditor
   */
  private getWorkingEditor(): TextEditor {
    if (this.editor === null) {
      this.editor = window.activeTextEditor ?? window.visibleTextEditors[0];
    }
    return this.editor;
  }

  /**
   * Dispose the stored working editor.
   */
  private disposeWorkingEditor() {
    this.editor = null;
  }

  /**
   * Show or reuse the webview panel. Reuses existing panel to avoid
   * the expensive createWebviewPanel call on every comment click.
   * @param title The title of the panel
   * @param fileName The file referenced by the comment
   * @return WebviewPanel The panel object
   */
  private showPanel(title: string, fileName: string): WebviewPanel {
    if (this.panel) {
      this.panel.title = title;
      this.panel.webview.html = this.buildHtml(fileName);
      this.panel.reveal(ViewColumn.Beside);
      this.resetAutoClose();
      return this.panel;
    }

    this.panel = window.createWebviewPanel(
      'text',
      title,
      { viewColumn: ViewColumn.Beside },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    this.panel.webview.html = this.buildHtml(fileName);
    this.resetAutoClose();
    return this.panel;
  }

  private resetAutoClose(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
    }
    this.autoCloseTimer = setTimeout(() => {
      this.panel?.dispose();
    }, this.AUTO_CLOSE_MS);
  }

  private buildHtml(fileName: string): string {
    const selectListString = this.categories.reduce((current, category) => {
      return current + `<option value="${category}">${category}</option>`;
    }, '');
    return this.cachedTemplate
      .replace('SELECT_LIST_STRING', selectListString)
      .replace('FILENAME', path.basename(fileName));
  }

  deleteComment(commentService: ReviewCommentService, entry: CommentListEntry) {
    commentService.deleteComment(entry.id, entry.description);
    this.panel?.dispose();
  }

  editComment(commentService: ReviewCommentService, selections: Range[], data: CsvEntry) {
    this.disposeWorkingEditor();
    const editor = this.getWorkingEditor();
    // Clear the current text selection to avoid unwanted code selection changes.
    clearSelection(editor);

    const decoration = colorizedBackgroundDecoration(selections, editor, this.highlightDecorationColor);

    const panel = this.showPanel('Edit code review comment', editor.document.fileName);

    data = CsvStructure.finalizeParse(data);
    panel.webview.postMessage({
      command: 'populate',
      filename: path.basename(editor.document.fileName),
      comment: { ...data },
    });

    // Dispose old listeners when reusing panel
    this.currentMessageListener?.dispose();
    this.currentDisposeListener?.dispose();

    // Handle messages from the webview
    this.currentMessageListener = panel.webview.onDidReceiveMessage(
      (message) => {
        this.resetAutoClose();
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
            this.onDidChange?.();
            if (this.closePanelAfterEdit) {
              panel.dispose();
            } else {
              panel.webview.postMessage({
                command: 'populate',
                filename: path.basename(this.getWorkingEditor().document.fileName),
                comment: { ...newEntry },
              });
            }
            break;

          case 'cancel':
            panel.dispose();
            break;

          case 'delete':
            window
              .showInformationMessage('Do you really want to delete this comment?', ...['Yes', 'No'])
              .then((answer) => {
                if (answer === 'Yes') {
                  commentService.deleteComment(data.id, data.title);
                  panel.dispose();
                } else {
                  this.editComment(commentService, selections, data);
                }
              });
            break;
        }
      },
      undefined,
      this.context.subscriptions,
    );

    this.currentDisposeListener = panel.onDidDispose(() => {
      decoration.dispose();
      this.disposeWorkingEditor();
    });
  }

  /**
   * Show the add-comment form. The panel is created on first call and kept
   * alive (or disposed + recreated) based on the closePanelAfterAdd setting.
   * On submit the comment is written to CSV, then the form is either cleared
   * via postMessage or the panel is disposed.
   */
  addComment(commentService: ReviewCommentService) {
    this.disposeWorkingEditor();
    const editor = this.getWorkingEditor();
    this.currentAddDecoration?.dispose();
    this.currentAddDecoration = colorizedBackgroundDecoration(
      getSelectionRanges(editor),
      editor,
      this.highlightDecorationColor,
    );

    const panel = this.showPanel('Add code review comment', editor.document.fileName);

    this.currentMessageListener?.dispose();
    this.currentDisposeListener?.dispose();

    // Handle messages from the webview
    this.currentMessageListener = panel.webview.onDidReceiveMessage(
      (message) => {
        this.resetAutoClose();
        switch (message.command) {
          case 'submit':
            commentService.addComment(createCommentFromObject(message.text), this.getWorkingEditor());
            this.onDidChange?.();
            this.currentAddDecoration?.dispose();
            this.currentAddDecoration = null;

            if (this.closePanelAfterAdd) {
              panel.dispose();
            } else {
              panel.webview.postMessage({ command: 'reset' });
            }
            break;

          case 'cancel':
            this.currentAddDecoration?.dispose();
            this.currentAddDecoration = null;

            if (this.closePanelAfterAdd) {
              panel.dispose();
            } else {
              panel.webview.postMessage({ command: 'reset' });
            }
            break;
        }
      },
      undefined,
      this.context.subscriptions,
    );

    this.currentDisposeListener = panel.onDidDispose(() => {
      this.currentAddDecoration?.dispose();
      this.currentAddDecoration = null;
      this.disposeWorkingEditor();
    });
  }
}
