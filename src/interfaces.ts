export interface CodeReviewConfig {
  filename: string;
}

export interface ReviewComment {
  title?: string;
  description: string;
  priority?: number;
  additional?: string;
  category?: string;
}

export interface CsvEntry {
  sha: string;
  filename: string;
  url: string;
  lines: string;
  title: string;
  comment: string;
  priority: string;
  category: string;
  additional: string;
}

export interface ReviewFileExportSection {
  group: string;
  lines: CsvEntry[];
}
