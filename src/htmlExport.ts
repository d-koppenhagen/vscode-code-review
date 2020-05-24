import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import { workspace, Uri, window, ViewColumn } from 'vscode';
import { parseFile } from '@fast-csv/parse';
import { toAbsolutePath } from './utils/workspace-util';
import { CsvEntry, ReviewFileExportSection } from './interfaces';

export class HtmlExporter {
  private defaultFileName = 'code-review';
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
    }
    h3 {
      font-size: 16px;
    }

    /* links in headlines */
    h2 > a {
      color: green;
      text-decoration: none;
    }
    h2 > a:hover {
      text-decoration: underline;
    }
    h3.lines-headline {
      color: #005bbb;
      padding-left: 5px;
      margin-bottom: 5px;
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
    <h2 class="file-section-headline">
      <a href="{{item.url}}">{{item.filename}}</a>
    </h2>
    {{#each item.lines as |line|}}
    <h3 class="lines-headline">Position: {{line.lines}}</h3>
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
      {{#if line.comment}}
      <tr class="row-description">
        <td class="caption">Description</td>
        <td class="text">{{line.comment}}</td>
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
  }
  export() {
    const reviewExportData: ReviewFileExportSection[] = [];
    const inputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.csv`;
    const outputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.html`;
    parseFile(inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', (error) => console.error(error))
      .on('data', (row: CsvEntry) => {
        const matchingFile = reviewExportData.find((fileRef) => fileRef.filename === row.filename);
        switch (row.priority) {
          case '1':
            row.priority = 'low';
            break;
          case '2':
            row.priority = 'medium';
            break;
          case '3':
            row.priority = 'high';
            break;
          default:
            row.priority = 'none';
            break;
        }

        if (matchingFile) {
          matchingFile.lines.push(row);
        } else {
          reviewExportData.push({
            filename: row.filename,
            url: row.url,
            lines: [row],
          });
        }
      })
      .on('end', (_rowCount: number) => {
        const template = Handlebars.compile(this.hbsDefaultTemplate);

        const htmlOut = template(reviewExportData);
        fs.writeFileSync(outputFile, htmlOut);

        window.showInformationMessage(`Code review file: '${outputFile}' successfully created.`);

        this.showPreview(outputFile);
      });
  }

  showPreview(outputFile: string) {
    const panel = window.createWebviewPanel('text', 'Code Review HTML Report', { viewColumn: ViewColumn.Beside });
    panel.webview.html = fs.readFileSync(outputFile, 'utf8');
  }
}
