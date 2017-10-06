# quiver-to-markdown

Convert Quiver Notebooks to Markdown/Jekyll

# Usage

`node index.js ~/path/to/Quiver.qvlibrary ~/output/folder`

The output folder will default to `${HOME}/Documents` if it is not passed

# Watchman Integration

Works great with [Watchman](https://facebook.github.io/watchman/) for keeping our notes updated automatically.
Notes will output to `$HOME/Documents/quiver-to-markdown`

```bash
brew update && brew install watchman
watchman watch-project ~/path/to/Quiver.qvlibrary
watchman -j <<-EOT
["trigger", "$HOME/path/to/Quiver.qvlibrary", {
  "name": "to-markdown",
  "expression": ["pcre", ".json$"],
  "command": ["$HOME/path/to/quiver-to-markdown/index.js"]
}]
```
