import {
  commands,
  workspace,
  window,
  ExtensionContext,
  Uri,
  Range,
  ViewColumn,
  QuickPickItem,
  Disposable,
  DocumentFilter,
  FileSystemWatcher,
  TextEditor,
  languages,
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CheckFlag, FileGenerator } from './file-generator';
import { ReviewCommentService } from './review-comment';
import { rangesFromStringDefinition } from './utils/workspace-util';
import { WebViewComponent } from './webview';
import { ExportFactory } from './export-factory';
import { CommentsProvider, CommentView } from './comment-view';
import { ReviewFileExportSection } from './interfaces';
import { CsvEntry } from './model';
import { CommentListEntry } from './comment-list-entry';
import { ImportFactory, ConflictMode } from './import-factory';
import { Decorations } from './utils/decoration-utils';
import { CommentLensProvider } from './comment-lens-provider';

const checkForCodeReviewFile = (fileName: string) => {
  commands.executeCommand('setContext', 'codeReview:displayCodeReviewExplorer', fs.existsSync(fileName));
};

export class WorkspaceContext {
  private defaultTemplate!: Uri;
  private defaultMarkdownTemplate!: Uri;
  private generator!: FileGenerator;
  private exportFactory!: ExportFactory;
  private importFactory!: ImportFactory;
  private commentService!: ReviewCommentService;
  private webview: WebViewComponent;
  private commentsProvider!: CommentsProvider;
  private fileWatcher!: FileSystemWatcher;

  get reviewCommentService(): ReviewCommentService {
    return this.commentService;
  }

  get reviewCommentsProvider(): CommentsProvider {
    return this.commentsProvider;
  }

  get fileGenerator(): FileGenerator {
    return this.generator;
  }

  private openSelectionRegistration!: Disposable;
  private addNoteRegistration!: Disposable;
  private filterByCommitEnableRegistration!: Disposable;
  private filterByCommitDisableRegistration!: Disposable;
  private filterByFilenameEnableRegistration!: Disposable;
  private filterByFilenameDisableRegistration!: Disposable;
  private filterByPriorityEnableRegistration!: Disposable;
  private filterByPriorityDisableRegistration!: Disposable;
  private setReviewFileSelectedCsvRegistration!: Disposable;
  private deleteNoteRegistration!: Disposable;
  private exportAsHtmlWithDefaultTemplateRegistration!: Disposable;
  private exportAsHtmlWithHandlebarsTemplateRegistration!: Disposable;
  private exportAsMarkdownWithDefaultTemplateRegistration!: Disposable;
  private exportAsMarkdownWithHandlebarsTemplateRegistration!: Disposable;
  private copyAsMarkdownWithDefaultTemplateRegistration!: Disposable;
  private copyAsMarkdownWithHandlebarsTemplateRegistration!: Disposable;
  private exportAsGitLabImportableCsvRegistration!: Disposable;
  private exportAsGitHubImportableCsvRegistration!: Disposable;
  private exportAsJiraImportableCsvRegistration!: Disposable;
  private exportAsJsonRegistration!: Disposable;
  private importFromJsonRegistration!: Disposable;
  private commentCodeLensProviderregistration!: Disposable;
  private toggleResolvedRegistration!: Disposable;
  private filterBySpecificCommitRegistration!: Disposable;
  private decorations: Decorations;

  constructor(private context: ExtensionContext, public workspaceRoot: string) {
    // create a new file if not already exist
    this.webview = new WebViewComponent(context);
    this.decorations = new Decorations(context);
    this.setup();
  }

  setup() {
    this.updateGenerator();
    this.updateExportFactory();
    this.updateImportFactory();
    this.updateReviewCommentService();
    this.updateCommentsProvider();
    this.setupFileWatcher();
    this.watchConfiguration();
    this.watchGitSwitch();
    this.watchActiveEditor();
    this.watchForFileChanges();
    new CommentView(this.commentsProvider);
    this.updateDecorations();
  }

