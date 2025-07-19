// Background script for ClipNest
// Handles clipboard monitoring and storage management

class ClipboardManager {
  constructor() {
    this.lastClipboardContent = '';
    this.isMonitoring = true;
    this.offscreenCreated = false;
    this.init();
  }

  async init() {
    console.log('ClipNest background script initialized');
    
    // Create offscreen document for clipboard access
    await this.ensureOffscreenDocument();
    
    // Add some test data for debugging
    await this.addTestData();
    
    // Start monitoring clipboard changes
    await this.startClipboardMonitoring();
    
    // Clean up old clips periodically
    this.scheduleCleanup();
    
    // Listen for messages from content script, popup, and offscreen document
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });

    // Handle extension startup
    chrome.runtime.onStartup.addListener(() => {
      this.init();
    });

    // Handle extension install
    chrome.runtime.onInstalled.addListener(() => {
      this.init();
    });
  }

  async ensureOffscreenDocument() {
    try {
      // Check if offscreen document already exists
      const clients = await chrome.runtime.getContexts({});
      const offscreenClient = clients.find(client => client.contextType === 'OFFSCREEN_DOCUMENT');
      
      if (!offscreenClient) {
        console.log('Creating offscreen document...');
        try {
          await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL('offscreen.html'),
            reasons: ['CLIPBOARD'],
            justification: 'Access clipboard for capturing and managing copied text'
          });
          this.offscreenCreated = true;
          
          // Give the offscreen document time to initialize
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log('Offscreen document created successfully');
        } catch (createError) {
          console.error('Failed to create offscreen document:', createError);
          this.offscreenCreated = false;
          throw createError;
        }
      } else {
        this.offscreenCreated = true;
        console.log('Offscreen document already exists');
      }
    } catch (error) {
      console.error('Error with offscreen document:', error);
      console.error('Chrome offscreen API available:', !!chrome.offscreen);
      this.offscreenCreated = false;
      
      // Don't throw - let extension continue with limited functionality
      console.warn('Extension will run with limited clipboard access');
    }
  }

  async addTestData() {
    // Add some test clipboard items for debugging
    try {
      const testItems = [
        {
          id: Date.now().toString(),
          text: 'https://example.com',
          timestamp: new Date().toISOString(),
          type: 'URL',
          isPinned: false
        },
        {
          id: (Date.now() + 1).toString(),
          text: 'This is a test text copied to clipboard',
          timestamp: new Date().toISOString(),
          type: 'Text',
          isPinned: false
        }
      ];
      
      await chrome.storage.local.set({ clipboardHistory: testItems });
      console.log('Test data added:', testItems.length, 'items');
    } catch (error) {
      console.error('Error adding test data:', error);
    }
  }

  async startClipboardMonitoring() {
    if (!this.offscreenCreated) {
      console.log('Offscreen document not ready, attempting to create...');
      await this.ensureOffscreenDocument();
      
      if (!this.offscreenCreated) {
        console.warn('Cannot start clipboard monitoring - offscreen document unavailable');
        return;
      }
    }

    try {
      // Start monitoring via offscreen document
      const response = await chrome.runtime.sendMessage({
        action: 'startMonitoring'
      });
      
      if (response && response.success) {
        console.log('Clipboard monitoring started via offscreen document');
      } else {
        console.error('Failed to start monitoring:', response?.error);
      }
      
      // Also get initial clipboard content
      await this.checkInitialClipboard();
      
    } catch (error) {
      console.error('Error starting clipboard monitoring:', error);
      console.error('Will retry in 5 seconds...');
      
      // Retry after delay
      setTimeout(() => {
        this.startClipboardMonitoring();
      }, 5000);
    }
  }

  async checkInitialClipboard() {
    try {
      console.log('Checking initial clipboard content...');
      const response = await chrome.runtime.sendMessage({
        action: 'readClipboard'
      });
      
      if (response && response.success && response.text) {
        console.log('Initial clipboard content detected, length:', response.text.length);
        await this.saveClipboardItem(response.text);
      } else if (response && !response.success) {
        console.warn('Could not read initial clipboard:', response.error);
      } else {
        console.log('No initial clipboard content');
      }
    } catch (error) {
      console.warn('Could not check initial clipboard:', error.message);
    }
  }

  async saveClipboardItem(text) {
    if (!text || text.trim().length === 0) return;
    
    const trimmedText = text.trim();
    
    // Avoid saving the same content repeatedly
    if (trimmedText === this.lastClipboardContent) {
      return;
    }
    
    this.lastClipboardContent = trimmedText;

    const clipItem = {
      id: Date.now().toString(),
      text: trimmedText,
      timestamp: new Date().toISOString(),
      type: this.detectContentType(trimmedText),
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
          if (this.isMonitoring) {
            await this.saveClipboardItem(message.text);
          }
          sendResponse({ success: true });
          break;

        case 'clipboardChanged':
          // Message from offscreen document when clipboard changes
          if (this.isMonitoring) {
            await this.saveClipboardItem(message.text);
          }
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
      
      // Use offscreen document for clipboard writing
      if (this.offscreenCreated) {
        await chrome.runtime.sendMessage({
          action: 'writeClipboard',
          text: text
        });
      } else {
        // Fallback: send a message to the active tab to perform the copy
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'copyText',
            text: text
          });
        }
      }
      
      // Re-enable monitoring after a short delay
      setTimeout(() => {
        this.isMonitoring = true;
      }, 2000);
      
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
