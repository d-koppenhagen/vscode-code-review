import * as fs from 'fs';
import * as path from 'path';
const Handlebars = require('handlebars');
const stripIndent = require('strip-indent');
import { workspace, Uri, window, ViewColumn, ExtensionContext } from 'vscode';
const parseFile = require('@fast-csv/parse').parseFile;
import { EOL } from 'os';
import { Base64 } from 'js-base64';

import { toAbsolutePath, getFileContentForRange } from './utils/workspace-util';
import { CsvEntry, ReviewFileExportSection, GroupBy } from './interfaces';

export class ExportFactory {
  private defaultFileName = 'code-review';
  private groupBy: GroupBy;
  private includeCodeSelection = false;
  private hbsDefaultTemplate = '';
  /**
   * for trying out: https://stackblitz.com/edit/code-review-template
   */
  constructor(private context: ExtensionContext, private workspaceRoot: string, template?: Uri) {
    if (!template || !template.fsPath) {
      const foo = context.asAbsolutePath(path.join('dist', 'template.default.hbs'));
      template = Uri.parse(foo);
    }
    const data = fs.readFileSync(template.fsPath, 'utf8');
    if (!data) {
      window.showErrorMessage(`Error when reading the template file: '${template.fsPath}'`);
    }
    this.hbsDefaultTemplate = data;

    const configFileName = workspace.getConfiguration().get('code-review.filename') as string;
    if (configFileName) {
      this.defaultFileName = configFileName;
    }
    let groupByConfig = workspace.getConfiguration().get('code-review.groupBy') as string;
    if (!groupByConfig || groupByConfig === '-') {
      groupByConfig = 'filename';
    }
    this.groupBy = groupByConfig as GroupBy;
    this.includeCodeSelection = workspace.getConfiguration().get('code-review.reportWithCodeSelection') as boolean;
  }
  exportAsHtml() {
    const rows: CsvEntry[] = [];
    const inputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.csv`;
    const outputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.html`;
    parseFile(inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', (error: any) => console.error(error))
      .on('data', (row: CsvEntry) => {
        row.code = this.includeCodeSelection ? this.getCodeForFile(row.filename, row.lines) : '';
        rows.push(row);
      })
      .on('end', (_rowCount: number) => {
        // check if grouping should be applied
        let reviewExportData: ReviewFileExportSection[] = [];

        reviewExportData = this.groupResults(rows, this.groupBy);

        const template = Handlebars.compile(this.hbsDefaultTemplate);

        const htmlOut = template(reviewExportData);
        fs.writeFileSync(outputFile, htmlOut);

        window.showInformationMessage(`Code review file: '${outputFile}' successfully created.`);

        this.showPreview(outputFile);
      });
  }

  exportAsGitLabCsv() {
    const inputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.csv`;
    const outputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.gitlab.csv`;

    fs.writeFileSync(outputFile, `title,description${EOL}`);

    parseFile(inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', (error: any) => console.error(error))
      .on('data', (row: CsvEntry) => {
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
      })
      .on('end', (_rowCount: number) => {
        window.showInformationMessage(`GitLab importable CSV file: '${outputFile}' successfully created.`);
      });
  }

  exportAsGitHubCsv() {
    const inputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.csv`;
    const outputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.github.csv`;

    fs.writeFileSync(outputFile, `title,description,labels,state,assignee${EOL}`);

    parseFile(inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', (error: any) => console.error(error))
      .on('data', (row: CsvEntry) => {
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
      })
      .on('end', (_rowCount: number) => {
        window.showInformationMessage(`GitHub importable CSV file: '${outputFile}' successfully created.`);
      });
  }

  exportAsJiraCsv() {
    const inputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.csv`;
    const outputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.jira.csv`;

    fs.writeFileSync(
      outputFile,
      `Summary,Description,Priority,sha,filename,url,lines,title,category,comment,additional${EOL}`,
    );

    parseFile(inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', (error: any) => console.error(error))
      .on('data', (row: CsvEntry) => {
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
      })
      .on('end', (_rowCount: number) => {
        window.showInformationMessage(`JIRA importable file: '${outputFile}' successfully created.`);
      });
  }

  exportAsJson() {
    const inputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.csv`;
    const outputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.json`;

    const data: CsvEntry[] = [];

    parseFile(inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', (error: any) => console.error(error))
      .on('data', (row: CsvEntry) => {
        this.includeCodeSelection ? (row.code = this.getCodeForFile(row.filename, row.lines)) : delete row.code;
        data.push(row);
      })
      .on('end', (_rowCount: number) => {
        fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
        window.showInformationMessage(`GitLab CSV file: '${outputFile}' successfully created.`);
      });
  }

  private groupResults(rows: CsvEntry[], groupAttribute: GroupBy): ReviewFileExportSection[] {
    const reviewExportData: ReviewFileExportSection[] = [];

    rows.forEach((row) => {
      row.priority = this.priorityName(row.priority);
      row.category = row.category || 'Other';
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
    switch (priority) {
      case '1':
        return 'low';
      case '2':
        return 'medium';
      case '3':
        return 'high';
      default:
        return 'none';
    }
  }

  private showPreview(outputFile: string) {
    const panel = window.createWebviewPanel('text', 'Code Review HTML Report', ViewColumn.Beside, {
      enableScripts: true,
    });
    panel.webview.html = fs.readFileSync(outputFile, 'utf8');
  }
}
