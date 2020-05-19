import * as fs from 'fs';
import { workspace } from 'vscode';
import { parseFile } from '@fast-csv/parse';
import { toAbsolutePath } from './utils/workspace-util';
import { CsvEntry, ReviewFileExportSection, ReviewForLineInFile } from './interfaces';

export class HtmlExporter {
  private defaultFileName = 'code-review';
  private style = '';

  constructor(private workspaceRoot: string) {
    const configFileName = workspace.getConfiguration().get('code-review.filename') as string;
    if (configFileName) {
      this.defaultFileName = configFileName;
    }
  }
  export() {
    const reviewExportData: ReviewFileExportSection = {};
    const inputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.csv`;
    const outputFile = `${toAbsolutePath(this.workspaceRoot, this.defaultFileName)}.html`;
    parseFile(inputFile, { delimiter: ',', ignoreEmpty: true, headers: true })
      .on('error', (error) => console.error(error))
      .on('data', (row: CsvEntry) => {
        const entyData: ReviewForLineInFile = row;
        if (!reviewExportData[row.filename]) {
          reviewExportData[row.filename] = {};
        }
        if (!reviewExportData[row.filename][row.lines]) {
          reviewExportData[row.filename][row.lines] = [];
        }
        reviewExportData[row.filename][row.lines].push(entyData);
      })
      .on('end', (rowCount: number) => {
        console.log(`Parsed ${rowCount} rows`);
        console.log(`Result:`, reviewExportData);
        // see: https://stackblitz.com/edit/code-review-template
        const firstPart = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Code Review</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <style>
    ${this.style}
  </style>
</head>
<body>
  <h1 class="main-headline">Code Review</h1>`;
        let middlePart = '';

        for (var filename in reviewExportData) {
          middlePart = `${middlePart}
  <section class="file-section">
    <h2 class="file-section-headline">${filename}</h2>`;

          for (var lines in reviewExportData[filename]) {
            middlePart = `${middlePart}
    <h3 class="lines-headline">${lines}</h3>`;

            reviewExportData[filename][lines].forEach((data) => {
              middlePart = `${middlePart}
    <table class="review-table">
      <tr class="row-priority">
        <td class="caption">Priority</td>
        <td class="text">${data.priority}</td>
      </tr>
      <tr class="row-title">
        <td class="caption">Title</td>
        <td class="text">${data.title}</td>
      </tr>
      <tr class="row-description">
        <td class="caption">Description</td>
        <td class="text">${data.comment}</td>
      </tr>
      <tr class="row-additional">
        <td class="caption">Additional Info</td>
        <td class="text">${data.additional}</td>
      </tr>
      <tr class="row-sha">
        <td class="caption">SHA</td>
        <td class="text">${data.sha}</td>
      </tr>
    </table>`;
            });
          }

          middlePart = `${middlePart}
  </section>`;
        }

        const lastPart = `
</body>
</html>
`;
        const htmlOut = firstPart + middlePart + lastPart;
        fs.writeFileSync(outputFile, new Buffer(htmlOut));
      });
  }
}
