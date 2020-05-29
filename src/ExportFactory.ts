import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import { workspace, Uri, window, ViewColumn } from 'vscode';
import { parseFile } from '@fast-csv/parse';
import { toAbsolutePath } from './utils/workspace-util';
import { CsvEntry, ReviewFileExportSection } from './interfaces';
import { EOL } from 'os';

export class ExportFactory {
  private defaultFileName = 'code-review';
  private groupBy: null | keyof Pick<CsvEntry, 'category' | 'priority'> = null;
  /**
   * for trying out: https://stackblitz.com/edit/code-review-template
   */
  private hbsDefaultTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Code Review</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* basic style */
    body {
      font-family: Helvetica;
    }
    h1 {
      font-size: 24px;
    }
    h2 {
      font-size: 20px;
      color: green;
    }
    h3 {
      font-size: 16px;
    }
    p {
      white-space: pre-wrap;
    }

    /* links in headlines */
    h3.lines-headline {
      padding-left: 5px;
      margin-bottom: 5px;
    }
    h3.lines-headline > a {
      color: #005bbb;
      text-decoration: none;
    }
    h3.lines-headline > a:hover {
      text-decoration: underline;
    }

    /* table style */
    table.review-table {
      font-size: 14px;
      padding-left: 10px;
    }
    table.review-table .caption {
      font-weight: bold;
      vertical-align: top;
    }
    table.review-table tr > td:first-child {
      width: 120px
    }

    /* priority indicator */
    .text > span:before {
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 5px;
      margin-left: -15px;
    }
    .text > span.prio-high:before {
      background: #FF4500;
    }
    .text > span.prio-medium:before {
      background: #FFD700;
    }
    .text > span.prio-low:before {
      background: #9ACD32;
    }
    .text > span.prio-none:before {
      background: #D3D3D3;
    }
  </style>
</head>
<body>
  <h1 class="main-headline">Code Review Results</h1>
  {{#each this as |item|}}
  <section class="file-section">
    <h2 class="file-section-headline">{{item.group}}</h2>
    {{#each item.lines as |line|}}
    <h3 class="lines-headline">
      <a href="{{line.url}}">Position: {{line.lines}}</a>
    </h3>
    <table class="review-table">
      <tr class="row-priority">
        <td class="caption">Priority</td>
        <td class="text">
          <span class="prio-{{line.priority}}">{{line.priority}}</span>
        </td>
      </tr>
      {{#if line.title}}
      <tr class="row-title">
        <td class="caption">Title</td>
        <td class="text">{{line.title}}</td>
      </tr>
      {{/if}}
      {{#if line.category}}
      <tr class="row-category">
        <td class="caption">Category</td>
        <td class="text">{{line.category}}</td>
      </tr>
      {{/if}}
      {{#if line.comment}}
      <tr class="row-description">
        <td class="caption">Description</td>
        <td class="text">
          <p>{{line.comment}}</p>
        </td>
      </tr>
      {{/if}}
      {{#if line.additional}}
      <tr class="row-additional">
        <td class="caption">Additional Info</td>
        <td class="text">{{line.additional}}</td>
      </tr>
      {{/if}}
      {{#if line.sha}}
      <tr class="row-sha">
        <td class="caption">SHA</td>
        <td class="text">{{line.sha}}</td>
      </tr>
      {{/if}}
    </table>
    {{/each}}
  </section>
  {{/each}}
</body>
</html>`;

  constructor(private workspaceRoot: string, private template?: Uri) {
    if (template) {
      const data = fs.readFileSync(template.fsPath, 'utf8');
      if (!data) {
        window.showErrorMessage(`Error when reading the template file: '${template.fsPath}'`);
      }
      this.hbsDefaultTemplate = data;
    }
    const configFileName = workspace.getConfiguration().get('code-review.filename') as string;
    if (configFileName) {
      this.defaultFileName = configFileName;
    }
    let groupByConfig = workspace.getConfiguration().get('code-review.groupBy') as string;
    if (groupByConfig !== '-') {
      this.groupBy = groupByConfig as keyof Pick<CsvEntry, 'category' | 'priority'>;
    }
  }
  exportAsHtml() {
    const rows: CsvEntry[] = [];
    const inputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.csv`;
    const outputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.html`;
    parseFile(inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', (error) => console.error(error))
      .on('data', (row: CsvEntry) => {
        rows.push(row);
      })
      .on('end', (_rowCount: number) => {
        // check if grouping should be applied
        let reviewExportData: ReviewFileExportSection[] = [];

        if (this.groupBy) {
          reviewExportData = this.groupResults(rows, this.groupBy);
        } else {
          reviewExportData = this.groupResults(rows, 'filename');
        }

        console.log(reviewExportData);
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
      .on('error', (error) => console.error(error))
      .on('data', (row: CsvEntry) => {
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

        const description = `${priority}${category}## Affected${EOL}${fileRow}${linesRow}${shaRow}${commentSection}${EOL}${additional}`;

        fs.appendFileSync(outputFile, `"[code review] ${title}","${description}"${EOL}`);
      })
      .on('end', (_rowCount: number) => {
        window.showInformationMessage(`GitLab CSV file: '${outputFile}' successfully created.`);
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
      .on('error', (error) => console.error(error))
      .on('data', (row: CsvEntry) => {
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

        const description = `h2. Affected${EOL}${fileRow}${linesRow}${shaRow}${categorySection}${commentSection}${EOL}${additional}`;

        // JIRA prioritys are the other way around
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
        window.showInformationMessage(`GitLab JIRA file: '${outputFile}' successfully created.`);
      });
  }

  private groupResults(rows: CsvEntry[], groupAttribute: keyof CsvEntry): ReviewFileExportSection[] {
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
    const panel = window.createWebviewPanel('text', 'Code Review HTML Report', { viewColumn: ViewColumn.Beside });
    panel.webview.html = fs.readFileSync(outputFile, 'utf8');
  }
}
