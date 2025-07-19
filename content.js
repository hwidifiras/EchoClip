// Content script for ClipNest - Simplified Version
// Focuses on reliable event-based clipboard capture

class ClipboardMonitor {
  constructor() {
    this.lastSentContent = '';
    this.debugMode = true;
    this.isEnabled = true;
    this.init();
  }

  log(message, ...args) {
    if (this.debugMode) {
      console.log(`[ClipNest Content] ${message}`, ...args);
    }
  }

  error(message, error, ...args) {
    console.error(`[ClipNest Content ERROR] ${message}`, error, ...args);
  }

  init() {
    this.log('Content script initializing...');
    
    try {
      // Check if we're in the right context
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        this.error('Chrome runtime not available');
        return;
      }

      // Primary clipboard capture method - copy/cut events
      document.addEventListener('copy', this.handleCopyEvent.bind(this));
      document.addEventListener('cut', this.handleCopyEvent.bind(this));
      this.log('Copy/cut event listeners added');

      // Secondary method - keyboard shortcuts as backup
      document.addEventListener('keydown', this.handleKeyDown.bind(this));
      this.log('Keyboard shortcut listener added');
      
      // Listen for messages from background script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true;
      });
      this.log('Message listener added');

      this.log('Content script initialized successfully');
      
    } catch (error) {
      this.error('Error during initialization:', error);
    }
  }

  async handleCopyEvent(event) {
    if (!this.isEnabled) return;

    try {
      this.log(`${event.type} event detected`);
      
      let copiedText = '';
      
      // Try to get text from selection first
      const selection = window.getSelection().toString();
      if (selection) {
        copiedText = selection.trim();
        this.log('Got text from selection:', copiedText.length, 'characters');
      }
      
      // Fallback to clipboard data if available
      if (!copiedText && event.clipboardData) {
        copiedText = event.clipboardData.getData('text/plain').trim();
        this.log('Got text from clipboard data:', copiedText.length, 'characters');
      }

      if (copiedText) {
        await this.sendClipboardData(copiedText);
      } else {
        this.log('No text found in copy event');
      }
    } catch (error) {
      this.error('Error handling copy event:', error);
    }
  }

  handleKeyDown(event) {
    if (!this.isEnabled) return;

    try {
      // Only monitor Ctrl+C and Ctrl+X as backup for missed copy events
      if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'x')) {
        this.log(`Ctrl+${event.key.toUpperCase()} detected`);
        
        // Small delay to let the copy operation complete, then check clipboard
        setTimeout(() => {
          this.checkClipboardAfterCopy();
        }, 200);
      }
    } catch (error) {
      this.error('Error in keydown handler:', error);
    }
  }

  async checkClipboardAfterCopy() {
    try {
      this.log('Checking clipboard after copy operation...');
      
      if (!navigator.clipboard) {
        this.log('Clipboard API not available');
        return;
      }
      
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        this.log('Read text from clipboard:', text.length, 'characters');
        await this.sendClipboardData(text.trim());
      } else {
        this.log('No text found in clipboard');
      }
    } catch (error) {
      // Clipboard access failures are normal on many sites
      this.log('Could not read clipboard (normal on some sites):', error.message);
    }
  }

  async sendClipboardData(text) {
    if (!text || !this.isEnabled) return;

    try {
      // Avoid sending the same content repeatedly
      if (text === this.lastSentContent) {
        this.log('Skipping duplicate content');
        return;
      }
      
      this.lastSentContent = text;
      this.log('Sending clipboard data to background:', text.length, 'characters');
      
      const response = await chrome.runtime.sendMessage({
        action: 'clipboardCaptured',
        text: text
      });
      
      if (response && response.success) {
        this.log('Successfully sent clipboard data');
      } else {
        this.error('Failed to send clipboard data:', response?.error);
      }
    } catch (error) {
      this.error('Error sending clipboard data to background:', error);
      
      // If extension context is invalidated, disable monitoring
      if (error.message.includes('Extension context invalidated')) {
        this.log('Extension context invalidated, disabling monitoring');
        this.isEnabled = false;
      }
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      this.log('Received message:', message.action);
      
      switch (message.action) {
        case 'copyText':
          await this.copyTextToClipboard(message.text);
          sendResponse({ success: true });
          break;

        case 'enableMonitoring':
          this.isEnabled = true;
          this.log('Monitoring enabled');
          sendResponse({ success: true });
          break;

        case 'disableMonitoring':
          this.isEnabled = false;
          this.log('Monitoring disabled');
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

  async copyTextToClipboard(text) {
    try {
      this.log('Copying text to clipboard:', text.length, 'characters');
      
      // Temporarily disable monitoring to prevent duplicate capture
      const wasEnabled = this.isEnabled;
      this.isEnabled = false;
      
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        this.log('Successfully wrote to clipboard using modern API');
      } else {
        // Fallback to document.execCommand
        await this.fallbackCopyMethod(text);
        this.log('Successfully wrote to clipboard using fallback method');
      }
      
      // Show success notification
      this.showCopyNotification();
      
      // Re-enable monitoring after a delay
      setTimeout(() => {
        this.isEnabled = wasEnabled;
      }, 1500);
      
    } catch (error) {
      this.error('Error copying text to clipboard:', error);
      this.isEnabled = true; // Re-enable on error
      throw error;
    }
  }

  async fallbackCopyMethod(text) {
    return new Promise((resolve, reject) => {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.style.opacity = '0';
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          resolve();
        } else {
          reject(new Error('execCommand copy failed'));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  showCopyNotification() {
    try {
      // Remove any existing notification
      const existing = document.getElementById('clipnest-notification');
      if (existing) {
        existing.remove();
      }

      // Create notification element
      const notification = document.createElement('div');
      notification.id = 'clipnest-notification';
      notification.textContent = '✓ Copied to clipboard';
      notification.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        background: #4CAF50 !important;
        color: white !important;
        padding: 12px 18px !important;
        border-radius: 6px !important;
        z-index: 999999 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        border: none !important;
        margin: 0 !important;
        opacity: 0 !important;
        transition: opacity 0.3s ease !important;
        pointer-events: none !important;
      `;
      
      document.body.appendChild(notification);
      
      // Animate in
      requestAnimationFrame(() => {
        notification.style.opacity = '1';
      });
      
      // Remove after 2 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.style.opacity = '0';
          setTimeout(() => {
            if (notification.parentNode) {
              notification.parentNode.removeChild(notification);
            }
          }, 300);
        }
      }, 2000);
    } catch (error) {
      this.error('Error showing copy notification:', error);
    }
  }
}

// Initialize the clipboard monitor with error handling
try {
  const clipboardMonitor = new ClipboardMonitor();
} catch (error) {
  console.error('[ClipNest Content FATAL] Failed to initialize:', error);
}
