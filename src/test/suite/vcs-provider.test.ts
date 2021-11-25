import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { stripIndents } from 'common-tags';
import { stubExecOnce } from 'stub-spawn-once';

import { gitsvnRevision, svnRevision } from '../../vcs-provider';

chai.use(chaiAsPromised);
chai.should();

suite('VCS Provider', () => {
  suite('svnRevision', () => {
    test('should extract the revision if command succeeds', () => {
      const file = 'my/file.txt';
      stubExecOnce(`svn info --show-item last-changed-revision ${file}`, '42');

      return svnRevision('my/file.txt', 'some/workspace').should.eventually.equal(42);
    });

    test('should fail on non-zero exit code', () => {
      const file = 'my/file.txt';
      stubExecOnce(`svn info --show-item last-changed-revision ${file}`, 1, '', 'my-error');

      return svnRevision('my/file.txt', 'some/workspace').should.eventually.be.rejectedWith('my-error');
    });

    test('should fail on unexpected command output', () => {
      const file = 'my/file.txt';
      stubExecOnce(`svn info --show-item last-changed-revision ${file}`, 0, 'not-a-number', '');

      return svnRevision('my/file.txt', 'some/workspace').should.eventually.be.rejectedWith('not-a-number');
    });
  });

  suite('gitsvnRevision', () => {
    test('should extract the revision if command succeeds', () => {
      const file = 'file.md';
      const gitsvnOutput = stripIndents`
        Path: ${file}
        Name: ${file}
        Working Copy Root Path: /home/someone/gitsvn-test-repo-checkout
        URL: file:///home/someone/gitsvn-test-repo/${file}
        Relative URL: ^/${file}
        Repository Root: file:///home/someone/gitsvn-test-repo
        Repository UUID: 1e59ce09-e6f8-40d7-8293-efd8ad2d6261
        Revision: 123
        Node Kind: file
        Schedule: normal
        Last Changed Author: someone
        Last Changed Rev: 42
        Last Changed Date: 2021-11-15 12:26:41 +0100 (Mo, 15 Nov 2021)
        Text Last Updated: 2021-11-15 12:26:28 +0100 (Mo, 15 Nov 2021)
      `;

      stubExecOnce(`git svn info ${file}`, gitsvnOutput);
      return gitsvnRevision(file, 'some/workspace').should.eventually.equal(42);
    });

    test('should fail when revision in output has unexpected format', () => {
      const file = 'file.md';
      const gitsvnOutput = stripIndents`
        Path: ${file}
        Name: ${file}
        Working Copy Root Path: /home/someone/gitsvn-test-repo-checkout
        URL: file:///home/someone/gitsvn-test-repo/${file}
        Relative URL: ^/${file}
        Repository Root: file:///home/someone/gitsvn-test-repo
        Repository UUID: 1e59ce09-e6f8-40d7-8293-efd8ad2d6261
        Revision: 123
        Node Kind: file
        Schedule: normal
        Last Changed Author: someone
        Last Changed Rev: not-a-number
        Last Changed Date: 2021-11-15 12:26:41 +0100 (Mo, 15 Nov 2021)
        Text Last Updated: 2021-11-15 12:26:28 +0100 (Mo, 15 Nov 2021)
      `;

      stubExecOnce(`git svn info ${file}`, gitsvnOutput);
      return gitsvnRevision(file, 'some/workspace').should.eventually.be.rejectedWith('Could not derive');
    });

    test('should fail when output is of unexpected format', () => {
      const file = 'file.md';
      const gitsvnOutput = stripIndents`
        Path: ${file}
        Name: ${file}
        Working Copy Root Path: /home/someone/gitsvn-test-repo-checkout
        URL: file:///home/someone/gitsvn-test-repo/${file}
        Relative URL: ^/${file}
        Repository Root: file:///home/someone/gitsvn-test-repo
        Repository UUID: 1e59ce09-e6f8-40d7-8293-efd8ad2d6261
        Revision: 123
        Node Kind: file
        Schedule: normal
        Last Changed Author: someone
        Last Changed Date: 2021-11-15 12:26:41 +0100 (Mo, 15 Nov 2021)
        Text Last Updated: 2021-11-15 12:26:28 +0100 (Mo, 15 Nov 2021)
      `;

      stubExecOnce(`git svn info ${file}`, gitsvnOutput);
      return gitsvnRevision(file, 'some/workspace').should.eventually.be.rejectedWith('Could not derive');
    });

    test('should fail when git-svn exits non-zero', () => {
      const file = 'file.md';

      stubExecOnce(`git svn info ${file}`, 1, '', '');
      return gitsvnRevision(file, 'some/workspace').should.eventually.be.rejectedWith('Could not retrieve');
    });
  });
});
