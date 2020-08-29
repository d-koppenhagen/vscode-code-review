import * as fs from 'fs';
const Handlebars = require('handlebars');
const stripIndent = require('strip-indent');
import { workspace, Uri, window, ViewColumn } from 'vscode';
const parseFile = require('@fast-csv/parse').parseFile;
import { EOL } from 'os';
import { Base64 } from 'js-base64';

import {
  toAbsolutePath,
  getFileContentForRange,
  sortCsvEntryForLines,
  sortLineSelections,
} from './utils/workspace-util';
import { CsvEntry, ReviewFileExportSection, GroupBy, ExportFormat, ExportMap, Group } from './interfaces';

export class ExportFactory {
  private defaultFileName = 'code-review';
  private groupBy: GroupBy;
  private includeCodeSelection = false;

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
          Handlebars.registerHelper('codeBlock', (code: string) => Base64.decode(code));
          // compile template after helper is registered
          const templateCompiled = Handlebars.compile(templateData);
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
          this.includeCodeSelection ? (row.code = this.getCodeForFile(row.filename, row.lines)) : delete row.code;
          // cut the description (100 chars max) along with '...' at the end
          const descShort = row.comment.length > 100 ? `${row.comment.substring(0, 100)}...` : row.comment;
          // use the title when provided but max 255 characters (as GitLab supports this length for titles), otherwise use the shortened description
          const title = row.title ? row.title.substring(0, 255) : descShort;
          const fileRow = row.url ? `- file: [${row.filename}](${row.url})${EOL}` : `${row.filename}${EOL}`;
          const linesRow = `- lines: ${row.lines}${EOL}`;
          const shaRow = row.sha ? `- SHA: ${row.sha}${EOL}${EOL}` : '';
          const commentSection = `## Comment${EOL}${row.comment}${EOL}`;
          const additional = row.additional ? `## Additional information${EOL}${row.additional}${EOL}` : '';
          const priority = row.priority ? `## Priority${EOL}${this.priorityName(row.priority)}${EOL}${EOL}` : '';
          const category = row.category ? `## Category${EOL}${row.category}${EOL}${EOL}` : '';
          const code = row.code ? `${EOL}## Source Code${EOL}${EOL}\`\`\`${EOL}${row.code}\`\`\`${EOL}` : '';
          const description = `${priority}${category}## Affected${EOL}${fileRow}${linesRow}${shaRow}${commentSection}${EOL}${additional}${code}`;
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
          this.includeCodeSelection ? (row.code = this.getCodeForFile(row.filename, row.lines)) : delete row.code;
          // cut the description (100 chars max) along with '...' at the end
          const descShort = row.comment.length > 100 ? `${row.comment.substring(0, 100)}...` : row.comment;
          // use the title when provided but max 255 characters (as GitLab supports this length for titles), otherwise use the shortened description
          const title = row.title ? row.title.substring(0, 255) : descShort;

          const fileRow = row.url ? `- file: [${row.filename}](${row.url})${EOL}` : `${row.filename}${EOL}`;
          const linesRow = `- lines: ${row.lines}${EOL}`;
          const shaRow = row.sha ? `- SHA: ${row.sha}${EOL}${EOL}` : '';
          const commentSection = `## Comment${EOL}${row.comment}${EOL}`;
          const additional = row.additional ? `## Additional information${EOL}${row.additional}${EOL}` : '';
          const priority = row.priority ? `## Priority${EOL}${this.priorityName(row.priority)}${EOL}${EOL}` : '';
          const category = row.category ? `## Category${EOL}${row.category}${EOL}${EOL}` : '';
          const code = row.code ? `${EOL}## Source Code${EOL}${EOL}\`\`\`${EOL}${row.code}\`\`\`${EOL}` : '';

