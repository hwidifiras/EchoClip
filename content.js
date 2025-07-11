// Content script for ClipNest
// Monitors copy events and handles clipboard operations in web pages

class ClipboardMonitor {
  constructor() {
    this.init();
  }

  init() {
    console.log('ClipNest content script loaded');
    
    // Listen for copy events
    document.addEventListener('copy', this.handleCopyEvent.bind(this));
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    // Also monitor for keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  async handleCopyEvent(event) {
    try {
      // Get the copied text
      const selection = window.getSelection().toString();
      const clipboardData = event.clipboardData;
      
      let copiedText = '';
      
      if (selection) {
        copiedText = selection;
      } else if (clipboardData) {
        copiedText = clipboardData.getData('text/plain');
      }

      if (copiedText && copiedText.trim()) {
        // Send to background script for storage
        chrome.runtime.sendMessage({
          action: 'clipboardCaptured',
          text: copiedText.trim()
        }).catch(error => {
          console.log('Failed to send clipboard data to background:', error);
        });
      }
    } catch (error) {
      console.log('Error handling copy event:', error);
    }
  }

  handleKeyDown(event) {
    // Monitor Ctrl+C (Cmd+C on Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      // Small delay to let the copy operation complete
      setTimeout(() => {
        this.checkClipboardAfterCopy();
      }, 100);
    }
  }

  async checkClipboardAfterCopy() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        chrome.runtime.sendMessage({
          action: 'clipboardCaptured',
          text: text.trim()
        }).catch(error => {
          console.log('Failed to send clipboard data to background:', error);
        });
      }
    } catch (error) {
      // Clipboard access might be restricted
      console.log('Could not read clipboard:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'copyText':
          await this.copyTextToClipboard(message.text);
          sendResponse({ success: true });
          break;
        
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message in content script:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      
      // Show a brief notification
      this.showCopyNotification();
      
    } catch (error) {
      console.error('Error copying text to clipboard:', error);
      
      // Fallback method using document.execCommand
      try {
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
        
        this.showCopyNotification();
      } catch (fallbackError) {
        console.error('Fallback copy method also failed:', fallbackError);
        throw new Error('Failed to copy text to clipboard');
      }
    }
  }

  showCopyNotification() {
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
  }
}

// Initialize the clipboard monitor
new ClipboardMonitor();
