import * as fs from 'fs';
import * as path from 'path';
import { stripIndent } from 'common-tags';
import handlebars from 'handlebars';

import {
  workspace,
  Uri,
  window,
  ViewColumn,
  TreeItemCollapsibleState,
  ExtensionContext,
  ThemeIcon,
  commands,
} from 'vscode';

import { parseFile } from '@fast-csv/parse';
import { EOL } from 'os';
import { encode, decode } from 'js-base64';

import {
  toAbsolutePath,
  getFileContentForRange,
  sortCsvEntryForLines,
  sortLineSelections,
  rangeFromStringDefinition,
  escapeEndOfLineForCsv,
  relativeToWorkspace,
  splitStringDefinition,
} from './utils/workspace-util';
import { ReviewFileExportSection, GroupBy, ExportFormat, ExportMap, Group } from './interfaces';
import { CsvEntry, CsvStructure } from './model';
import { CommentListEntry } from './comment-list-entry';
import { FileGenerator } from './file-generator';
import { gitRevision } from './vcs-provider';
import { Location, parseLocation, themeColorForPriority } from './utils/editor-utils';
const gitCommitId = require('git-commit-id');

type SortT = -1 | 0 | 1;

// TODO GH-123 Switch from CsvEntry as main data model to an internal one an map over that here.
//             Rationale: Why should the explorer view care about a CsvEntry format?
interface Model extends CsvEntry {
  location?: Location;
}

/**
 * Compares two models regarding their location information. If neither of both has location information, then both
 * are treated as equal. Models with location information come before models without.
 * If both models have location information, than the following holds:
 *
 *    lhs < rhs :<=> (lhs.lineStart, lhs.columStart) < (rhs.lineStart, rhs.columStart)
 *
 * i.e., they are compared lexicographically.
 *
 * @param lhs Left-hand side of the comparison
 * @param rhs Right-hand side of the comparison
 *
 * @returns -1 if lhs < rhs; 1 if lhs > rhs; 0 otherwise.
 */
export const compareLocation = (lhs?: Location, rhs?: Location): SortT => {
  if (lhs === undefined && rhs === undefined) {
    return 0;
  }
  if (lhs === undefined) {
    return 1;
  }
  if (rhs === undefined) {
    return -1;
  }

  if (lhs.lineStart < rhs.lineStart) {
    return -1;
  } else if (lhs.lineStart > rhs.lineStart) {
    return 1;
  }

  // Now: lhs.location.lineStart === rhs.location.lineStart
  if (lhs.columnStart < rhs.columnStart) {
    return -1;
  } else if (lhs.columnStart > rhs.columnStart) {
    return 1;
  }

  return 0;
};

export const compare = (lhs: Model, rhs: Model): SortT => {
  return compareLocation(lhs.location, rhs.location);
};

export class ExportFactory {
  private defaultFileName = 'code-review';
  private groupBy: GroupBy;
  private includeCodeSelection = false;
  private includePrivateComments = false;
  private privateCommentIcon: string;
  private filterByCommit: boolean = false;
  private currentCommitId: string | null = null;
  private filterByFilename: boolean = false;
  private currentFilename: string | null = null;

  /**
   * Get comment eligibility
   * @param entry The comment to evaluate
   */
  private isCommentEligible(entry: CsvEntry): boolean {
    return (
      (this.currentCommitId === null || entry.revision === this.currentCommitId) &&
      (this.currentFilename === null || entry.filename === this.currentFilename)
    );
  }

