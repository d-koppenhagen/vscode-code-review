import * as fs from 'fs';
import { window, workspace } from 'vscode';
import { FileGenerator } from './file-generator';
import { CsvEntry, CsvStructure } from './model';
import { setCsvFileLines } from './utils/storage-utils';
import { getBackupFilename } from './utils/workspace-util';
const parseFile = require('@fast-csv/parse').parseFile;

/**
 * Import comment conflict modes
 */
export enum ConflictMode {
  /** Keep the existing comments */
  skipImported = 'skip',
  /** Replace the existing comments with the imported ones */
  replaceWithImported = 'overwrite',
  /** Keep the existing and imported comments */
  importCopy = 'clone',
}

export class ImportFactory {
  private backupBeforeImport: boolean = true;
  private copySuffix: string | null;

  constructor(private workspaceRoot: string, private reviewFile: string, private generator: FileGenerator) {
    this.backupBeforeImport = workspace.getConfiguration().get('code-review.importBackup') as boolean;
    this.copySuffix = workspace.getConfiguration().get('code-review.importCloneSuffix') as string;
  }

  /**
   * Import comments
   *
   * @param filename The file to load the comments from
   * @param mode The conflict mode
   * @return true if some comments were imported, false otherwise
   */
  public importCommentsFromFile(filename: string, mode: ConflictMode): Thenable<boolean> {
    let comments: CsvEntry[] | undefined;

    try {
      const raw = fs.readFileSync(filename, 'utf8');
      const json = JSON.parse(raw);
      if (json instanceof Array) {
        comments = json.map((item) => item as CsvEntry);
      }
    } catch (error) {
      console.log(error);
    }

    if (!comments) {
      window.showErrorMessage(`Failed to parse the content of the file ${filename}.`);
      return Promise.resolve(false);
    }

    return this.importComments(comments, mode);
  }

  /**
   * Import comments
   *
   * @param comments The comments to import
   * @param mode The conflict mode
   * @return true if some comments were imported, false otherwise
   */
  public importComments(comments: CsvEntry[], mode: ConflictMode): Thenable<boolean> {
    if ((comments?.length ?? 0) === 0) {
      window.showInformationMessage('No comments to import.');
      return Promise.resolve(false);
    }

    if (!this.generator.create()) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      // Read all comments
      const existingComments: CsvEntry[] = [];
      parseFile(this.reviewFile, { delimiter: ',', ignoreEmpty: true, headers: true })
        .on('error', console.log)
        .on('data', (comment: CsvEntry) => {
          existingComments.push(CsvStructure.finalizeParse(comment));
        })
        .on('end', (_count: number) => {
          //#region Merge using import mode

          let addedCount = 0;
          let skipCount = 0;
          let replaceCount = 0;
          let cloneCount = 0;
          let invalidCount = 0;

          for (const comment of comments) {
            if (CsvStructure.isValidComment(comment, this.workspaceRoot)) {
              const existingIdx = existingComments.findIndex((existing) => existing.id === comment.id);
              if (existingIdx < 0) {
                existingComments.push(comment);
                addedCount++;
              } else {
                //#region Apply conflict strategy

                switch (mode) {
                  case ConflictMode.skipImported:
                    skipCount++;
                    break;

                  case ConflictMode.replaceWithImported:
                    existingComments[existingIdx] = comment;
                    replaceCount++;
                    break;

                  case ConflictMode.importCopy:
                    if ((this.copySuffix?.length ?? 0) > 0) {
                      comment.title =
                        (comment.title?.length ?? 0) > 0 ? comment.title + ' ' + this.copySuffix! : this.copySuffix!;
                    }
                    comment.id = CsvStructure.getDefaultValue('id')!;
                    existingComments.push(comment);
                    cloneCount++;
                    break;
                }

                //#endregion
              }
            } else {
              console.log(`Invalid comment: ${JSON.stringify(comment)}`);
              invalidCount++;
            }
          }

          if (invalidCount > 0) {
            window.showWarningMessage(`Some invalid comments (${invalidCount}) were found.`);
          }

          //#endregion
          //#region Save with imported comments

          if (replaceCount + addedCount + cloneCount !== 0) {
            // Make a copy of the previous file
            if (this.backupBeforeImport) {
              fs.copyFileSync(this.reviewFile, getBackupFilename(this.reviewFile));
            }

            // Persist the file with the new comments
            if (
              setCsvFileLines(
                this.reviewFile,
                [CsvStructure.headerLine].concat(
                  existingComments.map((comment) => CsvStructure.formatAsCsvLine(comment)),
                ),
              )
            ) {
              window.showInformationMessage(
                `Comments imported (${addedCount} added, ${skipCount} ignored, ${replaceCount} overwritten, ${cloneCount} cloned).`,
              );
              resolve(true);
            } else {
              window.showErrorMessage(`Error in writing new content to the file "${this.reviewFile}".`);
              resolve(false);
            }
          } else {
            window.showWarningMessage(`No comments were imported (${skipCount} ignored).`);
            resolve(false);
          }

          //#endregion
        });
    });
  }
}
