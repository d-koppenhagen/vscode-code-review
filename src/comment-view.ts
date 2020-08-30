import { ExtensionContext, TreeDataProvider, TreeItem, workspace, window, EventEmitter, Event, TreeView } from 'vscode';
import * as path from 'path';

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
    const treeItem = element;
    treeItem.iconPath = this.getIcon(element);
    return treeItem;
  }

  getChildren(element?: CommentListEntry): Thenable<CommentListEntry[]> {
    // if no element, the first item level starts
    if (!element) {
      return this.exportFactory.getFilesContainingComments();
    } else {
      return this.exportFactory.getComments(element);
    }
  }

  private getIcon(element: CommentListEntry): any {
    const priorityMap = workspace.getConfiguration().get('code-review.priorities') as string[];
    let icon = '';
    const index = priorityMap.findIndex((el) => {
      return el === element.prio;
    });
    switch (index) {
      case 0:
        icon = 'red.svg';
        break;
      case 1:
        icon = 'yellow.svg';
        break;
      case 2:
        icon = 'green.svg';
        break;
      default:
        icon = 'unset.svg';
        break;
    }
    const iPath = this.context.asAbsolutePath(path.join('images', icon));
    return { light: iPath, dark: iPath };
  }
}
