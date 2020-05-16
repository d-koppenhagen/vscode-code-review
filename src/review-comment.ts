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
    let selections = '';
    if (window.activeTextEditor) {
      // 2:2-12:2|19:0-19:0
      selections = window.activeTextEditor.selections.reduce((acc, cur) => {
        const tmp = acc ? `${acc}|` : '';
        return `${tmp}${cur.start.line}:${cur.start.character}-${cur.end.line}:${cur.end.character}`;
      }, '');
    }

    let activeFileName = '';
    if (window.activeTextEditor) {
      activeFileName = window.activeTextEditor.document.fileName.replace(this.workspaceRoot, '');
    }

    const comment: string | undefined = await this.prompt();
    if (!comment) return;

    // escape double quotes
    const commentExcaped = comment.replace(/"/g, '\\"');
    fs.appendFileSync(this.reviewFile, `"${activeFileName}","${selections}","${commentExcaped}",1\r\n`);
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
