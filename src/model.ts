const { v4: uuidv4 } = require('uuid');

// See detailed instructions in model.md

/**
 * Comment structure
 *
 * **Attention!**
 * For every stored property added:
 * 1. Append it to CsvStructure.headers array.
 * 2. Add an entry to CsvStructure.defaults.
 * 3. Update createCommentFromObject() (optional).
 */
export interface CsvEntry {
  sha: string;
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
export function createCommentFromObject(object: any): CsvEntry {
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
    'sha',
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
   * Any stored property added to CsvEntry must have a corresponding entry in this map.
   */
  private static readonly defaults: Map<string, () => any> = new Map([
    ['id', () => uuidv4()],
    ['private', () => 0],
  ]);

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
      columns.push(`"${dict[property] ?? ''}"`);
    }

    return columns.join(CsvStructure.separator);
  }
}