  private exportHandlerMap = new Map<ExportFormat, ExportMap>([
    [
      'html',
      {
        fileExtension: 'html',
        storeOutside: true,
        writeFileHeader: (_outputFile: string) => {
          return;
        },
        handleData: (_outputFile: string, row: CsvEntry): CsvEntry => {
          row.code = this.includeCodeSelection ? this.getCodeForFile(row.filename, row.lines) : '';
          return row;
        },
        handleEnd: (outputFile: string, rows: CsvEntry[], template: Uri) => {
          // check template
          const templateData = fs.readFileSync(template.fsPath, 'utf8');
          if (!templateData) {
            window.showErrorMessage(`Error when reading the template file: '${template.fsPath}'`);
          }
          // check if grouping should be applied
          let reviewExportData: ReviewFileExportSection[] = [];
          reviewExportData = this.groupResults(rows, this.groupBy);
          if (this.groupBy === Group.filename) {
            reviewExportData.forEach((group) => {
              group.lines.sort(sortCsvEntryForLines);
            });
          }

          // Helper that decodes the Base64 content to be displayed in the handlebar
          handlebars.registerHelper('codeBlock', (code: string) => decode(code));
          // compile template after helper is registered
          const templateCompiled = handlebars.compile(templateData);
          // inject date into the template
          const htmlOut = templateCompiled(reviewExportData);
          fs.writeFileSync(outputFile, htmlOut);
          window.showInformationMessage(`Code review file: '${outputFile}' successfully created.`);
          this.showPreview(outputFile);
        },
      },
    ],
    [
      'gitlab',
      {
        fileExtension: 'gitlab.csv',
        storeOutside: false,
        writeFileHeader: (outputFile: string) => {
          fs.writeFileSync(outputFile, `title,description${EOL}`);
        },
        handleData: (outputFile: string, row: CsvEntry): CsvEntry => {
          row.comment = escapeEndOfLineForCsv(row.comment);

          this.includeCodeSelection ? (row.code = this.getCodeForFile(row.filename, row.lines)) : delete row.code;
          // cut the description (100 chars max) along with '...' at the end
          const descShort = row.comment.length > 100 ? `${row.comment.substring(0, 100)}...` : row.comment;
          // use the title when provided but max 255 characters (as GitLab supports this length for titles), otherwise use the shortened description
          const title = row.title ? row.title.substring(0, 255) : descShort;
          const fileRow = row.url ? `- file: [${row.filename}](${row.url})${EOL}` : `${row.filename}${EOL}`;
          const linesRow = `- lines: ${row.lines}${EOL}`;
          const revRow = row.revision ? `- SHA: ${row.revision}${EOL}${EOL}` : '';
          const commentSection = `## Comment${EOL}${row.comment}${EOL}`;
          const additional = row.additional ? `## Additional information${EOL}${row.additional}${EOL}` : '';
          const priority = row.priority ? `## Priority${EOL}${this.priorityName(row.priority)}${EOL}${EOL}` : '';
          const category = row.category ? `## Category${EOL}${row.category}${EOL}${EOL}` : '';
          const code = row.code ? `${EOL}## Source Code${EOL}${EOL}\`\`\`${EOL}${row.code}\`\`\`${EOL}` : '';
          const description = `${priority}${category}## Affected${EOL}${fileRow}${linesRow}${revRow}${commentSection}${EOL}${additional}${code}`;
          fs.appendFileSync(outputFile, `"[code review] ${title}","${description}"${EOL}`);
          return row;
        },
        handleEnd: (outputFile: string, _rows: CsvEntry[]) => {
          window.showInformationMessage(`GitLab importable CSV file: '${outputFile}' successfully created.`);
        },
      },
    ],
    [
      'github',
      {
        fileExtension: 'github.csv',
        storeOutside: false,
        writeFileHeader: (outputFile: string) => {
          fs.writeFileSync(outputFile, `title,description,labels,state,assignee${EOL}`);
        },
        handleData: (outputFile: string, row: CsvEntry): CsvEntry => {
          row.comment = escapeEndOfLineForCsv(row.comment);

          this.includeCodeSelection ? (row.code = this.getCodeForFile(row.filename, row.lines)) : delete row.code;
          // cut the description (100 chars max) along with '...' at the end
          const descShort = row.comment.length > 100 ? `${row.comment.substring(0, 100)}...` : row.comment;
          // use the title when provided but max 255 characters (as GitLab supports this length for titles), otherwise use the shortened description
          const title = row.title ? row.title.substring(0, 255) : descShort;

          const fileRow = row.url ? `- file: [${row.filename}](${row.url})${EOL}` : `${row.filename}${EOL}`;
          const linesRow = `- lines: ${row.lines}${EOL}`;
          const revRow = row.revision ? `- SHA: ${row.revision}${EOL}${EOL}` : '';
          const commentSection = `## Comment${EOL}${row.comment}${EOL}`;
          const additional = row.additional ? `## Additional information${EOL}${row.additional}${EOL}` : '';
          const priority = row.priority ? `## Priority${EOL}${this.priorityName(row.priority)}${EOL}${EOL}` : '';
          const category = row.category ? `## Category${EOL}${row.category}${EOL}${EOL}` : '';
          const code = row.code ? `${EOL}## Source Code${EOL}${EOL}\`\`\`${EOL}${row.code}\`\`\`${EOL}` : '';

          const description = `${priority}${category}## Affected${EOL}${fileRow}${linesRow}${revRow}${commentSection}${EOL}${additional}${code}`;

          fs.appendFileSync(outputFile, `"[code review] ${title}","${description}","code-review","open",""${EOL}`);
          return row;
        },
        handleEnd: (outputFile: string, _rows: CsvEntry[]) => {
          window.showInformationMessage(`GitHub importable CSV file: '${outputFile}' successfully created.`);
        },
      },
    ],
    [
      'jira',
      {
        fileExtension: 'jira.csv',
        storeOutside: false,
        writeFileHeader: (outputFile: string) => {
          fs.writeFileSync(
            outputFile,
            `Summary,Description,Priority,revision,filename,url,lines,title,category,comment,additional${EOL}`,
          );
        },
        handleData: (outputFile: string, row: CsvEntry): CsvEntry => {
          row.comment = escapeEndOfLineForCsv(row.comment);

          this.includeCodeSelection ? (row.code = this.getCodeForFile(row.filename, row.lines)) : delete row.code;
          // cut the description (100 chars max) along with '...' at the end
          const descShort = row.comment.length > 100 ? `${row.comment.substring(0, 100)}...` : row.comment;
          // use the title when provided but max 255 characters (as GitLab supports this length for titles), otherwise use the shortened description
          const title = row.title ? row.title.substring(0, 255) : descShort;

          const fileRow = row.url ? `* file: [${row.filename}|${row.url}]${EOL}` : `${row.filename}${EOL}`;
          const linesRow = `* lines: ${row.lines}${EOL}`;
          const revRow = row.revision ? `* SHA: ${row.revision}${EOL}${EOL}` : '';
          const categorySection = `h2. Category${EOL}${row.category}${EOL}${EOL}`;
          const commentSection = `h2. Comment${EOL}${row.comment}${EOL}`;
          const additional = row.additional ? `h2. Additional information${EOL}${row.additional}${EOL}` : '';
          const code = row.code ? `${EOL}h2. Source Code${EOL}${EOL}{code}${EOL}${row.code}{code}${EOL}` : '';

          const description = `h2. Affected${EOL}${fileRow}${linesRow}${revRow}${categorySection}${commentSection}${EOL}${additional}${code}`;

          fs.appendFileSync(
            outputFile,
            `"[code review] ${title}","${description}","${this.priorityName(row.priority)}","${row.revision}","${
              row.filename
            }","${row.url}","${row.lines}","${row.title}","${row.category}","${row.comment}","${row.additional}"${EOL}`,
          );
          return row;
        },
        handleEnd: (outputFile: string, _rows: CsvEntry[]) => {
          window.showInformationMessage(`JIRA importable file: '${outputFile}' successfully created.`);
        },
      },
    ],
    [
      'json',
      {
        fileExtension: 'json',
        storeOutside: true,
        writeFileHeader: (_outputFile: string) => {
          return;
        },
        handleData: (_outputFile: string, row: CsvEntry): CsvEntry => {
          this.includeCodeSelection ? (row.code = this.getCodeForFile(row.filename, row.lines)) : delete row.code;
          return row;
        },
        handleEnd: (outputFile: string, rows: CsvEntry[]) => {
          fs.writeFileSync(outputFile, JSON.stringify(rows, null, 2));
          window.showInformationMessage(`GitHub importable CSV file: '${outputFile}' successfully created.`);
        },
      },
    ],
  ]);

