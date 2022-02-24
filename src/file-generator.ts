import * as fs from 'fs';
import { EOL } from 'os';
import path from 'path';
import { workspace, window } from 'vscode';
import { CsvStructure } from './model';
import { getCsvFileHeader, getCsvFileLinesAsIterable, setCsvFileContent } from './utils/storage-utils';
import { getBackupFilename, toAbsolutePath } from './utils/workspace-util';

/**
 * Code review file check operations
 */
export enum CheckFlag {
  /** Check the format of the file */
  format = 0x1,
  /** Try to migrate the format of the file */
  migrate = 0x2,
}

export class FileGenerator {
  private readonly defaultFileExtension = 'csv';
  private defaultFileName = 'code-review';

  constructor(private workspaceRoot: string) {
    const configFileName = workspace.getConfiguration().get('code-review.filename') as string;
    if (configFileName) {
      this.defaultFileName = configFileName;
    }
  }

  public get reviewFilePath(): string {
    return FileGenerator.withSuffix(this.defaultFileName, this.defaultFileExtension);
  }

  public get absoluteReviewFilePath(): string {
    if (path.isAbsolute(this.reviewFilePath)) {
      return this.reviewFilePath;
    } else {
      return toAbsolutePath(this.workspaceRoot, this.reviewFilePath);
    }
  }

  public static withSuffix(file: string, suffix: string): string {
    const ext = path.extname(file);
    if (ext === '') {
      return `${file}.${suffix}`;
    }
    if (ext === '.') {
      return `${file}${suffix}`;
    }
    if (ext.toLowerCase() === `.${suffix}`) {
      return file;
    }

    return `${path.basename(file, ext)}.${suffix}`;
  }

  /**
   * Try to create the code review file if not already exist
   *
   * @return boolean true if the file was successfully created, false otherwise
   */
  public create(): boolean {
    if (fs.existsSync(this.absoluteReviewFilePath)) {
      if (!this.check()) {
        return false;
      }
    } else {
      try {
        fs.writeFileSync(this.absoluteReviewFilePath, `${CsvStructure.headerLine}${EOL}`);
        window.showInformationMessage(`Code review file: '${this.absoluteReviewFilePath}' successfully created.`);
      } catch (err) {
        window.showErrorMessage(
          `Error when trying to create code review file: '${this.absoluteReviewFilePath}': ${err}`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Check the content of the code review file
   *
   * @param flags The verifications to perform
   * @return boolean true if the content was successfully checked (and migrated if requested), false otherwise
   */
  public check(flags: CheckFlag = CheckFlag.format): boolean {
    if (!fs.existsSync(this.absoluteReviewFilePath)) {
      return true;
    }

    let result: boolean = true;

    if (flags & CheckFlag.format) {
      result = this.checkFormat();
    }

    if (!result && flags & CheckFlag.migrate) {
      result = this.migrate();
    }

    return result;
  }

  private checkFormat(): boolean {
    const currentHeader = getCsvFileHeader(this.absoluteReviewFilePath);
    return currentHeader === CsvStructure.headerLine;
  }

  /**
   * Migrate the content of the code review file
   *
   * @return boolean true if the migration was successful, false otherwise
   */
  private migrate(): boolean {
    const currentHeader = getCsvFileHeader(this.absoluteReviewFilePath);
    if (currentHeader === CsvStructure.headerLine) {
      return true;
    }

    // Old/New headers must start with the same columns
    if (!CsvStructure.headerLine.startsWith(currentHeader)) {
      window.showErrorMessage(
        `CSV header "${currentHeader ?? ''}" is not matching "${
          CsvStructure.headerLine
        }" format. Please adjust it manually`,
      );

      return false;
    }

    // Deduct missing headers...
    const missingHeaders = CsvStructure.headerLine.substring(currentHeader.length + 1).split(CsvStructure.separator);
    let fileContent = '';
    let isHeader = true;
    // ...And append them to each row of the file...
    for (const line of getCsvFileLinesAsIterable(this.absoluteReviewFilePath)) {
      if (isHeader) {
        fileContent += line + CsvStructure.separator + missingHeaders.join(CsvStructure.separator);
        isHeader = false;
      } else {
        fileContent += line;
        for (const column of missingHeaders) {
          // ...With their respective default values.
          fileContent += `${CsvStructure.separator}"${CsvStructure.getDefaultValue(column) ?? ''}"`;
        }
      }

      fileContent += EOL;
    }

    // Make a copy of the previous file
    fs.renameSync(this.absoluteReviewFilePath, getBackupFilename(this.absoluteReviewFilePath));

    // Persist the file with the new format
    if (!setCsvFileContent(this.absoluteReviewFilePath, fileContent)) {
      window.showErrorMessage(`Error in writing new content to the file "${this.absoluteReviewFilePath}".`);

      return false;
    }

    return true;
  }

  /**
   * not really using anything that needs to be disposed of, but
   * including in case we need to use in a future update
   */
  dispose() {}
}
