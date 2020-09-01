import * as fs from 'fs';
import { EOL } from 'os';
import { workspace, window } from 'vscode';

import { toAbsolutePath, getCsvFileHeader } from './utils/workspace-util';

export class FileGenerator {
  private readonly defaultFileExtension = '.csv';
  private defaultFileName = 'code-review';
  private csvFileHeader = 'sha,filename,url,lines,title,comment,priority,category,additional';

  constructor(private workspaceRoot: string) {
    const configFileName = workspace.getConfiguration().get('code-review.filename') as string;
    if (configFileName) {
      this.defaultFileName = configFileName;
    }
  }

  get reviewFileName(): string {
    return `${this.defaultFileName}${this.defaultFileExtension}`;
  }

  get reviewFilePath(): string {
    return toAbsolutePath(this.workspaceRoot, this.reviewFileName);
  }

  /**
   * Try to create the code review file if not already exist
   */
  create() {
    if (fs.existsSync(this.reviewFilePath)) {
      const lineContent = getCsvFileHeader(this.reviewFilePath);
      if (lineContent !== this.csvFileHeader) {
        window.showErrorMessage(
          `CSV header "${lineContent}" is not matching "${this.csvFileHeader}" format. Please adjust it manually`,
        );
      }
      return;
    }

    try {
      fs.writeFileSync(this.reviewFilePath, `${this.csvFileHeader}${EOL}`);
      window.showInformationMessage(
        `Code review file: '${this.defaultFileName}${this.defaultFileExtension}' successfully created.`,
      );
    } catch (err) {
      window.showErrorMessage(`Error when trying to create code review file: '${this.reviewFilePath}': ${err}`);
    }
  }

  /**
   * not really using anything that needs to be disposed of, but
   * including in case we need to use in a future update
   */
  dispose() {}
}
