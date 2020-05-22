import { window, ViewColumn, ExtensionContext } from 'vscode';
import { ReviewCommentService } from './review-comment';
import { ReviewComment } from './interfaces';

export class WebViewComponent {
  constructor(public context: ExtensionContext) {}
  addComment(commentService: ReviewCommentService) {
    // initialize new web tab
    const panel = window.createWebviewPanel(
      'text',
      'Add code review comment',
      { viewColumn: ViewColumn.Beside },
      {
        enableScripts: true,
      },
    );

    panel.webview.html = this.getWebviewContent();
    // const pathToHtml = Uri.file(path.join(this.context.extensionPath, 'src', 'webview.html'));
    // const pathUri = pathToHtml.with({ scheme: 'vscode-resource' });
    // panel.webview.html = fs.readFileSync(pathUri.fsPath, 'utf8');

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'submit':
            const comment = JSON.parse(message.text) as ReviewComment;
            commentService.addComment(comment);
            panel.dispose();
            return;
          case 'cancel':
            panel.dispose();
            return;
        }
      },
      undefined,
      this.context.subscriptions,
    );
  }

  getWebviewContent() {
    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Add code review note</title>
        <style>
          /* Style inputs */
          input,
          select,
          textarea {
            width: 100%;
            padding: 10px;
            margin: 8px 0;
            display: inline-block;
            border: 1px solid #ccc;
            border-radius: 0px;
            box-sizing: border-box;
          }
    
          body.vscode-light {
            color: black;
          }
    
          body.vscode-dark {
            color: white;
          }
    
          form.note-form {
            padding-top: 20px;
          }
    
          .action-btn {
            border: none;
            width: auto;
            padding: 2px 14px;
            height: 30px;
            display: inline-block;
            font-size: 14px;
            font-weight: 400;
            line-height: 1.42857143;
            text-align: center;
            white-space: nowrap;
            vertical-align: middle;
            user-select: none;
          }
          .action-btn:disabled {
            background-color: rgb(239, 240, 241);
            cursor: not-allowed;
            color: black;
          }
    
          .primary {
            color: var(--vscode-button-foreground);
            background-color: var(--vscode-button-background);
          }
          .primary:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
    
          .secondary {
            color: var(--vscode-button-prominentForeground);
            background-color: var(--vscode-button-prominentBackground);
          }
          .secondary:hover {
            background-color: var(--vscode-button-prominentHoverBackground);
          }
    
          /* traffic light */
          #traffic-light {
            display: block;
            background-color: #333;
            width: 50px;
            height: 130px;
            border-radius: 15px;
          }
          input.traffic-light-color {
            appearance: none;
            position: relative;
            top: 10px;
            width: 30px;
            height: 30px;
            margin-top: 10px;
            margin-left: 10px;
            background-color: grey;
            vertical-align: middle;
            border-radius: 100%;
            display: block;
            user-select: none;
            outline: none;
          }
          input#high {
            background-color: #b30000;
          }
          input#high:checked {
            background-color: #ff0000;
            box-shadow: 0 0 3em #ff3333;
          }
          input#medium {
            background-color: #b2b300;
          }
          input#medium:checked {
            background-color: #ffff00;
            box-shadow: 0 0 3em #ffff33;
          }
          input#low {
            background-color: #00b300;
          }
          input#low:checked {
            background-color: #00ff00;
            box-shadow: 0 0 3em #33ff33;
          }
    
          /* form arrangement */
          .form-container {
            display: flex;
          }
    
          .col-right {
            padding-left: 20px;
            justify-self: center;
          }
        </style>
      </head>
    
      <body>
        <form class="note-form">
          <div class="form-container">
            <div class="col-left">
              <label for="title">Title</label>
              <input id="title" name="title" type="text" placeholder="A short description (e.g. 'Method too complex')" />
    
              <label for="description">Description</label>
              <textarea
                id="description"
                name="description"
                placeholder="A detailled description (e.g. 'Split method into smaller functions and utils')"
                rows="5"
              ></textarea>
    
              <label for="additional">Additional Info</label>
              <input
                id="additional"
                name="additional"
                type="text"
                placeholder="An additional info or Link (e.g. 'http://example.com')"
              />
            </div>
            <div class="col-right">
              <label for="priority">Priority</label>
    
              <div id="traffic-light">
                <input type="radio" class="traffic-light-color" name="traffic-light-color" id="high" value="3" />
                <input type="radio" class="traffic-light-color" name="traffic-light-color" id="medium" value="2" />
                <input type="radio" class="traffic-light-color" name="traffic-light-color" id="low" value="1" />
              </div>
            </div>
          </div>
          <button class="action-btn primary" tabindex="0" role="button" onclick="addNote()">
            Add Note
          </button>
    
          <button class="action-btn secondary" tabindex="0" role="button" onclick="cancel()">
            Cancel
          </button>
        </form>
      </body>
    
      <script>
        function addNote() {
          const vscode = acquireVsCodeApi();
    
          const title = document.getElementById('title').value;
          const description = document.getElementById('description').value;
          const trafficLightEl = document.querySelector('input[name=traffic-light-color]:checked');
          const priority = trafficLightEl ? document.querySelector('input[name=traffic-light-color]:checked').value : 0;
          const additional = document.getElementById('additional').value;
    
          const formData = {
            title,
            description,
            priority,
            additional,
          };
    
          vscode.postMessage({
            command: 'submit',
            text: JSON.stringify(formData),
          });
        }
    
        function cancel() {
          const vscode = acquireVsCodeApi();
    
          vscode.postMessage({
            command: 'cancel',
            text: 'cancel',
          });
        }
      </script>
    </html>
    `;
  }
}
