// @ts-nocheck
import { TreeItem, TreeItemCollapsibleState } from 'vscode';

import { ReviewFileExportSection } from './interfaces';

export class CommentListEntry extends TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly text: string,
    public readonly hoverLabel: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly data: ReviewFileExportSection,
    public readonly prio?: number,
    public readonly priv?: number,
  ) {
    super(label, collapsibleState);
  }

  get tooltip(): string {
    return this.hoverLabel;
  }

  get description(): string {
    return this.text || '';
  }
}