  /**
   * for trying out: https://stackblitz.com/edit/code-review-template
   */
  constructor(private context: ExtensionContext, private workspaceRoot: string, private generator: FileGenerator) {
    const configFileName = workspace.getConfiguration().get('code-review.filename') as string;
    if (configFileName) {
      this.defaultFileName = configFileName;
    }
    let groupByConfig = workspace.getConfiguration().get('code-review.groupBy') as string;
    if (!groupByConfig || groupByConfig === '-') {
      groupByConfig = Group.filename;
    }
    this.groupBy = groupByConfig as GroupBy;
    this.includeCodeSelection = workspace.getConfiguration().get('code-review.reportWithCodeSelection') as boolean;
    this.includePrivateComments = workspace.getConfiguration().get('code-review.reportWithPrivateComments') as boolean;
    this.privateCommentIcon = workspace.getConfiguration().get('code-review.privateCommentIcon') as string;

    this.filterByCommit = workspace.getConfiguration().get('code-review.filterCommentsByCommit') as boolean;
    this.setFilterByCommit(this.filterByCommit);

    this.filterByFilename = workspace.getConfiguration().get('code-review.filterCommentsByFilename') as boolean;
    this.setFilterByFilename(this.filterByFilename, true);
  }

  get basePath(): string {
    return toAbsolutePath(this.workspaceRoot, this.defaultFileName);
  }

