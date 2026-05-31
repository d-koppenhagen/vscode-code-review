import * as assert from 'assert';
import { beforeEach, afterEach } from 'mocha';
import {
  window,
  workspace,
  ExtensionContext,
  Uri,
  Range,
  Position,
  TextEditor,
  WebviewPanel,
  ViewColumn,
  Selection,
} from 'vscode';
import { WebViewComponent } from '../../webview';
import * as fs from 'fs';
import * as path from 'path';

function createPanelStub(): WebviewPanel {
  const listeners: Record<string, (() => void)[]> = { dispose: [] };
  let webviewHtml = '';
  let panelTitle = '';

  const webviewStub: any = {
    get html() {
      return webviewHtml;
    },
    set html(v: string) {
      webviewHtml = v;
    },
    postMessage: (_msg: unknown) => undefined,
    onDidReceiveMessage: (_listener: (msg: unknown) => void) => ({ dispose: () => {} }),
    cspSource: '',
    asWebviewUri: (uri: any) => uri,
    options: {},
  };

  return {
    get title() {
      return panelTitle;
    },
    set title(v: string) {
      panelTitle = v;
    },
    get webview() {
      return webviewStub;
    },
    reveal: (_column?: ViewColumn) => {},
    dispose: () => {
      listeners['dispose'].forEach((fn) => fn());
    },
    onDidDispose: (fn: () => void) => {
      listeners['dispose'].push(fn);
      return { dispose: () => {} };
    },
  } as unknown as WebviewPanel;
}

function createEditorStub(fileName = '/workspace/test.ts'): TextEditor {
  return {
    document: {
      fileName,
      uri: Uri.file(fileName),
      getText: () => '',
      getWordRangeAtPosition: () => undefined,
      isDirty: false,
      isUntitled: false,
      isClosed: false,
      languageId: 'typescript',
      lineCount: 100,
      eol: 1,
      lineAt: () => ({
        lineNumber: 0,
        text: '',
        range: new Range(0, 0, 0, 0),
        firstNonWhitespaceCharacterIndex: 0,
        isEmptyOrWhitespace: false,
        rangeIncludingLineBreak: new Range(0, 0, 0, 0),
      }),
      offsetAt: () => 0,
      positionAt: () => new Position(0, 0),
      save: () => Promise.resolve(true),
      validatePosition: (p: Position) => p,
      validateRange: (r: Range) => r,
    },
    selections: [new Selection(new Position(2, 0), new Position(5, 10))],
    selection: new Selection(new Position(2, 0), new Position(5, 10)),
    setDecorations: () => {},
    revealRange: () => {},
    edit: () => Promise.resolve(true),
    insertSnippet: () => Promise.resolve(true),
    options: { tabSize: 4, insertSpaces: true },
    viewColumn: ViewColumn.One,
    visibleRanges: [new Range(0, 0, 0, 0)],
    show: () => {},
    hide: () => {},
  } as unknown as TextEditor;
}

