// Offscreen document for ClipNest - Improved Version
// Handles clipboard operations with enhanced reliability and error handling

class OffscreenClipboard {
  constructor() {
    this.lastClipboardContent = '';
    this.debugMode = true;
    this.isInitialized = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.init();
  }

  log(message, ...args) {
    if (this.debugMode) {
      console.log(`[ClipNest Offscreen] ${message}`, ...args);
    }
  }

  error(message, error, ...args) {
    console.error(`[ClipNest Offscreen ERROR] ${message}`, error, ...args);
  }

  async init() {
    this.log('Offscreen document initializing...');
    
    try {
      // Check if we're in the right context
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        throw new Error('Chrome runtime not available');
      }

      // Check if clipboard API is available
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }

      // Set up message listener
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Keep the message channel open for async responses
      });

      // Test clipboard access
      await this.testClipboardAccess();
      
      this.isInitialized = true;
      this.retryCount = 0;
      this.log('Offscreen document initialized successfully');
      
      // Notify background that we're ready
      this.notifyReady();
      
    } catch (error) {
      this.error('Failed to initialize offscreen document:', error);
      this.isInitialized = false;
      
      // Retry initialization
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.pow(2, this.retryCount) * 500;
        this.log(`Retrying initialization in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => this.init(), delay);
      } else {
        this.error('Max retries reached for offscreen initialization');
      }
    }
  }

  async testClipboardAccess() {
    try {
      // Test if we can read clipboard (this might fail but that's okay)
      await navigator.clipboard.readText();
      this.log('Clipboard read access confirmed');
    } catch (error) {
      // This is normal - many sites restrict clipboard read
      this.log('Clipboard read access restricted (normal):', error.message);
    }
    
    try {
      // Test if we can write to clipboard
      const testText = 'ClipNest test';
      await navigator.clipboard.writeText(testText);
      this.log('Clipboard write access confirmed');
    } catch (error) {
      throw new Error(`Clipboard write access failed: ${error.message}`);
    }
  }

  notifyReady() {
    try {
      chrome.runtime.sendMessage({
        action: 'offscreenReady'
      }).catch(() => {
        // Background script might not be listening yet
        this.log('Could not notify background script (normal during startup)');
      });
    } catch (error) {
      this.log('Failed to notify background script:', error.message);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      this.log('Received message:', message.action);
      
      if (!this.isInitialized) {
        sendResponse({ 
          success: false, 
          error: 'Offscreen document not initialized' 
        });
        return;
      }
      
      switch (message.action) {
        case 'readClipboard':
          const text = await this.readClipboard();
          sendResponse({ success: true, text: text });
          break;

        case 'writeClipboard':
          await this.writeClipboard(message.text);
          sendResponse({ success: true });
          break;

        case 'startMonitoring':
          await this.startMonitoring();
          sendResponse({ success: true });
          break;

        case 'stopMonitoring':
          await this.stopMonitoring();
          sendResponse({ success: true });
          break;

        case 'ping':
          // Health check
          sendResponse({ success: true, status: 'ready' });
          break;

        default:
          this.log('Unknown action:', message.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      this.error('Error handling message:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        action: message.action 
      });
    }
  }

  async readClipboard() {
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }
      
      const text = await navigator.clipboard.readText();
      this.log('Successfully read clipboard, length:', text ? text.length : 0);
      return text || '';
    } catch (error) {
      // Enhance error information
      const errorInfo = {
        message: error.message,
        name: error.name,
        clipboardAvailable: !!navigator.clipboard,
        documentFocused: document.hasFocus(),
        documentVisible: !document.hidden
      };
      
      this.log('Clipboard read failed (may be normal):', errorInfo);
      throw new Error(`Clipboard read failed: ${error.message}`);
    }
  }

  async writeClipboard(text) {
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }
      
      if (!text || typeof text !== 'string') {
        throw new Error('Invalid text provided for clipboard write');
      }
      
      await navigator.clipboard.writeText(text);
      this.log('Successfully wrote to clipboard, length:', text.length);
      
      // Update our last known content to prevent duplicate detection
      this.lastClipboardContent = text;
      
    } catch (error) {
      // Enhance error information
      const errorInfo = {
        message: error.message,
        name: error.name,
        textLength: text ? text.length : 0,
        clipboardAvailable: !!navigator.clipboard,
        documentFocused: document.hasFocus(),
        documentVisible: !document.hidden
      };
      
      this.error('Clipboard write failed:', errorInfo);
      throw new Error(`Clipboard write failed: ${error.message}`);
    }
  }

  async startMonitoring() {
    this.log('Starting clipboard monitoring...');
    
    // Stop any existing monitoring
    this.stopMonitoring();

    // Check if clipboard API is available
    if (!navigator.clipboard) {
      throw new Error('Clipboard API not available - cannot start monitoring');
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        const currentContent = await this.readClipboard();
        
        if (currentContent && currentContent !== this.lastClipboardContent) {
          this.log('Clipboard content changed, new length:', currentContent.length);
          this.lastClipboardContent = currentContent;
          
          // Send to background script
          this.notifyClipboardChange(currentContent);
        }
      } catch (error) {
        // Clipboard access failures are normal and expected
        if (this.debugMode) {
          console.log('[ClipNest Offscreen] Clipboard check failed (normal):', error.message);
        }
      }
    }, 1500); // Check every 1.5 seconds (slightly offset from background)

    this.log('Clipboard monitoring started successfully');
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.log('Clipboard monitoring stopped');
    }
  }

  async notifyClipboardChange(text) {
    try {
      await chrome.runtime.sendMessage({
        action: 'clipboardChanged',
        text: text
      });
      this.log('Successfully notified background of clipboard change');
    } catch (error) {
      this.error('Failed to notify background of clipboard change:', error);
      
      // If communication fails, the background script might have restarted
      // Stop monitoring and let background script reinitialize
      if (error.message.includes('receiving end does not exist')) {
        this.log('Background script seems disconnected, stopping monitoring');
        this.stopMonitoring();
      }
    }
  }

  // Cleanup when the document is about to be destroyed
  beforeUnload() {
    this.log('Offscreen document unloading...');
    this.stopMonitoring();
  }
}

// Ensure cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.offscreenClipboard) {
    window.offscreenClipboard.beforeUnload();
  }
});

// Initialize the offscreen clipboard handler with error handling
try {
  window.offscreenClipboard = new OffscreenClipboard();
} catch (error) {
  console.error('[ClipNest Offscreen FATAL] Failed to initialize:', error);
}
