import {
  Disposable,
  Selection,
  StatusBarAlignment,
  StatusBarItem,
  TextEditor,
  TextEditorSelectionChangeEvent,
  ThemeColor,
  window,
} from 'vscode';
const { v4: uuidv4 } = require('uuid');
import { ReviewCommentService } from './review-comment';
import { CsvEntry } from './model';

const MIN_SELECTION_LENGTH = 2;

/**
 * Quick annotation mode -- toggle via Ctrl+Shift+A. When enabled, selecting
 * text (>= 2 chars) triggers a 300ms-debounced input box. The annotation
 * is written into the same CSV file used by Code Review.
 * Uses a generation counter (promptGeneration) so that if the user continues
 * selecting while the input box is open, the stale prompt is canceled and a
 * new one appears after the next 300ms pause.
 */
export class AnnotationManager implements Disposable {
  private enabled = false;
  private statusBarItem: StatusBarItem;
  private disposables: Disposable[] = [];
  private pendingPrompt = false;
  private promptGeneration = 0;
  private selectionTimer: NodeJS.Timeout | undefined;
  private onUpdateCallback: (() => void) | undefined;

  constructor(private commentService: ReviewCommentService, private fileGenerator: { create: () => boolean }) {
    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 99);
    this.statusBarItem.command = 'annote.toggleMode';
    this.updateStatusBar();

    this.disposables.push(
      this.statusBarItem,
      window.onDidChangeTextEditorSelection((e) => {
        if (this.enabled) {
          this.onSelectionChanged(e);
        }
      }),
    );
  }

  setOnUpdate(callback: () => void): void {
    this.onUpdateCallback = callback;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  toggleMode(): void {
    this.enabled = !this.enabled;
    this.updateStatusBar();
    if (this.enabled) {
      window.showInformationMessage('Annotation mode ON — select text to annotate');
    } else {
      window.showInformationMessage('Annotation mode OFF');
    }
  }

  dispose(): void {
    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private updateStatusBar(): void {
    if (this.enabled) {
      this.statusBarItem.text = '$(edit) Annote: ON';
      this.statusBarItem.tooltip = 'Annotation mode active — click to toggle off';
      this.statusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBarItem.text = '$(edit) Annote: OFF';
      this.statusBarItem.tooltip = 'Annotation mode inactive — click to toggle on';
      this.statusBarItem.backgroundColor = undefined;
    }
    this.statusBarItem.show();
  }

  private onSelectionChanged(event: TextEditorSelectionChangeEvent): void {
    const selection = event.selections[0];
    if (!selection || selection.isEmpty) {
      return;
    }
    const text = event.textEditor.document.getText(selection);
    if (text.length < MIN_SELECTION_LENGTH) {
      return;
    }

    if (this.pendingPrompt) {
      this.pendingPrompt = false;
      this.promptGeneration++;
    }

    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
    }
    this.selectionTimer = setTimeout(() => {
      this.selectionTimer = undefined;
      this.promptAndAnnotate(event.textEditor, selection);
    }, 300);
  }

  private async promptAndAnnotate(editor: TextEditor, selection?: Selection): Promise<void> {
    if (this.pendingPrompt) return;
    this.pendingPrompt = true;
    const generation = this.promptGeneration;

    const sel = selection ?? editor.selection;
    if (sel.isEmpty) {
      this.pendingPrompt = false;
      return;
    }

    const selectedText = editor.document.getText(sel);
    if (selectedText.length < MIN_SELECTION_LENGTH) {
      this.pendingPrompt = false;
      return;
    }

    const preview = selectedText.length > 60 ? selectedText.substring(0, 60) + '...' : selectedText;

    const note = await window.showInputBox({
      prompt: `Add annotation for: "${preview}"`,
      placeHolder: 'Enter your annotation note...',
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Annotation cannot be empty';
        }
        return undefined;
      },
    });

    if (note === undefined || generation !== this.promptGeneration) {
      this.pendingPrompt = false;
      return;
    }

    // Ensure CSV file exists
    if (!this.fileGenerator.create()) {
      this.pendingPrompt = false;
      return;
    }

    // Create a code review entry with defaults
    const entry: CsvEntry = {
      sha: '',
      filename: '',
      url: '',
      lines: '',
      title: preview,
      comment: note.trim(),
      priority: 0,
      category: '',
      additional: '',
      id: uuidv4(),
      private: 0,
      resolved: 0,
    };

    await this.commentService.addComment(entry, editor);
    this.onUpdateCallback?.();

    window.showInformationMessage(`Annotation added`);
    this.pendingPrompt = false;
  }
}
