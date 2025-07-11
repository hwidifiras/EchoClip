# ClipNest - Chrome Extension Clipboard Manager

ClipNest is a powerful clipboard manager for Chrome that captures every copied text inside the browser, providing a searchable history with the ability to pin important clips and manage clipboard data efficiently.

## Features

- **Automatic Clipboard Capture**: Monitors all copy operations within the browser
- **Searchable History**: Quickly find previously copied text
- **Smart Content Detection**: Automatically categorizes copied content (URLs, emails, code, phone numbers, text)
- **Pin Important Clips**: Keep important clipboard items pinned for easy access
- **Auto-cleanup**: Automatically removes old clipboard items (configurable)
- **Modern UI**: Beautiful, responsive popup interface
- **Keyboard Shortcuts**: Quick access with Ctrl+F for search and Escape to close panels

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the ClipNest folder
4. The extension will be installed and ready to use

## Icon Requirements

The extension needs icon files in the `icons/` directory:
- `icon16.png` (16x16 pixels)
- `icon32.png` (32x32 pixels) 
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can create these icons or use any PNG images with the appropriate dimensions.

## Usage

1. **Copy text anywhere in the browser** - ClipNest automatically captures it
2. **Click the extension icon** to open the clipboard history
3. **Click any item** to copy it back to your clipboard
4. **Pin important items** using the pin button (📌/📍)
5. **Search through history** using the search button (🔍)
6. **Delete items** you no longer need
7. **Clear all** unpinned items when needed

## Architecture

### Components

1. **manifest.json**: Extension configuration and permissions
2. **background.js**: Service worker that handles clipboard monitoring and storage
3. **content.js**: Injected script that captures copy events on web pages
4. **popup.html/css/js**: User interface for managing clipboard history

### How It Works

1. **Content Script** monitors copy events and keyboard shortcuts (Ctrl+C) on all web pages
2. **Background Script** receives clipboard data, detects content type, and stores it in Chrome's local storage
3. **Popup Interface** displays the clipboard history and provides management features
4. **Storage Management** keeps the latest 1000 items and automatically cleans up old entries

### Data Flow

```
Web Page Copy Event → Content Script → Background Script → Chrome Storage
                                                          ↓
                                              Popup Interface ← User Interaction
```

### Storage Structure

Each clipboard item contains:
- `id`: Unique timestamp-based identifier
- `text`: The copied text content
- `timestamp`: When the item was copied
- `type`: Content type (URL, Email, Code, Phone, Text)
- `isPinned`: Whether the item is pinned

## Permissions Explained

- `storage`: To save clipboard history locally
- `activeTab`: To interact with the current tab for copying
- `clipboardRead/Write`: To read from and write to the clipboard
- `<all_urls>`: To monitor copy events on all websites

## Development

The extension is built with:
- Manifest V3 for modern Chrome extension standards
- Vanilla JavaScript (no external dependencies)
- Chrome Extension APIs for storage and messaging
- Modern CSS with gradient themes and smooth animations

## Security & Privacy

- All data is stored locally in Chrome's storage (no external servers)
- Only text content is captured (no images or files)
- No data is transmitted over the internet
- Users have full control over their clipboard data

## Future Enhancements

- Export/import clipboard history
- Cloud sync capabilities
- Custom content type detection rules
- Keyboard shortcuts for quick access
- Clipboard statistics and analytics
