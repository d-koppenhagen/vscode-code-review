import { ExtensionContext, TreeDataProvider, TreeItem, window, EventEmitter, Event } from 'vscode';
import { CommentListEntry } from './comment-list-entry';
import { ExportFactory } from './export-factory';

export class CommentView {
  constructor(private commentProvider: CommentsProvider) {
    window.createTreeView('code-review.list', {
      treeDataProvider: this.commentProvider,
      showCollapseAll: true,
    });
  }
}

export class CommentsProvider implements TreeDataProvider<CommentListEntry> {
  private _onDidChangeTreeData: EventEmitter<CommentListEntry | undefined> = new EventEmitter<
    CommentListEntry | undefined
  >();
  readonly onDidChangeTreeData: Event<CommentListEntry | undefined> = this._onDidChangeTreeData.event;

  constructor(private context: ExtensionContext, private exportFactory: ExportFactory) {}

  refresh(entry?: CommentListEntry): void {
    this._onDidChangeTreeData.fire(entry);
  }

  getTreeItem(element: CommentListEntry): TreeItem {
    return element;
  }

  getChildren(element?: CommentListEntry): Thenable<CommentListEntry[]> {
    // if no element, the first item level starts
    if (!element) {
      return this.exportFactory.getFilesContainingComments();
    } else {
      return this.exportFactory.getComments(element);
    }
  }
}
