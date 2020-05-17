# vscode-code-review

[![VSCode Marketplace](https://vsmarketplacebadge.apphb.com/version/d-koppenhagen.vscode-code-review.svg)](https://marketplace.visualstudio.com/items?itemName=d-koppenhagen.vscode-code-review)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=102)](https://github.com/ellerbrock/open-source-badge/)

This extension allows you to create a code review file you can hand over to a customer.

## Features

Simply right click somewhere in the opened file and choose the option "Code Review: Add Note".
You will be prompted for your note you wanna add.
A file `code-review.csv` will be created containing your comments and the file and line references.

The result will look like this:

```csv
filename,lines,title,comment,priority,additional
"/test/a.txt","1:2-4:3","foo","this should be refactored",1,"see http://foo.bar"
"/test/a.txt","1:0-1:4|4:0-4:3","bar","wrong format",1,""
```

The line column indicates an array of selected ranges or cursor positions separated by a `|` sign.
E.g. `"1:0-1:4|4:0-4:3"` means that the comment is related to the range marked from line 1 position 0 to line 1 position 4 and line 4 position 0 to line 4 position 3.

![Demo](./images/demo.gif)

## Extension Settings

Currently there are no settings to configure.

## Future Features

* Overview of the notes in the left explorer area
* generate a report (e.g. PDF)
* Add priorities
* allow general comments
* edit existing comments
* delete existing comments
* color mark lines that already have been commented (shot preview of the message)
* include GIT SHA
* Define a shortcut
* include the marked code in the review report as code snippets


**Enjoy!**