          const description = `${priority}${category}## Affected${EOL}${fileRow}${linesRow}${shaRow}${commentSection}${EOL}${additional}${code}`;

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
            `Summary,Description,Priority,sha,filename,url,lines,title,category,comment,additional${EOL}`,
          );
        },
        handleData: (outputFile: string, row: CsvEntry): CsvEntry => {
          this.includeCodeSelection ? (row.code = this.getCodeForFile(row.filename, row.lines)) : delete row.code;
          // cut the description (100 chars max) along with '...' at the end
          const descShort = row.comment.length > 100 ? `${row.comment.substring(0, 100)}...` : row.comment;
          // use the title when provided but max 255 characters (as GitLab supports this length for titles), otherwise use the shortened description
          const title = row.title ? row.title.substring(0, 255) : descShort;

          const fileRow = row.url ? `* file: [${row.filename}|${row.url}]${EOL}` : `${row.filename}${EOL}`;
          const linesRow = `* lines: ${row.lines}${EOL}`;
          const shaRow = row.sha ? `* SHA: ${row.sha}${EOL}${EOL}` : '';
          const categorySection = `h2. Category${EOL}${row.category}${EOL}${EOL}`;
          const commentSection = `h2. Comment${EOL}${row.comment}${EOL}`;
          const additional = row.additional ? `h2. Additional information${EOL}${row.additional}${EOL}` : '';
          const code = row.code ? `${EOL}h2. Source Code${EOL}${EOL}{code}${EOL}${row.code}{code}${EOL}` : '';

          const description = `h2. Affected${EOL}${fileRow}${linesRow}${shaRow}${categorySection}${commentSection}${EOL}${additional}${code}`;

          // JIRA priorities are the other way around
          let priority = 3;
          switch (row.priority) {
            case '1':
              priority = 3;
              break;
            case '2':
              priority = 2;
              break;
            case '3':
              priority = 1;
              break;
            default:
              priority = 3;
              break;
          }

          fs.appendFileSync(
            outputFile,
            `"[code review] ${title}","${description}","${priority}","${row.sha}","${row.filename}","${row.url}","${row.lines}","${row.title}","${row.category}","${row.comment}","${row.additional}"${EOL}`,
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
  constructor(private workspaceRoot: string) {
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
    const data: CsvEntry[] = [];
    exporter?.writeFileHeader(outputFile);
    parseFile(this.inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', this.handleError)
      .on('data', (row: CsvEntry) => {
        if (exporter?.storeOutside) {
          const tmp = exporter.handleData(outputFile, row);
          data.push(tmp);
        }
        return exporter?.handleData(outputFile, row);
      })
      .on('end', (rows: CsvEntry[]) => {
        return exporter?.handleEnd(outputFile, exporter?.storeOutside ? data : rows, template);
      });
  }

  private handleError(error: unknown) {
    console.error(error);
  }

  private groupResults(rows: CsvEntry[], groupAttribute: GroupBy): ReviewFileExportSection[] {
    const reviewExportData: ReviewFileExportSection[] = [];

    rows.forEach((row) => {
      row.priority = this.priorityName(row.priority);
      row.category = row.category || 'Other';
      // sort when multiple line selection are related to one comment
      // e.g. '23:4-45:2|12:3-15:6|18:1-19:40' becomes: '12:3-15:6|18:1-19:40|23:4-45:2'
      row.lines = row.lines.split('|').sort(sortLineSelections).join('|');
      const match = reviewExportData.find((fileRef) => fileRef.group === row[groupAttribute]);
      if (match) {
        match.lines.push(row);
      } else {
        reviewExportData.push({
          group: row[groupAttribute],
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
    const lineRanges = lines.split('|'); // split: 2:2-12:2|8:0-18:5
    const filePath = toAbsolutePath(this.workspaceRoot, filename);
    if (lineRanges) {
      lineRanges.forEach((range: string) => {
        if (range) {
          const [start, end] = range.split('-'); // split: 2:2-12:2
          const [startLine] = start.split(':'); // split: 2:2
          const [endLine] = end.split(':'); // split: 2:2
          const fileContent = stripIndent(getFileContentForRange(filePath, Number(startLine), Number(endLine)));
          if (result) {
            result = `${result}${EOL}...${EOL}${EOL}${fileContent}`;
          } else {
            result = fileContent;
          }
        }
      });
    }
    return Base64.encode(result);
  }

  private priorityName(priority: string) {
    const priorityMap = workspace.getConfiguration().get('code-review.priorities') as string[];
    switch (priority) {
      case '1':
        return priorityMap[1] || 'low';
      case '2':
        return priorityMap[2] || 'medium';
      case '3':
        return priorityMap[3] || 'high';
      default:
        return priorityMap[0] || 'none';
    }
  }

  private showPreview(outputFile: string) {
    const panel = window.createWebviewPanel('text', 'Code Review HTML Report', ViewColumn.Beside, {
      enableScripts: true,
    });
    panel.webview.html = fs.readFileSync(outputFile, 'utf8');
  }
}
