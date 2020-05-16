import * as fs from 'fs';
import { window } from 'vscode';

import { InputBoxOptions } from 'vscode';

export class ReviewCommentService {
  constructor(private reviewFile: string, private workspaceRoot: string) {}

  /**
   * Append a new comment
   * @param filePath the relative file path starting from the workspace root
   * @param lineOrLines the line or lines the comment is related to
   * @param comment the comment message
   */
  async addComment() {
    this.checkFileExists();

    let lineOrLines = 0;
    if (window.activeTextEditor) {
      lineOrLines = window.activeTextEditor.selection.active.line;
    }

    let activeFileName = '';
    if (window.activeTextEditor) {
      activeFileName = window.activeTextEditor.document.fileName.replace(this.workspaceRoot, '');
    }

    const comment: string | undefined = await this.prompt();
    if (!comment) {
      return;
    }

    // escape double quotes
    const commentExcaped = comment.replace(/"/g, '\\"');
    const lineOrLinesString: string = Array.isArray(lineOrLines)
      ? `${lineOrLines[0]}-${lineOrLines[lineOrLines.length - 1]}`
      : `${lineOrLines}`;
    fs.appendFileSync(this.reviewFile, `"${activeFileName}","${lineOrLinesString}","${commentExcaped}",1\r\n`);
  }

  editComment(/*lineOrLines, comment*/) {}

  removeComment(/*lineOrLines, comment*/) {}

  async prompt(): Promise<string | undefined> {
    const options: InputBoxOptions = {
      ignoreFocusOut: true,
      placeHolder: 'your comment',
      prompt: `Please enter your comment`,
    };

    return await window.showInputBox(options);
  }

  private checkFileExists() {
    if (!fs.existsSync(this.reviewFile)) {
      window.showErrorMessage(`Could not add modify to file: '${this.reviewFile}': File does not exist`);
      return;
    }
  }
}
