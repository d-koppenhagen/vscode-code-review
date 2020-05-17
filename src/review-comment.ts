import * as fs from 'fs';
import { window } from 'vscode';

import { ReviewComment } from './interfaces';

export class ReviewCommentService {
  constructor(private reviewFile: string, private workspaceRoot: string) {}

  /**
   * Append a new comment
   * @param filePath the relative file path starting from the workspace root
   * @param lineOrLines the line or lines the comment is related to
   * @param comment the comment message
   */
  async addComment(comment: ReviewComment) {
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

    // escape double quotes
    const commentExcaped = comment.description.replace(/"/g, '\\"');
    const titleExcaped = comment.title ? comment.title.replace(/"/g, '\\"') : '';
    const priority = comment.priority || '';
    const additional = comment.additional ? comment.additional.replace(/"/g, '\\"') : '';

    fs.appendFileSync(
      this.reviewFile,
      `"${activeFileName}","${selections}","${titleExcaped}","${commentExcaped}","${priority}","${additional}"\r\n`,
    );
  }

  editComment(/*lineOrLines, comment*/) {}

  removeComment(/*lineOrLines, comment*/) {}

  private checkFileExists() {
    if (!fs.existsSync(this.reviewFile)) {
      window.showErrorMessage(`Could not add modify to file: '${this.reviewFile}': File does not exist`);
      return;
    }
  }
}
