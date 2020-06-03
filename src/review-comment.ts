import * as fs from 'fs';
import { EOL } from 'os';
import { window, workspace } from 'vscode';
const gitCommitId = require('git-commit-id');

import { ReviewComment } from './interfaces';
import { removeLeadingAndTrailingSlash, removeTrailingSlash } from './utils/workspace-util';

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
    let startAnker: number | undefined = undefined;
    let endAnker: number | undefined = undefined;
    if (window.activeTextEditor) {
      // 2:2-12:2|19:0-19:0
      selections = window.activeTextEditor.selections.reduce((acc, cur) => {
        const tmp = acc ? `${acc}|` : '';
        return `${tmp}${cur.start.line + 1}:${cur.start.character}-${cur.end.line + 1}:${cur.end.character}`;
      }, '');

      // use the first line selection for building an anker for the target URL
      if (window.activeTextEditor.selections.length) {
        startAnker = window.activeTextEditor.selections[0].start.line + 1;
        endAnker = window.activeTextEditor.selections[0].end.line + 1;
      }
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
    const category = comment.category || '';
    let sha = '';
    try {
      sha = gitCommitId({ cwd: this.workspaceRoot });
    } catch (error) {
      sha = '';
      console.log('Not in a git repository. Leaving SHA empty', error);
    }

    const remoteUrl = this.remoteUrl(sha, activeFileName, startAnker, endAnker);

    fs.appendFileSync(
      this.reviewFile,
      `"${sha}","${activeFileName}","${remoteUrl}","${selections}","${titleExcaped}","${commentExcaped}","${priority}","${category}","${additional}"${EOL}`,
    );
  }

  /**
   * Build the remote URL
   * @param sha a git SHA that's included in the URL
   * @param filePath the relative file path
   * @param start the first line from the first selection
   * @param end the last line from the first selection
   */
  private remoteUrl(sha: string, filePath: string, start?: number, end?: number) {
    const customUrl = workspace.getConfiguration().get('code-review.customUrl') as string;
    const baseUrl = workspace.getConfiguration().get('code-review.baseUrl') as string;

    const filePathWithoutLeadingAndTrailingSlash = removeLeadingAndTrailingSlash(filePath);

    if (!baseUrl && !customUrl) {
      return '';
    } else if (customUrl) {
      return customUrl
        .replace('{sha}', sha)
        .replace('{file}', filePathWithoutLeadingAndTrailingSlash)
        .replace('{start}', start ? start.toString() : '0')
        .replace('{end}', end ? end.toString() : '0');
    } else {
      const baseUrlWithoutTrailingSlash = removeTrailingSlash(baseUrl);
      const shaPart = sha ? `${sha}/` : '';
      const ankerPart = start && end ? `#L${start}-L${end}` : '';
      return `${baseUrlWithoutTrailingSlash}/${shaPart}${filePathWithoutLeadingAndTrailingSlash}${ankerPart}`;
    }
  }

  private checkFileExists() {
    if (!fs.existsSync(this.reviewFile)) {
      window.showErrorMessage(`Could not add modify to file: '${this.reviewFile}': File does not exist`);
      return;
    }
  }
}
