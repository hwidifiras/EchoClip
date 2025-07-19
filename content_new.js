// Debug version of content script with enhanced error reporting
class ClipboardMonitor {
  constructor() {
    this.lastSentContent = '';
    this.debugMode = true;
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

      // Listen for copy events
      document.addEventListener('copy', this.handleCopyEvent.bind(this));
      this.log('Copy event listener added');
      
      // Listen for cut events
      document.addEventListener('cut', this.handleCopyEvent.bind(this));
      this.log('Cut event listener added');
      
      // Listen for messages from background script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true;
      });
      this.log('Message listener added');

      // Monitor for keyboard shortcuts with better timing
      document.addEventListener('keydown', this.handleKeyDown.bind(this));
      this.log('Keydown listener added');
      
      // Also listen for paste events to detect external clipboard changes
      document.addEventListener('paste', this.handlePasteEvent.bind(this));
      this.log('Paste event listener added');

      this.log('Content script loaded successfully');
      
    } catch (error) {
      this.error('Error during initialization:', error);
    }
  }

  async handleCopyEvent(event) {
    try {
      this.log('Copy/cut event detected');
      
      // Get the copied text
      const selection = window.getSelection().toString();
      const clipboardData = event.clipboardData;
      
      let copiedText = '';
      
      if (selection) {
        copiedText = selection;
        this.log('Got text from selection:', copiedText.length, 'characters');
      } else if (clipboardData) {
        copiedText = clipboardData.getData('text/plain');
        this.log('Got text from clipboard data:', copiedText.length, 'characters');
      }

      if (copiedText && copiedText.trim()) {
        await this.sendClipboardData(copiedText.trim());
      } else {
        this.log('No text found in copy event');
      }
    } catch (error) {
      this.error('Error handling copy event:', error);
    }
  }

  handleKeyDown(event) {
    try {
      // Monitor Ctrl+C (Cmd+C on Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        this.log('Ctrl+C detected');
        // Small delay to let the copy operation complete
        setTimeout(() => {
          this.checkClipboardAfterCopy();
        }, 150);
      }
      
      // Also monitor Ctrl+X for cut operations
      if ((event.ctrlKey || event.metaKey) && event.key === 'x') {
        this.log('Ctrl+X detected');
        setTimeout(() => {
          this.checkClipboardAfterCopy();
        }, 150);
      }
    } catch (error) {
      this.error('Error in keydown handler:', error);
    }
  }

  async handlePasteEvent(event) {
    try {
      this.log('Paste event detected');
      
      // When something is pasted, it might indicate external clipboard activity
      const clipboardData = event.clipboardData;
      if (clipboardData) {
        const pastedText = clipboardData.getData('text/plain');
        if (pastedText && pastedText.trim()) {
          this.log('Got text from paste event:', pastedText.length, 'characters');
          await this.sendClipboardData(pastedText.trim());
        }
      }
    } catch (error) {
      this.error('Error handling paste event:', error);
    }
  }

  async sendClipboardData(text) {
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
      this.log('Could not read clipboard (normal):', error.message);
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
      
      await navigator.clipboard.writeText(text);
      this.log('Successfully wrote to clipboard');
      
      // Show a brief notification
      this.showCopyNotification();
      
    } catch (error) {
      this.error('Error copying text to clipboard:', error);
      
      // Fallback method using document.execCommand
      try {
        this.log('Trying fallback copy method...');
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        this.log('Fallback copy method succeeded');
        this.showCopyNotification();
      } catch (fallbackError) {
        this.error('Fallback copy method also failed:', fallbackError);
        throw new Error('Failed to copy text to clipboard');
      }
    }
  }

  showCopyNotification() {
    try {
      // Create a temporary notification
      const notification = document.createElement('div');
      notification.textContent = '✓ Copied to clipboard';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        z-index: 999999;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      
      document.body.appendChild(notification);
      
      // Animate in
      setTimeout(() => {
        notification.style.opacity = '1';
      }, 10);
      
      // Remove after 2 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, 2000);
    } catch (error) {
      this.error('Error showing copy notification:', error);
    }
  }
}

// Initialize the clipboard monitor with error handling
try {
  new ClipboardMonitor();
} catch (error) {
  console.error('[ClipNest Content FATAL] Failed to initialize:', error);
}
