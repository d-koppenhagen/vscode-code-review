import * as fs from 'fs';
import * as path from 'path';
import { escapeDoubleQuotesForCsv, escapeEndOfLineForCsv, unescapeEndOfLineFromCsv } from './utils/workspace-util';
const { v4: uuidv4, validate: uuidValidate } = require('uuid');

// See detailed instructions in model.md

/**
 * Comment structure
 *
 * **Attention!**
 * For every stored property added:
 * 1. Append it to CsvStructure.headers array.
 * 2. Add an entry to CsvStructure.defaults.
 * 3. Add an entry to CsvStructure.serializers (optional).
 * 4. Update createCommentFromObject() (optional).
 */
export interface CsvEntry {
  revision: string;
  filename: string;
  url: string;
  lines: string;
  title: string;
  comment: string;
  priority: number;
  category: string;
  additional: string;
  code?: string;
  /** Unique identifier of the entry */
  id: string;
  /** Private state of the entry
   * 0 = public
   * 1 = private
   */
  private: number;
}

/**
 * Create a CsvEntry instance from an object
 *
 * **Attention!**
 * Every new property of CsvEntry to be stored might require initialization in this function.
 *
 * @param object The object (JSON)
 * @return CsvEntry
 */
export function createCommentFromObject(object: any | CsvEntry): CsvEntry {
  if (typeof object !== 'string') {
    object = JSON.stringify(object);
  }
  const comment = JSON.parse(object) as CsvEntry;
  comment.id = CsvStructure.getDefaultValue('id')!;
  return comment;
}

/**
 * CSV file storage helpers
 */
export class CsvStructure {
  public static readonly separator = ',';
  /**
   * Columns stored in the CSV file
   *
   * **Attention!**
   * - Every new property of CsvEntry to be stored must be added to the end of the array.
   * - A deprecated stored property can't be removed from the array.
   */
  private static readonly headers: string[] = [
    'revision',
    'filename',
    'url',
    'lines',
    'title',
    'comment',
    'priority',
    'category',
    'additional',
    'id',
    'private',
  ];

  /**
   * Map of default property values builders
   *
   * **Attention!**
   * Any stored property added to CsvEntry **must** have a corresponding entry in this map.
   */
  private static readonly defaults: Map<string, () => any> = new Map([
    ['id', () => uuidv4()],
    ['private', () => 0],
  ]);

  /**
   * Map of transformations to apply before storage
   *
   * **Attention!**
   * Any stored property added to CsvEntry **may** have a corresponding entry in this map.
   */
  private static readonly serializers: Map<string, (value: any) => any> = new Map([
    ['comment', (comment: any) => (comment ? escapeEndOfLineForCsv(escapeDoubleQuotesForCsv(comment)) : '')],
    ['title', (title: any) => (title ? escapeDoubleQuotesForCsv(title) : '')],
    ['priority', (priority: any) => priority || 0],
    ['additional', (additional: any) => (additional ? escapeDoubleQuotesForCsv(additional) : '')],
    ['category', (category: any) => category || ''],
    ['private', (priv: any) => priv || 0],
  ]);

  /**
   * Verify if a comment is valid
   *
   * @param comment The comment to evaluate
   * @param workspaceRoot The root folder of the workspace
   * @return true if the comment is valid, false otherwise
   */
  public static isValidComment(comment: CsvEntry, workspaceRoot: string | undefined = undefined): boolean {
    let isValid =
      comment &&
      (comment['comment']?.length ?? 0) > 0 &&
      (comment['filename']?.length ?? 0) > 0 &&
      (comment['lines']?.match(/^(\d+:\d+-\d+:\d+)(\|(\d+:\d+-\d+:\d+))*$/gm) ?? false) &&
      uuidValidate(comment['id'] ?? '');

    if (isValid && workspaceRoot) {
      const filename = path.join(workspaceRoot, comment['filename']);
      isValid &&= fs.existsSync(filename);
    }

    return isValid;
  }

  /**
   * Get the header of a CSV file
   */
  public static get headerLine(): string {
    return CsvStructure.headers.join(CsvStructure.separator);
  }

  /**
   * Get the default value of a stored column
   *
   * @param column The name of the column
   * @return string The default value
   */
  public static getDefaultValue(column: string): string | undefined {
    return CsvStructure.defaults.get(column)?.();
  }

  /**
   * Convert a comment to a CSV line
   *
   * @param comment The comment ot convert
   * @return string The CSV line
   */
  public static formatAsCsvLine(comment: CsvEntry): string {
    const dict = JSON.parse(JSON.stringify(comment));

    let columns: string[] = [];
    // Pick the comment properties values in the order of the columns
    for (const property of CsvStructure.headers) {
      let value = dict[property];
      value = CsvStructure.serializers.get(property)?.(dict[property]) ?? value;
      columns.push(`"${value ?? ''}"`);
    }

    return columns.join(CsvStructure.separator);
  }

  /**
   * Finalize the parsing of a comment (after being loaded)
   *
   * @param comment The comment to finalize
   * @return The finalized comment
   */
  public static finalizeParse(comment: CsvEntry): CsvEntry {
    comment.comment = unescapeEndOfLineFromCsv(comment.comment);
    comment.priority = Number(comment.priority);
    comment.private = Number(comment.private);

    return comment;
  }
}
