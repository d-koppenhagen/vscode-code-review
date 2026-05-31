import * as fs from 'fs';
import {
  CancellationToken,
  FileSystemWatcher,
  Hover,
  HoverProvider,
  MarkdownString,
  Position,
  ProviderResult,
  TextDocument,
  workspace,
} from 'vscode';
import { CsvEntry, CsvStructure } from './model';
import { rangesFromStringDefinition, standardizeFilename } from './utils/workspace-util';
import { parseFile } from '@fast-csv/parse';

export class AnnotationHoverProvider implements HoverProvider {
  private cache: Map<string, CsvEntry[]> = new Map();
  private watcher: FileSystemWatcher;

  constructor(private reviewFile: string, private workspaceRoot: string) {
    this.reload();

    this.watcher = workspace.createFileSystemWatcher(reviewFile);
    this.watcher.onDidChange(() => this.reload());
    this.watcher.onDidCreate(() => this.reload());
  }

  reload(): void {
    if (!fs.existsSync(this.reviewFile)) {
      this.cache.clear();
      return;
    }

    const byFile = new Map<string, CsvEntry[]>();
    parseFile(this.reviewFile, {
      delimiter: ',',
      ignoreEmpty: true,
      headers: true,
    })
      .on('error', () => {})
      .on('data', (row: CsvEntry) => {
        const entry = CsvStructure.finalizeParse(row);
        const existing = byFile.get(entry.filename) ?? [];
        existing.push(entry);
        byFile.set(entry.filename, existing);
      })
      .on('end', () => {
        this.cache = byFile;
      });
  }

  dispose(): void {
    this.watcher.dispose();
  }

  provideHover(document: TextDocument, position: Position, _token: CancellationToken): ProviderResult<Hover> {
    const filename = standardizeFilename(this.workspaceRoot, document.fileName);
    const entries = this.cache.get(filename);
    if (!entries) return undefined;

    for (const entry of entries) {
      try {
        if (!CsvStructure.isValidComment(entry, this.workspaceRoot)) continue;

        const ranges = rangesFromStringDefinition(entry.lines);
        for (const range of ranges) {
          const iconLine = range.end.line;
          const iconChar = range.end.character;
          if (position.line === iconLine && position.character >= iconChar - 1 && position.character <= iconChar + 2) {
            const markdown = new MarkdownString();
            const statusLabel = entry.resolved ? ' ✅ Resolved' : '';
            markdown.appendMarkdown('---\n**\u{1F4AC} ' + (entry.title || 'Comment') + '**' + statusLabel + '\n\n');
            markdown.appendMarkdown('> ' + entry.comment.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&') + '\n\n---\n');
            if (entry.priority) {
              markdown.appendMarkdown('*Priority:* `' + ['', 'low', 'medium', 'high'][entry.priority] + '`  \n');
            }
            if (entry.category) {
              markdown.appendMarkdown('*Category:* `' + entry.category + '`  \n');
            }
            markdown.isTrusted = true;
            return new Hover(markdown, range);
          }
        }
      } catch {
        // skip malformed entries
      }
    }

    return undefined;
  }
}
