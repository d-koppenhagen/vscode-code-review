# Development notes

## publishing a new version

### Visual Studio Code Marketplace

```bash
npm run publish
```

### Open VSX Registry

You can obtain an access token for the Open VSX Registry [here](https://open-vsx.org/user-settings/tokens).

```bash
npm run publish:ovsx -- -p <your-open-vsx-registry-access-token>
```


## Debug Webview

To debug the webview, run the extension, open the command input and enter:

```
Developer: Toggle Developer Tools
```
