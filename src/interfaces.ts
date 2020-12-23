import { Uri } from 'vscode';
import { CsvEntry } from './model';

export interface CodeReviewConfig {
  filename: string;
}

export interface ReviewFileExportSection {
  group: string;
  lines: CsvEntry[];
}

export enum Group {
  category = 'category',
  priority = 'priority',
  filename = 'filename',
}
export type GroupBy = keyof Pick<CsvEntry, Group.category | Group.priority | Group.filename>;

export interface ExportMap {
  /**
   * define the file extension name
   */
  fileExtension: string;
  /**
   * define weather lines of the input files will be processed externally or returned for the result in a modified way
   * E.g. CSV export needs not to be processed as a whole, they can just be appended line by line.
   * But JSON and HTML files needs to be processed outside (lines will be stored in a temp variable)
   */
  storeOutside: boolean;
  /**
   * write the first line in a file (e.g. headers for CSV files)
   * @param outputFile the filename/path to the target file
   */
  writeFileHeader(outputFile: string): void;
  /**
   * Handle a row read from the file
   * @param outputFile the filename/path to the target file
   * @param row the current row data to be processed
   */
  handleData(outputFile: string, row: CsvEntry): CsvEntry;
  /**
   * Handle when the file end has been reached
   * @param outputFile the filename/path to the target file
   * @param rows all rows of the file
   */
  handleEnd(outputFile: string, rows: CsvEntry[], template?: Uri): void;
}

export type ExportFormat = 'html' | 'gitlab' | 'github' | 'jira' | 'json';