  watchConfiguration() {
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('code-review.filename')) {
        this.refreshCommands();
      }
    });
  }

  watchActiveEditor() {
    // Refresh comment view on file focus
    window.onDidChangeActiveTextEditor((_) => {
      if (this.exportFactory.refreshFilterByFilename()) {
        this.commentsProvider.refresh();
      }
      this.updateDecorations();
    });
  }

  clearVisibleDecorations() {
    window.visibleTextEditors.forEach((editor: TextEditor) => {
      this.decorations.clear(editor);
    });
  }

  highlightCommentsInActiveEditor(editor: TextEditor) {
    this.decorations.clear(editor);

    // Quick check: does the CSV contain this file at all?
    if (!this.exportFactory.csvContainsFile(editor.document.fileName)) {
      return;
    }

    this.exportFactory.getFilesContainingComments().then((fileEntries) => {
      const matchingFile = fileEntries.find((file) => editor.document.fileName.endsWith(file.label));
      // iterate over all comments associated with this file
      if (matchingFile) {
        this.exportFactory.getComments(matchingFile).then((comments) => {
          // Filter out resolved comments so their icons are hidden
          // comments[0] as we only need a single comment related to a line to identify the place where to put it
          const lines = comments[0].data.lines as CsvEntry[];
          const unresolved = lines.filter((e) => !e.resolved);
          this.decorations.underlineDecoration(unresolved, editor);
          this.decorations.commentIconDecoration(unresolved, editor);
        });
      }
    });
  }

  /**
   * Refresh comment view on git switch
   */
  watchGitSwitch() {
    const gitDirectory = (workspace.getConfiguration().get('code-review.gitDirectory') as string) ?? '.';
    const gitHeadPath = path.resolve(gitDirectory, '.git/HEAD');
    const gitWatcher = workspace.createFileSystemWatcher(`**${gitHeadPath}`);
    gitWatcher.onDidChange(() => {
      this.exportFactory.refreshFilterByCommit();
      this.commentsProvider.refresh();
      this.updateDecorations();
    });
  }

  /**
   * setup review file watcher
   */
  setupFileWatcher() {
    this.fileWatcher = workspace.createFileSystemWatcher(`**/${this.generator.reviewFilePath}`);
  }

  /**
   * watch on the review file for changes
   */
  watchForFileChanges() {
    // refresh comment view on manual changes in the review file
    checkForCodeReviewFile(this.generator.absoluteReviewFilePath);
    this.fileWatcher.onDidChange(() => {
      this.commentsProvider.refresh();
    });
    this.fileWatcher.onDidCreate(() => {
      this.commentsProvider.refresh();
      checkForCodeReviewFile(this.generator.absoluteReviewFilePath);
    });
    this.fileWatcher.onDidDelete(() => {
      this.commentsProvider.refresh();
      checkForCodeReviewFile(this.generator.absoluteReviewFilePath);
    });
  }

  /**
   * refresh highlighted comments in text editor
   */
  updateDecorations() {
    if (window.activeTextEditor) {
      this.highlightCommentsInActiveEditor(window.activeTextEditor);
    }
  }

  updateGenerator() {
    this.generator = new FileGenerator(this.workspaceRoot);
    this.generator.check(CheckFlag.format | CheckFlag.migrate);
  }

  updateExportFactory() {
    this.exportFactory = new ExportFactory(this.context, this.workspaceRoot, this.generator);
  }
  updateImportFactory() {
    this.importFactory = new ImportFactory(this.workspaceRoot, this.exportFactory.absoluteFilePath, this.generator);
  }

  updateReviewCommentService() {
    this.commentService = new ReviewCommentService(this.generator.absoluteReviewFilePath, this.workspaceRoot);
  }

  updateCommentsProvider() {
    /**
     * register comment view
     */
    this.commentsProvider = new CommentsProvider(this.context, this.exportFactory);
  }

  getDefaultTemplate(): Uri {
    const defaultConfigurationTemplatePath = workspace
      .getConfiguration()
      .get('code-review.defaultTemplatePath') as string;
    return defaultConfigurationTemplatePath
      ? Uri.file(defaultConfigurationTemplatePath)
      : Uri.parse(this.context.asAbsolutePath(path.join('dist', 'template.default.hbs')));
  }

  getDefaultMarkdownTemplate(): Uri {
    const defaultMarkdownTemplatePath = workspace
      .getConfiguration()
      .get('code-review.defaultMarkdownTemplatePath') as string;
    return defaultMarkdownTemplatePath
      ? Uri.file(defaultMarkdownTemplatePath)
      : Uri.parse(this.context.asAbsolutePath(path.join('dist', 'template-markdown.default.hbs')));
  }

  registerCommands() {
    this.openSelectionRegistration = commands.registerCommand(
      'codeReview.openSelection',
      (fileSection: ReviewFileExportSection, csvRef?: CsvEntry) => {
        if (!this.generator.check()) {
          return;
        }

        const filePath = path.join(this.workspaceRoot, fileSection.group);
        workspace.openTextDocument(filePath).then(
          (doc) => {
            window.showTextDocument(doc, ViewColumn.One).then((textEditor) => {
              if (csvRef) {
                const ranges: Range[] = rangesFromStringDefinition(csvRef.lines);
                textEditor.revealRange(ranges[0]);
                this.webview.editComment(this.commentService, ranges, csvRef);
              }
            });
          },
          (err) => {
            const msg = `Cannot not open file: '${filePath}': File does not exist.`;
            window.showErrorMessage(msg);
          },
        );
      },
    );

    /**
     * register comment panel web view
     */
    this.addNoteRegistration = commands.registerCommand('codeReview.addNote', () => {
      if (!window.activeTextEditor?.selection) {
        window.showErrorMessage(
          `No selection made. Please select something you want to add a comment to and try again.`,
        );
        return;
      }
      // Execute every time a comment will be added to check file format
      if (!this.generator.create()) {
        return;
      }

      this.webview.onDidChange = () => {
        this.commentsProvider.refresh();
        this.updateDecorations();
      };
      this.webview.addComment(this.commentService);
    });

    this.filterByCommitEnableRegistration = commands.registerCommand('codeReview.filterByCommitEnable', () => {
      this.setFilterByCommit(true);
    });

    this.filterByCommitDisableRegistration = commands.registerCommand('codeReview.filterByCommitDisable', () => {
      this.setFilterByCommit(false);
    });

    this.filterByFilenameEnableRegistration = commands.registerCommand('codeReview.filterByFilenameEnable', () => {
      this.setFilterByFilename(true);
    });

    this.filterByFilenameDisableRegistration = commands.registerCommand('codeReview.filterByFilenameDisable', () => {
      this.setFilterByFilename(false);
    });

    this.filterByPriorityEnableRegistration = commands.registerCommand('codeReview.filterByPriorityEnable', () => {
      this.setFilterByPriority(true);
    });

    this.filterByPriorityDisableRegistration = commands.registerCommand('codeReview.filterByPriorityDisable', () => {
      this.setFilterByPriority(false);
    });

    this.setReviewFileSelectedCsvRegistration = commands.registerCommand('codeReview.setReviewFileSelectedCsv', () => {
      if (!window.activeTextEditor) {
        window.showErrorMessage(`No CSV selected. Open a code-review CSV and re-run the command.`);
        return;
      }

      const file = window.activeTextEditor.document.uri;
      workspace.getConfiguration().update('code-review.filename', file.fsPath, null, undefined);

      window.showInformationMessage(`Set code-review file to: ${file.fsPath}`);
    });

    /**
     * delete an existing comment
     */
    this.deleteNoteRegistration = commands.registerCommand('codeReview.deleteNote', (entry: CommentListEntry) => {
      if (!this.generator.check()) {
        return;
      }
      this.webview.deleteComment(this.commentService, entry);
      this.commentsProvider.refresh();
      this.updateDecorations();
    });

    /**
     * allow users to export the report as HTML using the default output
     */
    this.exportAsHtmlWithDefaultTemplateRegistration = commands.registerCommand(
      'codeReview.exportAsHtmlWithDefaultTemplate',
      () => {
        this.exportFactory.exportForFormat('html', this.getDefaultTemplate());
      },
    );

    /**
     * allow users to export the report as HTML using a specific handlebars template
     */
    this.exportAsHtmlWithHandlebarsTemplateRegistration = commands.registerCommand(
      'codeReview.exportAsHtmlWithHandlebarsTemplate',
      () => {
        window
          .showOpenDialog({
            canSelectFolders: false,
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Use template',
            filters: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              Template: ['hbs', 'html', 'htm', 'handlebars'],
            },
          })
          .then((files) => {
            const template = files?.length ? files[0] : undefined;
            this.exportFactory.exportForFormat('html', template ?? this.getDefaultTemplate());
          });
      },
    );

    /**
     * allow users to export the report as Markdown using the default output
     */
    this.exportAsMarkdownWithDefaultTemplateRegistration = commands.registerCommand(
      'codeReview.exportAsMarkdownWithDefaultTemplate',
      () => {
        this.exportFactory.exportForFormat('markdown', this.getDefaultMarkdownTemplate());
      },
    );

    /**
     * allow users to export the report as HTML using a specific handlebars template
     */
    this.exportAsMarkdownWithHandlebarsTemplateRegistration = commands.registerCommand(
      'codeReview.exportAsMarkdownWithHandlebarsTemplate',
      () => {
        window
          .showOpenDialog({
            canSelectFolders: false,
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Use template',
            filters: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              Template: ['hbs', 'md', 'markdown', 'mdx', 'handlebars'],
            },
          })
          .then((files) => {
            const template = files?.length ? files[0] : undefined;
            this.exportFactory.exportForFormat('markdown', template ?? this.defaultTemplate);
          });
      },
    );

    /**
     * copy the report as Markdown to the clipboard using default template
     */
    this.copyAsMarkdownWithDefaultTemplateRegistration = commands.registerCommand(
      'codeReview.copyAsMarkdownWithDefaultTemplate',
      () => {
        this.exportFactory.copyForFormat('markdown', this.getDefaultMarkdownTemplate());
      },
    );

    /**
     * copy the report as Markdown to the clipboard using a specific handlebars template
     */
    this.copyAsMarkdownWithHandlebarsTemplateRegistration = commands.registerCommand(
      'codeReview.copyAsMarkdownWithHandlebarsTemplate',
      () => {
        window
          .showOpenDialog({
            canSelectFolders: false,
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Use template',
            filters: {
              Template: ['hbs', 'md', 'markdown', 'mdx', 'handlebars'],
            },
          })
          .then((files) => {
            const template = files?.length ? files[0] : undefined;
            this.exportFactory.copyForFormat('markdown', template ?? this.getDefaultMarkdownTemplate());
          });
      },
    );

    /**
     * allow users to export the report as GitLab importable CSV file
     */
    this.exportAsGitLabImportableCsvRegistration = commands.registerCommand(
      'codeReview.exportAsGitLabImportableCsv',
      () => {
        this.exportFactory.exportForFormat('gitlab');
      },
    );

    /**
     * allow users to export the report as GitHub importable CSV file
     * @see https://github.com/gavinr/github-csv-tools
     */
    this.exportAsGitHubImportableCsvRegistration = commands.registerCommand(
      'codeReview.exportAsGitHubImportableCsv',
      () => {
        this.exportFactory.exportForFormat('github');
      },
    );

    /**
     * allow users to export the report as JIRA importable CSV file
     */
    this.exportAsJiraImportableCsvRegistration = commands.registerCommand(
      'codeReview.exportAsJiraImportableCsv',
      () => {
        this.exportFactory.exportForFormat('jira');
      },
    );

    /**
     * allow users to export the report as JSON file
     */
    this.exportAsJsonRegistration = commands.registerCommand('codeReview.exportAsJson', () => {
      this.exportFactory.exportForFormat('json');
    });

    /**
     * allow users to import comments from a JSON file
     */
    this.importFromJsonRegistration = commands.registerCommand('codeReview.importFromJson', () => {
      // File selection
      window
        .showOpenDialog({
          canSelectFolders: false,
          canSelectFiles: true,
          canSelectMany: false,
          openLabel: 'Select comments file to import',
          filters: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Template: ['json'],
          },
        })
        .then((files) => {
          const filename = files?.length ? files[0] : undefined;
          if (filename) {
            const mode = workspace.getConfiguration().get('code-review.importConflictMode') as string;
            if (mode !== '') {
              this.importFactory.importCommentsFromFile(filename!.fsPath, mode as ConflictMode).then((result) => {
                if (result) {
                  this.commentsProvider.refresh();
                }
              });
            } else {
              // Select the import conflict mode
              class PickItem implements QuickPickItem {
                constructor(
                  public mode: ConflictMode,
                  public label: string,
                  public description?: string | undefined,
                  public detail?: string | undefined,
                  public picked?: boolean | undefined,
                  public alwaysShow?: boolean | undefined,
                ) {}
              }

              window
                .showQuickPick<PickItem>(
                  [
                    {
                      label: 'Skip',
                      description:
                        'In case of conflict, the existing comment will be kept and the imported one will be ignored.',
                      alwaysShow: true,
                      mode: ConflictMode.skipImported,
                    } as PickItem,
                    {
                      label: 'Overwrite',
                      description: 'In case of conflict, the existing comment will be replaced with the imported one.',
                      alwaysShow: true,
                      mode: ConflictMode.replaceWithImported,
                    } as PickItem,
                    {
                      label: 'Clone',
                      description: 'In case of conflict, both the existing and the imported comments will be kept.',
                      alwaysShow: true,
                      mode: ConflictMode.importCopy,
                    } as PickItem,
                  ],
                  {
                    canPickMany: false,
                    placeHolder: 'Select the import conflict mode',
                  },
                )
                .then((item) => {
                  if (item) {
                    this.importFactory.importCommentsFromFile(filename!.fsPath, item.mode).then((result) => {
                      if (result) {
                        this.commentsProvider.refresh();
                      }
                    });
                  }
                });
            }
          }
        });
    });

    /**
     * support code lens for comment annotations in files
     */
    // CodeLens shows "Code Review: <title>" above commented ranges.
    // Clicking the lens opens the edit window for that comment.
    const ALL_FILES: DocumentFilter = { language: '*', scheme: 'file' };
    this.commentCodeLensProviderregistration = languages.registerCodeLensProvider(
      ALL_FILES,
      new CommentLensProvider(this.exportFactory),
    );

    /**
     * toggle resolved state of a comment
     */
    this.toggleResolvedRegistration = commands.registerCommand(
      'codeReview.toggleResolved',
      async (commentListEntry: CommentListEntry) => {
        if (commentListEntry?.id) {
          await this.commentService.toggleResolved(commentListEntry.id);
          this.commentsProvider.refresh();
          this.updateDecorations();
        }
      },
    );

    this.filterBySpecificCommitRegistration = commands.registerCommand(
      'codeReview.filterBySpecificCommit',
      async () => {
        const commits = await this.exportFactory.getAvailableCommits();
        if (commits.length === 0) {
          window.showInformationMessage('No commits found in code review data.');
          return;
        }

        const items: QuickPickItem[] = [
          { label: '$(clear-all) All commits', description: '__all__' },
          ...commits.map((c) => ({
            label: c.label,
            description: c.sha,
          })),
        ];

        const selected = await window.showQuickPick(items, {
          placeHolder: 'Select a commit to filter by...',
        });

        if (!selected) return;

        if (selected.description === '__all__') {
          this.setFilterByCommit(false);
        } else if (selected.description !== undefined) {
          this.exportFactory.setFilterBySpecificCommit(selected.description);
          this.commentsProvider.refresh();
          this.updateDecorations();
        }
      },
    );

    this.updateSubscriptions();
  }

  /**
   * push all registration into subscriptions
   */
  updateSubscriptions() {
    this.context.subscriptions.push(
      this.openSelectionRegistration,
      this.addNoteRegistration,
      this.deleteNoteRegistration,
      this.filterByCommitEnableRegistration,
      this.filterByCommitDisableRegistration,
      this.filterByFilenameEnableRegistration,
      this.filterByFilenameDisableRegistration,
      this.filterByPriorityEnableRegistration,
      this.filterByPriorityDisableRegistration,
      this.setReviewFileSelectedCsvRegistration,
      this.exportAsHtmlWithDefaultTemplateRegistration,
      this.exportAsHtmlWithHandlebarsTemplateRegistration,
      this.exportAsMarkdownWithDefaultTemplateRegistration,
      this.exportAsMarkdownWithHandlebarsTemplateRegistration,
      this.copyAsMarkdownWithDefaultTemplateRegistration,
      this.copyAsMarkdownWithHandlebarsTemplateRegistration,
      this.exportAsGitLabImportableCsvRegistration,
      this.exportAsGitHubImportableCsvRegistration,
      this.exportAsJiraImportableCsvRegistration,
      this.exportAsJsonRegistration,
      this.importFromJsonRegistration,
      this.commentCodeLensProviderregistration,
      this.toggleResolvedRegistration,
      this.filterBySpecificCommitRegistration,
    );
  }

  /**
   * dispose all current registrations and update the subscriptions
   */
  unregisterCommands() {
    this.openSelectionRegistration.dispose();
    this.addNoteRegistration.dispose();
    this.deleteNoteRegistration.dispose();
    this.filterByCommitEnableRegistration.dispose();
    this.filterByCommitDisableRegistration.dispose();
    this.filterByFilenameEnableRegistration.dispose();
    this.filterByFilenameDisableRegistration.dispose();
    this.filterByPriorityEnableRegistration.dispose();
    this.filterByPriorityDisableRegistration.dispose();
    this.setReviewFileSelectedCsvRegistration.dispose();
    this.exportAsHtmlWithDefaultTemplateRegistration.dispose();
    this.exportAsHtmlWithHandlebarsTemplateRegistration.dispose();
    this.exportAsMarkdownWithDefaultTemplateRegistration.dispose();
    this.exportAsMarkdownWithHandlebarsTemplateRegistration.dispose();
    this.copyAsMarkdownWithDefaultTemplateRegistration.dispose();
    this.copyAsMarkdownWithHandlebarsTemplateRegistration.dispose();
    this.exportAsGitLabImportableCsvRegistration.dispose();
    this.exportAsGitHubImportableCsvRegistration.dispose();
    this.exportAsJiraImportableCsvRegistration.dispose();
    this.exportAsJsonRegistration.dispose();
    this.importFromJsonRegistration.dispose();
    this.commentCodeLensProviderregistration.dispose();
    this.toggleResolvedRegistration.dispose();
    this.filterBySpecificCommitRegistration.dispose();
    this.updateSubscriptions();
  }

  refreshCommands() {
    this.clearVisibleDecorations();
    this.unregisterCommands();
    this.setup();
    this.registerCommands();
  }

  private setFilterByCommit(state: boolean) {
    this.exportFactory.setFilterByCommit(state);
    this.commentsProvider.refresh();
    this.updateDecorations();
  }

  private setFilterByFilename(state: boolean) {
    this.exportFactory.setFilterByFilename(state);
    this.commentsProvider.refresh();
    this.updateDecorations();
  }

  private setFilterByPriority(state: boolean) {
    this.exportFactory.setFilterByPriority(state);
    this.commentsProvider.refresh();
  }
}
