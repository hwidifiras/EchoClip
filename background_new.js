// ClipNest Background Script - Simplified and Robust Version
// Addresses the complexity and reliability issues in the original implementation

class ClipboardManager {
  constructor() {
    this.lastClipboardContent = '';
    this.isMonitoring = false;
    this.offscreenReady = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.monitoringInterval = null;
    this.debugMode = true;
    this.init();
  }

  log(message, ...args) {
    if (this.debugMode) {
      console.log(`[ClipNest Background] ${message}`, ...args);
    }
  }

  error(message, error, ...args) {
    console.error(`[ClipNest Background ERROR] ${message}`, error, ...args);
  }

  async init() {
    this.log('Initializing ClipNest background script...');
    
    try {
      // Set up message listener first
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Keep the message channel open for async responses
      });

      // Initialize offscreen document
      await this.initializeOffscreen();
      
      // Start monitoring if offscreen is ready
      if (this.offscreenReady) {
        await this.startMonitoring();
      }
      
      // Add test data for debugging
      await this.addTestData();
      
      this.log('ClipNest background script initialized successfully');
      
    } catch (error) {
      this.error('Failed to initialize background script:', error);
    }
  }

  async initializeOffscreen() {
    try {
      this.log('Initializing offscreen document...');
      
      // Check if offscreen document already exists
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      
      if (existingContexts.length > 0) {
        this.log('Offscreen document already exists');
        this.offscreenReady = true;
        return;
      }

      // Create new offscreen document
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['CLIPBOARD'],
        justification: 'Access clipboard for capturing and managing copied text'
      });
      
      // Wait for offscreen document to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.offscreenReady = true;
      this.retryCount = 0;
      this.log('Offscreen document created successfully');
      
    } catch (error) {
      this.error('Failed to create offscreen document:', error);
      this.offscreenReady = false;
      
      // Retry with exponential backoff
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.pow(2, this.retryCount) * 1000;
        this.log(`Retrying offscreen creation in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => this.initializeOffscreen(), delay);
      } else {
        this.error('Max retries reached for offscreen document creation');
      }
    }
  }

  async startMonitoring() {
    if (!this.offscreenReady) {
      this.log('Cannot start monitoring - offscreen document not ready');
      return;
    }

    if (this.isMonitoring) {
      this.log('Monitoring already active');
      return;
    }

    try {
      this.log('Starting clipboard monitoring...');
      
      // Get initial clipboard content
      await this.checkInitialClipboard();
      
      // Start periodic monitoring (simplified approach)
      this.monitoringInterval = setInterval(async () => {
        await this.checkClipboard();
      }, 2000); // Check every 2 seconds
      
      this.isMonitoring = true;
      this.log('Clipboard monitoring started');
      
    } catch (error) {
      this.error('Failed to start monitoring:', error);
    }
  }

  async stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    this.log('Clipboard monitoring stopped');
  }

  async checkInitialClipboard() {
    try {
      const response = await this.sendToOffscreen('readClipboard');
      if (response?.success && response.text) {
        await this.saveClipboardItem(response.text);
      }
    } catch (error) {
      this.log('Could not check initial clipboard (normal):', error.message);
    }
  }

  async checkClipboard() {
    try {
      const response = await this.sendToOffscreen('readClipboard');
      if (response?.success && response.text) {
        const content = response.text.trim();
        if (content && content !== this.lastClipboardContent) {
          this.lastClipboardContent = content;
          await this.saveClipboardItem(content);
        }
      }
    } catch (error) {
      // Clipboard access failures are normal, don't spam logs
      if (this.debugMode) {
        console.log('[ClipNest] Clipboard check failed (normal):', error.message);
      }
    }
  }

  async sendToOffscreen(action, data = {}) {
    if (!this.offscreenReady) {
      throw new Error('Offscreen document not ready');
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: action,
        ...data
      });
      
      if (!response?.success) {
        throw new Error(response?.error || 'Unknown offscreen error');
      }
      
      return response;
    } catch (error) {
      this.error(`Failed to send message to offscreen (${action}):`, error);
      
      // If offscreen communication fails, try to reinitialize
      if (error.message.includes('receiving end does not exist')) {
        this.log('Offscreen document seems to have died, reinitializing...');
        this.offscreenReady = false;
        await this.initializeOffscreen();
      }
      
      throw error;
    }
  }

  async saveClipboardItem(text) {
    if (!text || text.trim().length === 0) return;

    const clipItem = {
      id: Date.now().toString(),
      text: text.trim(),
      timestamp: new Date().toISOString(),
      type: this.detectContentType(text.trim()),
      isPinned: false
    };

    try {
      // Get existing clips
      const result = await chrome.storage.local.get(['clipboardHistory']);
      const history = result.clipboardHistory || [];

      // Check for duplicates
      const existingIndex = history.findIndex(item => item.text === clipItem.text);
      
      if (existingIndex !== -1) {
        // Update timestamp and move to top
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
      
      this.log(`Saved clipboard item: ${clipItem.type} - ${clipItem.text.substring(0, 50)}...`);
      
      // Notify popup if open
      this.notifyPopup();
      
    } catch (error) {
      this.error('Error saving clipboard item:', error);
    }
  }

  detectContentType(text) {
    // URL detection
    if (/^https?:\/\/[^\s]+$/i.test(text)) return 'URL';
    
    // Email detection
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return 'Email';
    
    // Phone number detection
    if (/^\+?[\d\s\-\(\)]{10,}$/.test(text)) return 'Phone';
    
    // Code detection (basic heuristics)
    const codeIndicators = [
      /^\s*[\{\[\(].*[\}\]\)]\s*$/s,
      /^\s*(function|class|def|var|let|const|import|export)/m,
      /^\s*<.*>.*<\/.*>/s,
      /^\s*[\w-]+\s*:\s*[^;]+;/m,
      /^\s*\{.*\}\s*$/s
    ];
    
    if (codeIndicators.some(regex => regex.test(text))) return 'Code';
    
    return 'Text';
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      this.log('Received message:', message.action);
      
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
          // From content script - simplified handling
          if (message.text && message.text.trim()) {
            await this.saveClipboardItem(message.text.trim());
          }
          sendResponse({ success: true });
          break;

        default:
          this.log('Unknown action:', message.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      this.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async copyToClipboard(text) {
    try {
      // Temporarily disable monitoring to prevent duplicate
      const wasMonitoring = this.isMonitoring;
      if (wasMonitoring) {
        await this.stopMonitoring();
      }
      
      // Use offscreen document for clipboard writing
      await this.sendToOffscreen('writeClipboard', { text: text });
      
      // Re-enable monitoring after a delay
      setTimeout(async () => {
        if (wasMonitoring) {
          await this.startMonitoring();
        }
      }, 2000);
      
    } catch (error) {
      this.error('Error copying to clipboard:', error);
      // Re-enable monitoring on error
      if (this.isMonitoring === false) {
        await this.startMonitoring();
      }
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
    const pinnedItems = history.filter(item => item.isPinned);
    await chrome.storage.local.set({ clipboardHistory: pinnedItems });
    this.notifyPopup();
  }

  notifyPopup() {
    chrome.runtime.sendMessage({ action: 'historyUpdated' }).catch(() => {
      // Popup might not be open, ignore error
    });
  }

  async addTestData() {
    try {
      const result = await chrome.storage.local.get(['clipboardHistory']);
      if (!result.clipboardHistory || result.clipboardHistory.length === 0) {
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
            text: 'Welcome to ClipNest! This clipboard manager is now working.',
            timestamp: new Date().toISOString(),
            type: 'Text',
            isPinned: true
          }
        ];
        
        await chrome.storage.local.set({ clipboardHistory: testItems });
        this.log('Added test data for debugging');
      }
    } catch (error) {
      this.error('Error adding test data:', error);
    }
  }
}

// Extension lifecycle handlers
chrome.runtime.onInstalled.addListener(() => {
  console.log('ClipNest installed/updated');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('ClipNest starting up');
});

// Initialize the clipboard manager
const clipboardManager = new ClipboardManager();
