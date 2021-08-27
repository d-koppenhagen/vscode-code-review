import * as fs from 'fs';
import { window, workspace, TextEditor } from 'vscode';
const gitCommitId = require('git-commit-id');
import { CsvEntry, CsvStructure } from './model';
import {
  removeLeadingAndTrailingSlash,
  removeTrailingSlash,
  startLineNumberFromStringDefinition,
  endLineNumberFromStringDefinition,
  standardizeFilename,
} from './utils/workspace-util';
import { CommentListEntry } from './comment-list-entry';
import { getSelectionStringDefinition, hasSelection } from './utils/editor-utils';
import { getCsvFileLinesAsArray, setCsvFileLines } from './utils/storage-utils';
import path from 'path';

export class ReviewCommentService {
  constructor(private reviewFile: string, private workspaceRoot: string) {}

  /**
   * Append a new comment
   * @param comment The comment message
   * @param editor The working text editor
   */
  async addComment(comment: CsvEntry, editor: TextEditor | null = null) {
    this.checkFileExists();

    if (!this.getSelectedLines(comment, editor)) {
      return;
    }

    comment.filename = standardizeFilename(this.workspaceRoot, editor!.document.fileName);

    setCsvFileLines(this.reviewFile, [CsvStructure.formatAsCsvLine(this.finalizeComment(comment))], false);
  }

  /**
   * Modify an existing comment
   * @param comment The comment message
   * @param editor The working text editor
   */
  async updateComment(comment: CsvEntry, editor: TextEditor | null = null) {
    this.checkFileExists();

    // Store previous selected lines as they will be used for comment lookup
    const fallBackKey = comment.lines;
    // Refresh selected lines
    if (!this.getSelectedLines(comment, editor, true)) {
      return;
    }

    const rows = getCsvFileLinesAsArray(this.reviewFile);
    let updateRowIndex = rows.findIndex((row) => row.includes(comment.id));
    if (updateRowIndex < 0) {
      // Fallback method to find comment by filename/selection
      updateRowIndex = rows.findIndex((row) => row.includes(comment.filename) && row.includes(fallBackKey));
    }

    if (updateRowIndex < 0) {
      window.showErrorMessage(
        `Update failed. Cannot find line definition '${comment.lines}' for '${comment.filename}' in '${this.reviewFile}'.`,
      );
      return;
    }

    rows[updateRowIndex] = CsvStructure.formatAsCsvLine(this.finalizeComment(comment));
    setCsvFileLines(this.reviewFile, rows);
  }

  async deleteComment(id: string, label: string) {
    this.checkFileExists();

    // Get old content
    const rows = getCsvFileLinesAsArray(this.reviewFile);
    const updateRowIndex = rows.findIndex((row) => row.includes(id));
    if (updateRowIndex > -1) {
      rows.splice(updateRowIndex, 1);
      setCsvFileLines(this.reviewFile, rows);
    } else {
      window.showErrorMessage(`Update failed. Cannot delete comment '${label}' in '${this.reviewFile}'.`);
    }
  }

  /**
   * Get the selected lines in the editor
   *
   * @param comment
   * @param editor The working text editor
   * @param ignoreIfNone Ignore the selection if nothing is selected (true)
   * @return boolean true if selected lines were succesfuly retrieved, false otherwise
   */
  private getSelectedLines(
    comment: CsvEntry,
    editor: TextEditor | null = null,
    ignoreIfNone: boolean = false,
  ): boolean {
    if (ignoreIfNone && !hasSelection(editor)) {
      // In case of an update operation, the code lines are highlighted, but not selected.
      // If the update is confirmed without re-selecting the code, the selection will be empty,
      // leading to a loss of the information stored in the `lines` property.
      // The `ignoreIfNone` argument can be used in this context to ignore the empty selection.
      return true;
    }

    if (!editor?.selection) {
      window.showErrorMessage(`Error referencing file/lines, Please select again.`);
      return false;
    }

    comment.lines = getSelectionStringDefinition(editor);

    return true;
  }

  /**
   * Finalize the construction of a comment
   * @param comment The comment to finalize
   * @return The finalized comment
   */
  private finalizeComment(comment: CsvEntry): CsvEntry {
    const copy = { ...comment };

    const gitDirectory = workspace.getConfiguration().get('code-review.gitDirectory') as string;
    const gitRepositoryPath = path.resolve(this.workspaceRoot, gitDirectory);

    try {
      copy.sha = gitCommitId({ cwd: gitRepositoryPath });
    } catch (error) {
      copy.sha = '';
      console.log('Not in a git repository. Leaving SHA empty', error);
    }

    const startAnker = startLineNumberFromStringDefinition(copy.lines);
    const endAnker = endLineNumberFromStringDefinition(copy.lines);
    copy.url = this.remoteUrl(copy.sha, copy.filename, startAnker, endAnker);

    return copy;
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
      window.showErrorMessage(`Could not add to file: '${this.reviewFile}': File does not exist`);
    }
  }
}
