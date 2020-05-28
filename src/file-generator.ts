import * as fs from 'fs';
import { EOL } from 'os';
import { workspace } from 'vscode';

import { VSCodeWindow } from './interfaces';
import { toAbsolutePath } from './utils/workspace-util';

export class FileGenerator {
  private readonly defaultFileExtension = '.csv';
  private defaultFileName = 'code-review';

  constructor(private workspaceRoot: string, private window: VSCodeWindow) {
    const configFileName = workspace.getConfiguration().get('code-review.filename') as string;
    if (configFileName) {
      this.defaultFileName = configFileName;
    }
  }

  /**
   * leveraging all of the other functions to execute
   * the flow of adding a duck to a project
   */
  execute(): string {
    const fileName = `${this.defaultFileName}${this.defaultFileExtension}`;
    const absoluteFilePath: string = toAbsolutePath(this.workspaceRoot, fileName);
    this.create(absoluteFilePath);
    return absoluteFilePath;
  }

  /**
   * Try to create the code review fiel if not already exist
   * @param absoluteFilePath the absolute file path
   */
  create(absoluteFilePath: string) {
    if (fs.existsSync(absoluteFilePath)) {
      console.log(`File: '${absoluteFilePath}' already exists`);
      return;
    }

    try {
      fs.writeFileSync(absoluteFilePath, `sha,filename,url,lines,title,comment,priority,category,additional${EOL}`);
      this.window.showInformationMessage(
        `Code review file: '${this.defaultFileName}${this.defaultFileExtension}' successfully created.`,
      );
    } catch (err) {
      this.window.showErrorMessage(`Error when trying to create code review file: '${absoluteFilePath}': ${err}`);
    }
  }

  /**
   * not really using anything that needs to be disposed of, but
   * including in case we need to use in a future update
   */
  dispose() {}
}