suite('WebViewComponent', () => {
  let component: WebViewComponent;
  let contextStub: ExtensionContext;
  let createdPanels: WebviewPanel[] = [];
  let originalCreateWebviewPanel: any;
  let templateFilePath: string;
  let editorStub: TextEditor;

  beforeEach(() => {
    // Create a real template file that the constructor can read
    const tmpdir = require('os').tmpdir();
    templateFilePath = path.join(tmpdir, 'code-review-test-webview-template.html');
    fs.writeFileSync(
      templateFilePath,
      "<!DOCTYPE html><html><body><h2>FILENAME</h2><select>SELECT_LIST_STRING</select>\n<script>const vscode = acquireVsCodeApi();\nwindow.addEventListener('message', (event) => { if (event.data.command === 'reset') { return; } });\n</script>\n</body></html>",
    );

    editorStub = createEditorStub();

    createdPanels = [];
    originalCreateWebviewPanel = (window as any).createWebviewPanel;
    (window as any).createWebviewPanel = (_vt: string, title: string, _so: any, _opts: any) => {
      const panel = createPanelStub();
      (panel as any).title = title;
      createdPanels.push(panel);
      return panel;
    };

    // Stub workspace.getConfiguration (constructor calls it without section arg)
    const origGetConfig = workspace.getConfiguration.bind(workspace);
    (workspace as any).getConfiguration = (section?: string) => {
      const mock = {
        get: (key: string) => {
          if (key === 'categories' || key === 'code-review.categories') return ['Bug', 'Feature', 'Style'];
          if (key === 'codeSelectionBackgroundColor' || key === 'code-review.codeSelectionBackgroundColor')
            return 'rgba(0,128,255,0.2)';
          if (key === 'closePanelAfterAdd' || key === 'code-review.closePanelAfterAdd') return false;
          if (key === 'closePanelAfterEdit' || key === 'code-review.closePanelAfterEdit') return false;
          return undefined;
        },
      };
      if (!section || section === 'code-review') {
        return mock;
      }
      return origGetConfig(section);
    };

    // Stub Uri.joinPath to point to our real template file
    const origJoinPath = Uri.joinPath.bind(Uri);
    (Uri as any).joinPath = (base: any, ..._pathSegments: string[]) => {
      return {
        with: (_opts: any) => ({
          fsPath: templateFilePath,
          scheme: 'file',
          authority: '',
          path: templateFilePath,
          query: '',
          fragment: '',
          with: () => ({}),
          toJSON: () => ({}),
        }),
        ...base,
      };
    };

    contextStub = {
      extensionUri: Uri.file('/fake/path'),
      subscriptions: [],
      extensionPath: '/fake/path',
      storagePath: undefined,
      globalStoragePath: undefined,
      logPath: undefined,
      extensionMode: 1,
      asAbsolutePath: (p: string) => p,
      secrets: {
        get: () => Promise.resolve(undefined),
        store: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        onDidChange: () => ({ dispose: () => {} }),
      },
      environmentVariableCollection: {
        get: () => undefined,
        replace: () => {},
        append: () => {},
        prepend: () => {},
        delete: () => {},
        forEach: () => {},
        getScoped: () => ({} as any),
        persistent: false,
        description: '',
      },
      globalState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [], setKeysForSync: () => {} },
      workspaceState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [] },
      languageModelAccessInformation: { onDidChange: () => ({ dispose: () => {} }) },
    } as unknown as ExtensionContext;

    component = new WebViewComponent(contextStub);

    // Mock getWorkingEditor and disposeWorkingEditor to use our stub
    (component as any).getWorkingEditor = () => editorStub;
    (component as any).disposeWorkingEditor = () => {
      /* no-op: keep editorStub */
    };
  });

  afterEach(() => {
    (window as any).createWebviewPanel = originalCreateWebviewPanel;
    (workspace as any).getConfiguration = workspace.getConfiguration;
    Uri.joinPath = Uri.joinPath;
    try {
      fs.unlinkSync(templateFilePath);
    } catch (_) {
      /* ok */
    }
  });

  // ===================== showPanel =====================
  suite('showPanel', () => {
    test('should create a new panel when none exists', () => {
      const panel = (component as any).showPanel('Test Title', '/path/to/file.ts');
      assert.strictEqual(createdPanels.length, 1);
      assert.strictEqual(panel.title, 'Test Title');
    });

    test('should reuse existing panel when it already exists', () => {
      const panel1 = (component as any).showPanel('First Title', '/path/to/file1.ts');
      const panel2 = (component as any).showPanel('Second Title', '/path/to/file2.ts');
      assert.strictEqual(createdPanels.length, 1, 'should not create a second panel');
      assert.strictEqual(panel2.title, 'Second Title', 'title should be updated');
      assert.strictEqual(panel1, panel2, 'same panel reference returned');
    });

    test('should rebuild HTML with new filename when reusing panel', () => {
      (component as any).showPanel('First', '/path/to/file1.ts');
      (component as any).showPanel('Second', '/path/to/file2.ts');
      const html = (component as any).panel.webview.html;
      assert.ok(html.includes('file2.ts'), 'HTML should reflect the new filename');
    });
  });

  // ===================== buildHtml =====================
  suite('buildHtml', () => {
    test('should replace FILENAME with basename', () => {
      const html = (component as any).buildHtml('/workspace/src/utils/foo.ts');
      assert.ok(html.includes('foo.ts'));
      assert.ok(!html.includes('FILENAME'));
    });

    test('should replace SELECT_LIST_STRING with category options', () => {
      const html = (component as any).buildHtml('/workspace/file.ts');
      assert.ok(html.includes('<option value="Bug">Bug</option>'));
      assert.ok(html.includes('<option value="Feature">Feature</option>'));
      assert.ok(html.includes('<option value="Style">Style</option>'));
      assert.ok(!html.includes('SELECT_LIST_STRING'));
    });
  });

  // ===================== editor cache =====================
  suite('editor cache', () => {
    test('addComment calls disposeWorkingEditor before getWorkingEditor', () => {
      const callOrder: string[] = [];
      (component as any).disposeWorkingEditor = () => {
        callOrder.push('dispose');
      };
      (component as any).getWorkingEditor = () => {
        callOrder.push('get');
        return editorStub;
      };
      (component as any).currentMessageListener = { dispose: () => {} };
      (component as any).currentDisposeListener = { dispose: () => {} };

      (component as any).addComment({ addComment: async () => {} });

      assert.deepStrictEqual(
        callOrder,
        ['dispose', 'get'],
        'disposeWorkingEditor must be called before getWorkingEditor',
      );
    });

    test('addComment gets editor after disposeWorkingEditor clears cache', () => {
      let editorAfterDispose: TextEditor | null = null;
      (component as any).disposeWorkingEditor = () => {
        /* clear */
      };
      (component as any).getWorkingEditor = () => {
        editorAfterDispose = editorStub;
        return editorStub;
      };
      (component as any).currentMessageListener = { dispose: () => {} };
      (component as any).currentDisposeListener = { dispose: () => {} };

      (component as any).addComment({ addComment: async () => {} });

      assert.strictEqual(editorAfterDispose!.document.fileName, '/workspace/test.ts');
    });
  });

  // ===================== addComment =====================
  suite('addComment', () => {
    let onDidChangeCalls: number;

    beforeEach(() => {
      onDidChangeCalls = 0;
      component.onDidChange = () => {
        onDidChangeCalls++;
      };
    });

    function captureListener(comp: any, commentService: any): ((msg: any) => void) | null {
      let listener: ((msg: any) => void) | null = null;
      const origShowPanel = comp.showPanel.bind(comp);
      comp.showPanel = (t: string, f: string) => {
        const p = origShowPanel(t, f);
        const orig = p.webview.onDidReceiveMessage.bind(p.webview);
        p.webview.onDidReceiveMessage = (l: any, ...args: any[]) => {
          listener = l;
          return orig(l, ...args);
        };
        return p;
      };
      comp.currentMessageListener = { dispose: () => {} };
      comp.currentDisposeListener = { dispose: () => {} };
      comp.addComment(commentService);
      return listener;
    }

    test('should dispose previous currentAddDecoration', () => {
      let disposeCalled = false;
      (component as any).currentAddDecoration = {
        dispose: () => {
          disposeCalled = true;
        },
      };
      (component as any).currentMessageListener = { dispose: () => {} };
      (component as any).currentDisposeListener = { dispose: () => {} };
      (component as any).addComment({ addComment: async () => {} });
      assert.ok(disposeCalled, 'previous decoration should be disposed');
    });

    test('should dispose previous message listener', () => {
      let disposeCalled = false;
      (component as any).currentMessageListener = {
        dispose: () => {
          disposeCalled = true;
        },
      };
      (component as any).currentDisposeListener = { dispose: () => {} };
      (component as any).addComment({ addComment: async () => {} });
      assert.ok(disposeCalled, 'previous listener should be disposed');
    });

    test('should set panel title to Add code review comment', () => {
      (component as any).currentMessageListener = { dispose: () => {} };
      (component as any).currentDisposeListener = { dispose: () => {} };
      (component as any).addComment({ addComment: async () => {} });
      const panel = (component as any).panel;
      assert.strictEqual(panel.title, 'Add code review comment');
    });

    test('on submit: should call commentService.addComment', () => {
      let addCalled = false;
      const commentService = {
        addComment: async () => {
          addCalled = true;
        },
      };
      const listener = captureListener(component, commentService);
      const formData = JSON.stringify({
        title: 'T',
        comment: 'desc',
        priority: 2,
        category: 'Bug',
        additional: '',
        private: 0,
      });
      listener!({ command: 'submit', text: formData });
      assert.ok(addCalled, 'addComment should be called on submit');
    });

    test('on submit: should keep the panel alive', () => {
      let disposeCalled = false;
      const commentService = { addComment: async () => {} };
      const c = component as any;
      c.currentMessageListener = { dispose: () => {} };
      c.currentDisposeListener = { dispose: () => {} };

      let listener: ((msg: any) => void) | null = null;
      const origShowPanel = c.showPanel.bind(c);
      c.showPanel = (t: string, f: string) => {
        const p = origShowPanel(t, f);
        const orig = p.webview.onDidReceiveMessage.bind(p.webview);
        p.webview.onDidReceiveMessage = (l: any, ...args: any[]) => {
          listener = l;
          return orig(l, ...args);
        };
        const origDispose = p.dispose.bind(p);
        p.dispose = () => {
          disposeCalled = true;
          origDispose();
        };
        return p;
      };
      c.addComment(commentService);

      const formData = JSON.stringify({
        title: 'T',
        comment: 'desc',
        priority: 0,
        category: '',
        additional: '',
        private: 0,
      });
      listener!({ command: 'submit', text: formData });
      assert.strictEqual(disposeCalled, false, 'panel should NOT be disposed after submit');
    });

    test('on submit: should dispose decoration', () => {
      let decorDisposed = false;
      const commentService = { addComment: async () => {} };
      const c = component as any;
      c.currentMessageListener = { dispose: () => {} };
      c.currentDisposeListener = { dispose: () => {} };

      let capturedListener: ((msg: any) => void) | null = null;
      const origShowPanel = c.showPanel.bind(c);
      c.showPanel = (t: string, f: string) => {
        const p = origShowPanel(t, f);
        const orig = p.webview.onDidReceiveMessage.bind(p.webview);
        p.webview.onDidReceiveMessage = (l: any, ...args: any[]) => {
          capturedListener = l;
          return orig(l, ...args);
        };
        return p;
      };

      c.addComment(commentService);
      c.currentAddDecoration = {
        dispose: () => {
          decorDisposed = true;
        },
      };

      const formData = JSON.stringify({
        title: 'T',
        comment: 'desc',
        priority: 0,
        category: '',
        additional: '',
        private: 0,
      });
      capturedListener!({ command: 'submit', text: formData });

      assert.ok(decorDisposed, 'decoration should be disposed after submit');
      assert.strictEqual(c.currentAddDecoration, null);
    });

    test('on submit: should invoke onDidChange callback synchronously', () => {
      const commentService = { addComment: async () => {} };
      const listener = captureListener(component, commentService);
      onDidChangeCalls = 0;
      const formData = JSON.stringify({
        title: 'T',
        comment: 'desc',
        priority: 0,
        category: '',
        additional: '',
        private: 0,
      });
      listener!({ command: 'submit', text: formData });
      assert.strictEqual(onDidChangeCalls, 1, 'onDidChange should be called synchronously on submit');
    });

    test('on submit: should dispose currentAddDecoration', () => {
      let decorDisposed = false;
      const commentService = { addComment: async () => {} };
      const listener = captureListener(component, commentService);
      (component as any).currentAddDecoration = {
        dispose: () => {
          decorDisposed = true;
        },
      };
      const formData = JSON.stringify({
        title: 'T',
        comment: 'desc',
        priority: 0,
        category: '',
        additional: '',
        private: 0,
      });
      listener!({ command: 'submit', text: formData });
      assert.ok(decorDisposed, 'decoration should be disposed after submit');
      assert.strictEqual((component as any).currentAddDecoration, null);
    });

    test('on cancel: should keep the panel alive', () => {
      let disposeCalled = false;
      const commentService = { addComment: async () => {} };
      const c = component as any;
      c.currentMessageListener = { dispose: () => {} };
      c.currentDisposeListener = { dispose: () => {} };

      let listener: ((msg: any) => void) | null = null;
      const origShowPanel = c.showPanel.bind(c);
      c.showPanel = (t: string, f: string) => {
        const p = origShowPanel(t, f);
        const orig = p.webview.onDidReceiveMessage.bind(p.webview);
        p.webview.onDidReceiveMessage = (l: any, ...args: any[]) => {
          listener = l;
          return orig(l, ...args);
        };
        const origDispose = p.dispose.bind(p);
        p.dispose = () => {
          disposeCalled = true;
          origDispose();
        };
        return p;
      };
      c.addComment(commentService);
      listener!({ command: 'cancel', text: 'cancel' });
      assert.strictEqual(disposeCalled, false, 'panel should NOT be disposed on cancel');
    });

    test('on cancel: should NOT invoke onDidChange', () => {
      const commentService = { addComment: async () => {} };
      const listener = captureListener(component, commentService);
      onDidChangeCalls = 0;
      listener!({ command: 'cancel', text: 'cancel' });
      assert.strictEqual(onDidChangeCalls, 0, 'onDidChange should NOT be called on cancel');
    });

    test('on cancel: should dispose decoration', () => {
      let decorDisposed = false;
      const commentService = { addComment: async () => {} };
      const c = component as any;
      c.currentMessageListener = { dispose: () => {} };
      c.currentDisposeListener = { dispose: () => {} };

      let capturedListener: ((msg: any) => void) | null = null;
      const origShowPanel = c.showPanel.bind(c);
      c.showPanel = (t: string, f: string) => {
        const p = origShowPanel(t, f);
        const orig = p.webview.onDidReceiveMessage.bind(p.webview);
        p.webview.onDidReceiveMessage = (l: any, ...args: any[]) => {
          capturedListener = l;
          return orig(l, ...args);
        };
        return p;
      };

      c.addComment(commentService);
      c.currentAddDecoration = {
        dispose: () => {
          decorDisposed = true;
        },
      };
      capturedListener!({ command: 'cancel', text: 'cancel' });

      assert.ok(decorDisposed);
      assert.strictEqual(c.currentAddDecoration, null);
    });

    test('panel onDidDispose should clean up currentAddDecoration', () => {
      let decorDisposed = false;
      const disposeFns: Array<() => void> = [];
      const c = component as any;
      c.currentMessageListener = { dispose: () => {} };
      c.currentDisposeListener = { dispose: () => {} };

      const origShowPanel = c.showPanel.bind(c);
      c.showPanel = (t: string, f: string) => {
        const p = origShowPanel(t, f);
        const orig = p.onDidDispose.bind(p);
        p.onDidDispose = (fn: () => void) => {
          disposeFns.push(fn);
          return orig(fn);
        };
        return p;
      };
      c.addComment({ addComment: async () => {} });
      c.currentAddDecoration = {
        dispose: () => {
          decorDisposed = true;
        },
      };
      disposeFns.forEach((fn) => fn());
      assert.ok(decorDisposed, 'decoration should be disposed when panel closes');
      assert.strictEqual(c.currentAddDecoration, null);
    });

    test('addComment called twice: first submit then second addComment should get fresh editor', () => {
      const commentService = { addComment: async () => {} };
      const c = component as any;
      c.currentMessageListener = { dispose: () => {} };
      c.currentDisposeListener = { dispose: () => {} };

      // First call: capture listener and submit
      let listener1: ((msg: any) => void) | null = null;
      const origShowPanel = c.showPanel.bind(c);
      c.showPanel = (t: string, f: string) => {
        const p = origShowPanel(t, f);
        const orig = p.webview.onDidReceiveMessage.bind(p.webview);
        p.webview.onDidReceiveMessage = (l: any, ...args: any[]) => {
          listener1 = l;
          return orig(l, ...args);
        };
        return p;
      };
      c.addComment(commentService);
      listener1!({
        command: 'submit',
        text: JSON.stringify({ title: 'T', comment: 'desc', priority: 0, category: '', additional: '', private: 0 }),
      });

      // Change the stub to simulate file switch
      const editorStub2 = createEditorStub('/workspace/fileB.ts');
      (component as any).getWorkingEditor = () => editorStub2;
      (component as any).currentMessageListener = { dispose: () => {} };
      (component as any).currentDisposeListener = { dispose: () => {} };

      // Second addComment: showPanel should reveal the pre-warmed panel
      (component as any).addComment(commentService);
      assert.notStrictEqual(c.panel, null, 'should still have a panel (pre-warmed or new)');
    });
  });

  // ===================== editComment =====================
  suite('editComment', () => {
    test('should post comment data to webview', () => {
      let postMessageReceived: any = null;
      const origShowPanel = (component as any).showPanel.bind(component);
      (component as any).showPanel = (title: string, fileName: string) => {
        const panel = origShowPanel(title, fileName);
        panel.webview.postMessage = (msg: unknown) => {
          postMessageReceived = msg;
        };
        return panel;
      };
      (component as any).currentMessageListener = { dispose: () => {} };
      (component as any).currentDisposeListener = { dispose: () => {} };

      const mockComment = {
        sha: 'abc123',
        filename: '/workspace/test.ts',
        url: '',
        lines: '1:0-3:4',
        title: 'My Title',
        comment: 'My Comment',
        priority: 2,
        category: 'Bug',
        additional: 'extra info',
        private: 0,
        id: 'test-uuid',
      };

      (component as any).editComment(
        { updateComment: async () => {} },
        [new Range(new Position(0, 0), new Position(3, 4))],
        mockComment,
      );

      assert.ok(postMessageReceived?.comment, 'should contain comment data');
      assert.strictEqual(postMessageReceived.command, 'populate', 'should use populate command');
      assert.strictEqual(postMessageReceived.comment.title, 'My Title');
    });

    test('should dispose panel on submit when closePanelAfterEdit is true', () => {
      (component as any).closePanelAfterEdit = true;
      let disposeCalled = false;
      let capturedListener: ((msg: any) => void) | null = null;
      const origShowPanel = (component as any).showPanel.bind(component);
      (component as any).showPanel = (t: string, f: string) => {
        const p = origShowPanel(t, f);
        const orig = p.webview.onDidReceiveMessage.bind(p.webview);
        p.webview.onDidReceiveMessage = (l: any, ...args: any[]) => {
          capturedListener = l;
          return orig(l, ...args);
        };
        const origDispose = p.dispose.bind(p);
        p.dispose = () => {
          disposeCalled = true;
          origDispose();
        };
        return p;
      };
      (component as any).currentMessageListener = { dispose: () => {} };
      (component as any).currentDisposeListener = { dispose: () => {} };

      const mockComment = {
        sha: '',
        filename: '',
        url: '',
        lines: '',
        title: '',
        comment: 'x',
        priority: 0,
        category: '',
        additional: '',
        private: 0,
        id: '',
      };
      (component as any).editComment({ updateComment: async () => {} }, [new Range(0, 0, 0, 0)], mockComment);
      capturedListener!({
        command: 'submit',
        text: JSON.stringify({ title: 'T', comment: 'C', priority: 0, category: '', additional: '', private: 0 }),
      });
      assert.ok(disposeCalled, 'editComment should still dispose panel on submit');
    });
  });

  // ===================== resetAutoClose =====================
  suite('resetAutoClose', () => {
    test('should set a timer that disposes the panel', (done) => {
      const originalMs = (component as any).AUTO_CLOSE_MS;
      (component as any).AUTO_CLOSE_MS = 50;

      let disposeCalled = false;
      (component as any).showPanel('Test', '/test.ts');
      const panel = (component as any).panel;
      const origDispose = panel.dispose.bind(panel);
      panel.dispose = () => {
        disposeCalled = true;
        origDispose();
      };

      setTimeout(() => {
        assert.ok(disposeCalled, 'panel should be auto-disposed after timeout');
        (component as any).AUTO_CLOSE_MS = originalMs;
        done();
      }, 100);
    });
  });
});
