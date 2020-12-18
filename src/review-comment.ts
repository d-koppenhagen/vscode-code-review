import * as fs from 'fs';
import { EOL } from 'os';
import { window, workspace, TextEditor } from 'vscode';
const gitCommitId = require('git-commit-id');

import { CsvEntry } from './interfaces';
import {
  removeLeadingAndTrailingSlash,
  removeTrailingSlash,
  escapeDoubleQuotesForCsv,
  escapeEndOfLineForCsv,
  startLineNumberFromStringDefinition,
  endLineNumberFromStringDefinition,
} from './utils/workspace-util';
import { CommentListEntry } from './comment-list-entry';
import { getSelectionStringDefinition, hasSelection } from './utils/editor-utils';

export class ReviewCommentService {
  constructor(private reviewFile: string, private workspaceRoot: string) {}

  /**
   * Append a new comment
   * @param comment The comment message
   * @param editor The working text editor
   */
  async addComment(comment: CsvEntry, editor: TextEditor | null = null) {
    //const newEntry: CsvEntry = { ...comment };
    this.checkFileExists();

    if (!this.getSelectedLines(comment, editor)) {
      return;
    }

    comment.filename = editor!.document.fileName.replace(this.workspaceRoot, '');

    this.persistComments([this.buildCsvString(comment)], false);
  }

  /**
   * Modify an existing comment
   * @param comment The comment message
   * @param editor The working text editor
   */
  async updateComment(comment: CsvEntry, editor: TextEditor | null = null) {
    this.checkFileExists();

    // Store previous selected lines as they will be used for comment lookup
    const key = comment.lines;
    // Refresh selected lines
    if (!this.getSelectedLines(comment, editor, true)) {
      return;
    }

    const oldFileContent = fs.readFileSync(this.reviewFile, 'utf8'); // get old content
    const rows = oldFileContent.split(EOL);
    const updateRowIndex = rows.findIndex((row) => row.includes(comment.filename) && row.includes(key));
    if (updateRowIndex > -1) {
      rows[updateRowIndex] = this.buildCsvString(comment);
    } else {
      window.showErrorMessage(
        `Update failed. Cannot find line definition '${comment.lines}' for '${comment.filename}' in '${this.reviewFile}'.`,
      );
    }

    this.persistComments(rows);
  }

  async deleteComment(entry: CommentListEntry) {
    this.checkFileExists();

    const oldFileContent = fs.readFileSync(this.reviewFile, 'utf8'); // get old content
    const rows = oldFileContent.split(EOL);
    // Escape text to search for
    const textEscaped = escapeEndOfLineForCsv(escapeDoubleQuotesForCsv(entry.text));
    const updateRowIndex = rows.findIndex((row) => row.includes(entry.label) && row.includes(textEscaped));
    if (updateRowIndex > -1) {
      rows.splice(updateRowIndex, 1);
      this.persistComments(rows);
    } else {
      window.showErrorMessage(`Update failed. Cannot delete comment '${entry.label}' in '${this.reviewFile}'.`);
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
   * Store the comments
   *
   * @param string[] rows The lines to store
   * @param boolean overwrite Replace all (true) / append (false)
   */
  private persistComments(rows: string[], overwrite: boolean = true) {
    // The last line of the file must always be terminated with an EOL
    const content = this.cleanCsvStorage(rows).join(EOL) + EOL;

    if (overwrite) {
      fs.writeFileSync(this.reviewFile, content);
    } else {
      fs.appendFileSync(this.reviewFile, content);
    }
  }

  /**
   * Keep only valid lines for storage
   *
   * @param string[] rows The candidate lines to store
   * @return string[]
   */
  private cleanCsvStorage(rows: string[]): string[] {
    return rows.filter((row) => row?.trim()?.length ?? 0 > 0);
  }

  private buildCsvString(comment: CsvEntry): string {
    // escape double quotes
    const commentExcaped = escapeEndOfLineForCsv(escapeDoubleQuotesForCsv(comment.comment));
    const titleExcaped = comment.title ? escapeDoubleQuotesForCsv(comment.title) : '';
    const priority = comment.priority || 0;
    const additional = comment.additional ? escapeDoubleQuotesForCsv(comment.additional) : '';
    const category = comment.category || '';

    let sha = '';
    try {
      sha = gitCommitId({ cwd: this.workspaceRoot });
    } catch (error) {
      sha = '';
      console.log('Not in a git repository. Leaving SHA empty', error);
    }

    const startAnker = startLineNumberFromStringDefinition(comment.lines);
    const endAnker = endLineNumberFromStringDefinition(comment.lines);
    const remoteUrl = this.remoteUrl(sha, comment.filename, startAnker, endAnker);

    return `"${sha}","${comment.filename}","${remoteUrl}","${comment.lines}","${titleExcaped}","${commentExcaped}","${priority}","${category}","${additional}"`;
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
      return;
    }
  }
}
