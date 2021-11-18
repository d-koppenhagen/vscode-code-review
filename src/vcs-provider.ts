import { workspace } from 'vscode';
const gitCommitId = require('git-commit-id');
const { exec } = require('child_process');
import path from 'path';

export enum VcsKind {
  git = 'git',
  svn = 'svn',
  gitsvn = 'git-svn',
}

/**
 * Gets the svn revision for the given `file`.
 *
 * @remark Requires SVN command-line client to be installed and in the user path.
 *
 * @param file Path to file to get the SVN revision for.
 *
 * @returns SVN revision of `file`.
 * @throws Error message if SVN command-line client is not installed or SVN revision for file could not be retrieved.
 */
export async function svnRevision(file: string, workspace: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    exec(
      `svn info --show-item last-changed-revision ${file}`,
      { cwd: workspace },
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          reject(`Could not retrieve SVN revision for file: ${file}. Error(s): ${stderr}`);
        }

        const maybeRevision = Number(stdout.trim());
        if (isNaN(maybeRevision)) {
          reject(`Unexpected command output: ${stdout}`);
        }
        resolve(maybeRevision);
      },
    );
  });
}

/**
 * Gets the svn revision for the given `file` from the underlying git-svn repository.
 *
 * @remark Requires git command-line client to be installed and in the user path.
 *
 * @param file Path to file to get the SVN revision for.
 *
 * @returns SVN revision of `file`.
 * @throws Error message if git command-line client is not installed or SVN revision for file could not be retrieved.
 */
export async function gitsvnRevision(file: string, workspace: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    exec(`git svn info ${file}`, { cwd: workspace }, (error: Error, stdout: string, stderr: string) => {
      if (error) {
        reject(`Could not retrieve SVN revision for file: ${file}. Error(s): ${stderr}`);
      }

      const revRegex = /^Last Changed Rev: (\d+)\s*$/gm;
      const matches = [...stdout.trim().matchAll(revRegex)];

      if (matches.length) {
        const maybeRevision = Number(matches[0][1]);
        if (isNaN(maybeRevision)) {
          reject(`Unexpected command output: ${matches[0][1]}`);
        }
        resolve(maybeRevision);
      }

      reject('Could not derive SVN revision from git-svn history.');
    });
  });
}

/**
 *
 * @param file
 * @returns
 */
export async function revision(file: string, workspace: string): Promise<string> {
  switch (vcsKind()) {
    case VcsKind.git: {
      // const gitDirectory = workspace.getConfiguration().get('code-review.gitDirectory') as string;
      // const gitRepositoryPath = path.resolve(this.workspaceRoot, gitDirectory);

      const fileUri = path.parse(file.toString());
      return Promise.resolve(gitCommitId({ cwd: workspace }));
    }

    case VcsKind.svn: {
      return new Promise<string>((resolve, reject) => {
        svnRevision(file, workspace).then((revision: number) => resolve(`${revision}`));
      });
    }

    case VcsKind.gitsvn: {
      return new Promise<string>((resolve, reject) => {
        gitsvnRevision(file, workspace).then((revision: number) => resolve(`${revision}`));
      });
    }

    default:
      // Must never happen, i.e., should be dealt with by, e.g., `vcsKind()`.
      return Promise.reject();
  }
}

/**
 *
 * @returns
 */
export function vcsKind(): VcsKind {
  const provider = workspace.getConfiguration().get<string>('code-review.vcs.provider');

  switch (provider) {
    case 'git':
      return VcsKind.git;
    case 'svn':
      return VcsKind.svn;
    default:
      throw new Error(`Unsupported VCS provider: ${provider}`);
  }
}
