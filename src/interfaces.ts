import { InputBoxOptions } from 'vscode';

export interface VSCodeWindow {
  showErrorMessage(message: string): Thenable<string>;
  showInformationMessage(message: string): Thenable<string>;
  showInputBox(options?: InputBoxOptions): Thenable<string | undefined>;
}

export interface CodeReviewConfig {
  filename: string;
}

export interface ReviewComment {
  title?: string;
  description: string;
  priority?: number;
  additional?: string;
}

export interface CsvEntry {
  sha: string;
  filename: string;
  url: string;
  lines: string;
  title: string;
  comment: string;
  priority: string;
  additional: string;
}

export interface ReviewFileExportSection {
  filename: string;
  url: string;
  lines: {
    sha: string;
    filename: string;
    url: string;
    lines: string;
    title: string;
    comment: string;
    priority: string;
    additional: string;
  }[];
}
