// Background script for ClipNest
// Handles clipboard monitoring and storage management

class ClipboardManager {
  constructor() {
    this.lastClipboardContent = '';
    this.isMonitoring = true;
    this.init();
  }

  async init() {
    console.log('ClipNest background script initialized');
    
    // Start monitoring clipboard changes
    this.startClipboardMonitoring();
    
    // Clean up old clips periodically
    this.scheduleCleanup();
    
    // Listen for messages from content script and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });
  }

  async startClipboardMonitoring() {
    // Check clipboard every 500ms
    setInterval(async () => {
      if (this.isMonitoring) {
        await this.checkClipboard();
      }
    }, 500);
  }

  async checkClipboard() {
    try {
      // Read from clipboard
      const clipboardText = await navigator.clipboard.readText();
      
      if (clipboardText && clipboardText !== this.lastClipboardContent) {
        this.lastClipboardContent = clipboardText;
        await this.saveClipboardItem(clipboardText);
      }
    } catch (error) {
      // Clipboard access might be restricted, this is expected in background
      console.log('Clipboard check failed (expected in background):', error.message);
    }
  }

  async saveClipboardItem(text) {
    if (!text || text.trim().length === 0) return;

    const clipItem = {
      id: Date.now().toString(),
      text: text.trim(),
      timestamp: new Date().toISOString(),
      type: this.detectContentType(text),
      isPinned: false
    };

    try {
      // Get existing clips
      const result = await chrome.storage.local.get(['clipboardHistory']);
      const history = result.clipboardHistory || [];

      // Check if this text already exists (avoid duplicates)
      const existingIndex = history.findIndex(item => item.text === clipItem.text);
      
      if (existingIndex !== -1) {
        // Update timestamp of existing item and move to top
        history[existingIndex].timestamp = clipItem.timestamp;
        const [existingItem] = history.splice(existingIndex, 1);
        history.unshift(existingItem);
      } else {
        // Add new item to the beginning
        history.unshift(clipItem);
      }

      // Keep only the latest 1000 items (excluding pinned)
      const pinnedItems = history.filter(item => item.isPinned);
      const unpinnedItems = history.filter(item => !item.isPinned).slice(0, 1000);
      const finalHistory = [...pinnedItems, ...unpinnedItems];

      // Save to storage
      await chrome.storage.local.set({ clipboardHistory: finalHistory });
      
      console.log('Saved clipboard item:', clipItem.type, clipItem.text.substring(0, 50) + '...');
      
      // Notify popup if open
      this.notifyPopup();
      
    } catch (error) {
      console.error('Error saving clipboard item:', error);
    }
  }

  detectContentType(text) {
    // URL detection
    const urlRegex = /^https?:\/\/[^\s]+$/i;
    if (urlRegex.test(text)) {
      return 'URL';
    }

    // Email detection
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(text)) {
      return 'Email';
    }

    // Code detection (basic heuristics)
    const codeIndicators = [
      /^\s*[\{\[\(].*[\}\]\)]\s*$/s, // Brackets
      /^\s*(function|class|def|var|let|const|import|export)/m, // Keywords
      /^\s*<.*>.*<\/.*>/s, // HTML/XML
      /^\s*[\w-]+\s*:\s*[^;]+;/m, // CSS
      /^\s*\{.*\}\s*$/s // JSON-like
    ];
    
    if (codeIndicators.some(regex => regex.test(text))) {
      return 'Code';
    }

    // Phone number detection
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    if (phoneRegex.test(text)) {
      return 'Phone';
    }

    // Default to text
    return 'Text';
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'getClipboardHistory':
          const result = await chrome.storage.local.get(['clipboardHistory']);
          sendResponse({ success: true, data: result.clipboardHistory || [] });
          break;

        case 'copyToClipboard':
          await this.copyToClipboard(message.text);
          sendResponse({ success: true });
          break;

        case 'deleteClip':
          await this.deleteClip(message.id);
          sendResponse({ success: true });
          break;

        case 'pinClip':
          await this.togglePin(message.id, message.pinned);
          sendResponse({ success: true });
          break;

        case 'clearHistory':
          await this.clearHistory();
          sendResponse({ success: true });
          break;

        case 'clipboardCaptured':
          // Message from content script when copy event detected
          await this.saveClipboardItem(message.text);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async copyToClipboard(text) {
    try {
      // Temporarily disable monitoring to prevent duplicate
      this.isMonitoring = false;
      
      // For background script, we need to use a different approach
      // We'll send a message to the active tab to perform the copy
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'copyText',
          text: text
        });
      }
      
      // Re-enable monitoring after a short delay
      setTimeout(() => {
        this.isMonitoring = true;
      }, 1000);
      
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      this.isMonitoring = true;
      throw error;
    }
  }

  async deleteClip(id) {
    const result = await chrome.storage.local.get(['clipboardHistory']);
    const history = result.clipboardHistory || [];
    const updatedHistory = history.filter(item => item.id !== id);
    await chrome.storage.local.set({ clipboardHistory: updatedHistory });
    this.notifyPopup();
  }

  async togglePin(id, pinned) {
    const result = await chrome.storage.local.get(['clipboardHistory']);
    const history = result.clipboardHistory || [];
    const item = history.find(item => item.id === id);
    if (item) {
      item.isPinned = pinned;
      await chrome.storage.local.set({ clipboardHistory: history });
      this.notifyPopup();
    }
  }

  async clearHistory() {
    const result = await chrome.storage.local.get(['clipboardHistory']);
    const history = result.clipboardHistory || [];
    // Keep only pinned items
    const pinnedItems = history.filter(item => item.isPinned);
    await chrome.storage.local.set({ clipboardHistory: pinnedItems });
    this.notifyPopup();
  }

  notifyPopup() {
    // Try to notify popup if it's open
    chrome.runtime.sendMessage({ action: 'historyUpdated' }).catch(() => {
      // Popup might not be open, ignore error
    });
  }

  scheduleCleanup() {
    // Clean up old items every hour
    setInterval(async () => {
      await this.cleanupOldItems();
    }, 60 * 60 * 1000);
  }

  async cleanupOldItems() {
    const result = await chrome.storage.local.get(['clipboardHistory']);
    const history = result.clipboardHistory || [];
    
    // Remove unpinned items older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cleanedHistory = history.filter(item => {
      return item.isPinned || new Date(item.timestamp) > thirtyDaysAgo;
    });

    if (cleanedHistory.length !== history.length) {
      await chrome.storage.local.set({ clipboardHistory: cleanedHistory });
      console.log(`Cleaned up ${history.length - cleanedHistory.length} old clipboard items`);
    }
  }
}

// Initialize the clipboard manager
new ClipboardManager();