  get inputFile(): string {
    return `${this.basePath}.csv`;
  }

  /**
   * generic export method
   * @param format the format that's exported
   */
  exportForFormat(format: ExportFormat, template?: Uri) {
    const exporter = this.exportHandlerMap.get(format);
    const outputFile = `${this.basePath}.${exporter?.fileExtension}`;
    exporter?.writeFileHeader(outputFile);

    const data: CsvEntry[] = [];
    parseFile(this.inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', this.handleError)
      .on('data', (comment: CsvEntry) => {
        comment = CsvStructure.finalizeParse(comment);

        if (this.isCommentEligible(comment)) {
          if (this.includePrivateComments || comment.private === 0) {
            if (exporter?.storeOutside) {
              const tmp = exporter.handleData(outputFile, comment);
              data.push(tmp);
            }
            exporter?.handleData(outputFile, comment);
          }
        }
      })
      .on('end', (_rows: number) => {
        return exporter?.handleEnd(outputFile, exporter?.storeOutside ? data : [], template);
      });
  }

  /**
   * get the comments as CommentListEntry for VSCode view
   */
  getComments(commentGroupedInFile: CommentListEntry): Thenable<CommentListEntry[]> {
    let entries = commentGroupedInFile.data.lines
      .filter((entry: CsvEntry) => this.isCommentEligible(entry))
      .map((entry: CsvEntry) => {
        entry = CsvStructure.finalizeParse(entry);
        (entry as Model).location = parseLocation(entry.lines);

        return entry;
      });

    entries.sort(compare);
    const result = entries.map((entry: Model) => {
      const item = new CommentListEntry(
        entry.id,
        entry.title,
        entry.comment,
        entry.comment,
        TreeItemCollapsibleState.None,
        commentGroupedInFile.data,
        entry.priority,
        entry.private,
      );
      item.contextValue = 'comment';
      item.command = {
        command: 'codeReview.openSelection',
        title: 'Open comment',
        arguments: [commentGroupedInFile.data, entry],
      };
      item.iconPath = this.getIcon(entry.priority, entry.private);

      return item;
    });

    return Promise.resolve(result);
  }

  private getIcon(prio: number, priv: number): { light: string; dark: string } | ThemeIcon {
    switch (priv) {
      default: {
        // Public comments
        let icon = '';
        switch (prio) {
          case 3:
            icon = 'red.svg';
            break;
          case 2:
            icon = 'yellow.svg';
            break;
          case 1:
            icon = 'green.svg';
            break;
          default:
            icon = 'unset.svg';
            break;
        }

        const iPath = this.context.asAbsolutePath(path.join('dist', icon));
        return { light: iPath, dark: iPath };
      }

      case 1: {
        return new ThemeIcon(this.privateCommentIcon, themeColorForPriority(prio));
      }
    }
  }

  public getFilesContainingComments(): Thenable<CommentListEntry[]> {
    if (!fs.existsSync(this.inputFile) || !this.generator.check()) {
      return Promise.resolve([]);
    }

    const entries: CsvEntry[] = [];

    return new Promise((resolve) => {
      parseFile(this.inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
        .on('error', () => this.handleError)
        .on('data', (row: CsvEntry) => {
          if (this.isCommentEligible(row)) {
            entries.push(row);
          }
        })
        .on('end', () => {
          const sortedByFile = this.groupResults(entries, Group.filename);
          const listEntries = sortedByFile.map((el: ReviewFileExportSection, index: number) => {
            const item = new CommentListEntry(
              '',
              el.group,
              `(${el.lines.length})`,
              `${el.lines.length} comments`,
              // Expand the first (and only) file when in filtered by filename mode
              this.filterByFilename && index === 0
                ? TreeItemCollapsibleState.Expanded
                : TreeItemCollapsibleState.Collapsed,
              el,
            );
            item.command = {
              command: 'codeReview.openSelection',
              title: 'reveal comment',
              arguments: [el],
            };
            item.contextValue = 'file';
            item.iconPath = {
              light: this.context.asAbsolutePath(path.join('dist', 'document-light.svg')),
              dark: this.context.asAbsolutePath(path.join('dist', 'document-dark.svg')),
            };

            return item;
          });

          resolve(listEntries);
        });
    });
  }

  private handleError(error: unknown) {
    console.error(error);
  }

  private groupResults(rows: CsvEntry[], groupAttribute: GroupBy): ReviewFileExportSection[] {
    const reviewExportData: ReviewFileExportSection[] = [];

    rows.forEach((row) => {
      row.category = row.category || 'Other';
      // sort when multiple line selection are related to one comment
      // e.g. '23:4-45:2|12:3-15:6|18:1-19:40' becomes: '12:3-15:6|18:1-19:40|23:4-45:2'
      row.lines = splitStringDefinition(row.lines).sort(sortLineSelections).join('|');
      const match = reviewExportData.find((fileRef) => fileRef.group === row[groupAttribute]);
      if (match) {
        match.lines.push(row);
      } else {
        reviewExportData.push({
          group: row[groupAttribute].toString(),
          lines: [row],
        });
      }
    });
    return reviewExportData;
  }

  private getCodeForFile(filename: string, lines: string): string {
    if (!filename) {
      filename = '';
    }
    if (!lines) {
      lines = '';
    }
    let result = '';
    const lineRanges = splitStringDefinition(lines); // split: 2:2-12:2|8:0-18:5
    const filePath = toAbsolutePath(this.workspaceRoot, filename);
    if (lineRanges) {
      lineRanges.forEach((rangeString: string) => {
        if (rangeString) {
          const range = rangeFromStringDefinition(rangeString, 1);
          const fileContent = stripIndent(getFileContentForRange(filePath, range));
          if (result) {
            result = `${result}${EOL}...${EOL}${EOL}${fileContent}`;
          } else {
            result = fileContent;
          }
        }
      });
    }
    return encode(result);
  }

  private priorityName(priority: number) {
    const priorityMap = workspace.getConfiguration().get('code-review.priorities') as string[];
    return priorityMap[priority];
  }

  private showPreview(outputFile: string) {
    const panel = window.createWebviewPanel('text', 'Code Review HTML Report', ViewColumn.Beside, {
      enableScripts: true,
    });
    panel.webview.html = fs.readFileSync(outputFile, 'utf8');
  }

  /**
   * Refresh comments filtering state
   */
  public refreshFilterByCommit() {
    this.setFilterByCommit(this.filterByCommit);
  }

  /**
   * Enable/Disable filtering comments by commit
   * @param state The state of the filter
   * @returns The new state of the filter
   */
  public setFilterByCommit(state: boolean): boolean {
    this.filterByCommit = state;
    if (this.filterByCommit) {
      gitRevision('.', this.workspaceRoot).then(
        (revision: string) => {
          this.currentCommitId = revision;
        },
        (error: string) => {
          this.filterByCommit = false;
          this.currentCommitId = null;

          console.log('Not in a git repository. Disabling filter by commit.', error);
        },
      );
    } else {
      this.currentCommitId = null;
    }

    commands.executeCommand('setContext', 'isFilteredByCommit', this.filterByCommit);

    return this.filterByCommit;
  }

  /**
   * Refresh comments filtering state
   * @returns True if the state changed, False otherwise
   */
  public refreshFilterByFilename(): boolean {
    return this.setFilterByFilename(this.filterByFilename);
  }

  /**
   * Enable/Disable filtering comments by filename
   * @param state The state of the filter
   * @param force Force the state change, even if it was already correctly set
   * @returns True if the state changed, False otherwise
   */
  public setFilterByFilename(state: boolean, force: boolean = false): boolean {
    let changedState = this.filterByFilename !== state || force;
    this.filterByFilename = state;
    let changedFile = false;

    if (this.filterByFilename) {
      let filename = window.activeTextEditor?.document.fileName;
      if (filename) {
        filename = relativeToWorkspace(this.workspaceRoot, filename);
        if (this.currentFilename !== filename) {
          changedFile = true;
          this.currentFilename = filename;
        }
      }
    } else {
      this.currentFilename = null;
    }

    if (changedState) {
      commands.executeCommand('setContext', 'isFilteredByFilename', this.filterByFilename);
    }

    return changedState || changedFile;
  }
}
