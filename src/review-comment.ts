import * as fs from 'fs';
import { window, workspace, TextEditor } from 'vscode';
const gitCommitId = require('git-commit-id');
import { CsvEntry, CsvStructure } from './model';
import {
  removeLeadingAndTrailingSlash,
  removeTrailingSlash,
  startLineNumberFromStringDefinition,
  endLineNumberFromStringDefinition,
  relativeToWorkspace,
} from './utils/workspace-util';
import { getSelectionStringDefinition, hasSelection } from './utils/editor-utils';
import { getCsvFileLinesAsArray, setCsvFileLines } from './utils/storage-utils';
import { revision } from './vcs-provider';

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

    comment.filename = relativeToWorkspace(this.workspaceRoot, editor!.document.fileName);

    this.finalizeComment(comment, this.workspaceRoot).then((entry: CsvEntry) => {
      setCsvFileLines(this.reviewFile, [CsvStructure.formatAsCsvLine(entry)], false);
    });
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

    this.finalizeComment(comment, this.workspaceRoot).then((entry: CsvEntry) => {
      rows[updateRowIndex] = CsvStructure.formatAsCsvLine(entry);
      setCsvFileLines(this.reviewFile, rows);
    });
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
  private async finalizeComment(comment: CsvEntry, workspaceRoot: string): Promise<CsvEntry> {
    const copy = { ...comment };

    try {
      copy.revision = await revision(comment.filename, workspaceRoot);
    } catch (error) {
      copy.revision = '';
      window.showErrorMessage(`Repository not under version control as configured in the plugin's settings.
      Leaving revision empty.\n\Details: ${error}`);
    }

    const startAnchor = startLineNumberFromStringDefinition(copy.lines);
    const endAnchor = endLineNumberFromStringDefinition(copy.lines);
    copy.url = this.remoteUrl(copy.revision, copy.filename, startAnchor, endAnchor);

    return copy;
  }

  /**
   * Build the remote URL
   * @param revision a git revision that's included in the URL
   * @param filePath the relative file path
   * @param start the first line from the first selection
   * @param end the last line from the first selection
   */
  private remoteUrl(revision: string, filePath: string, start?: number, end?: number) {
    const customUrl = workspace.getConfiguration().get('code-review.customUrl') as string;
    const baseUrl = workspace.getConfiguration().get('code-review.baseUrl') as string;

    const filePathWithoutLeadingAndTrailingSlash = removeLeadingAndTrailingSlash(filePath);

    if (!baseUrl && !customUrl) {
      return '';
    } else if (customUrl) {
      return customUrl
        .replace('{revision}', revision)
        .replace('{file}', filePathWithoutLeadingAndTrailingSlash)
        .replace('{start}', start ? start.toString() : '0')
        .replace('{end}', end ? end.toString() : '0');
    } else {
      const baseUrlWithoutTrailingSlash = removeTrailingSlash(baseUrl);
      const revPart = revision ? `${revision}/` : '';
      const anchorPart = start && end ? `#L${start}-L${end}` : '';
      return `${baseUrlWithoutTrailingSlash}/${revPart}${filePathWithoutLeadingAndTrailingSlash}${anchorPart}`;
    }
  }

  private checkFileExists() {
    if (!fs.existsSync(this.reviewFile)) {
      window.showErrorMessage(`Could not add to file: '${this.reviewFile}': File does not exist`);
    }
  }
}
