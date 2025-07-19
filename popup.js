// ClipNest Popup JavaScript
// Handles the popup interface and user interactions

class ClipNestPopup {
  constructor() {
    this.clipboardHistory = [];
    this.filteredHistory = [];
    this.searchTerm = '';
    this.contextMenuTarget = null;
    this.init();
  }

  async init() {
    console.log('ClipNest popup initialized');
    
    // Initialize UI elements
    this.initElements();
    this.bindEvents();
    
    // Load clipboard history
    await this.loadClipboardHistory();
    
    // Listen for history updates from background
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'historyUpdated') {
        this.loadClipboardHistory();
      }
    });
  }

  initElements() {
    // Main elements
    this.searchToggle = document.getElementById('searchToggle');
    this.searchBar = document.getElementById('searchBar');
    this.searchInput = document.getElementById('searchInput');
    this.clearSearch = document.getElementById('clearSearch');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.settingsPanel = document.getElementById('settingsPanel');
    this.closeSettings = document.getElementById('closeSettings');
    
    // Stats
    this.clipCount = document.getElementById('clipCount');
    this.pinnedCount = document.getElementById('pinnedCount');
    
    // Actions
    this.clearAllBtn = document.getElementById('clearAllBtn');
    this.refreshBtn = document.getElementById('refreshBtn');
    
    // Content areas
    this.loadingSpinner = document.getElementById('loadingSpinner');
    this.emptyState = document.getElementById('emptyState');
    this.noResults = document.getElementById('noResults');
    this.clipboardItems = document.getElementById('clipboardItems');
    
    // Context menu
    this.contextMenu = document.getElementById('contextMenu');
  }

  bindEvents() {
    // Search functionality
    this.searchToggle.addEventListener('click', () => this.toggleSearch());
    this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    this.clearSearch.addEventListener('click', () => this.clearSearchTerm());
    
    // Settings
    this.settingsBtn.addEventListener('click', () => this.showSettings());
    this.closeSettings.addEventListener('click', () => this.hideSettings());
    
    // Actions
    this.clearAllBtn.addEventListener('click', () => this.clearAllClips());
    this.refreshBtn.addEventListener('click', () => this.loadClipboardHistory());
    
    // Context menu
    document.addEventListener('click', () => this.hideContextMenu());
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.clipboard-item')) {
        this.hideContextMenu();
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  async loadClipboardHistory() {
    try {
      console.log('Loading clipboard history...');
      this.showLoading();
      
      const response = await chrome.runtime.sendMessage({ action: 'getClipboardHistory' });
      console.log('Response from background:', response);
      
      if (response && response.success) {
        this.clipboardHistory = response.data || [];
        console.log('Loaded clipboard items:', this.clipboardHistory.length);
        this.filterHistory();
        this.updateStats();
        this.renderClipboardItems();
      } else {
        console.error('Failed to load clipboard history:', response?.error || 'No response');
        this.showEmptyState();
      }
    } catch (error) {
      console.error('Error loading clipboard history:', error);
      this.showEmptyState();
    }
  }

  filterHistory() {
    if (!this.searchTerm) {
      this.filteredHistory = [...this.clipboardHistory];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredHistory = this.clipboardHistory.filter(item =>
        item.text.toLowerCase().includes(term) ||
        item.type.toLowerCase().includes(term)
      );
    }
  }

  renderClipboardItems() {
    this.hideLoading();
    
    if (this.filteredHistory.length === 0) {
      if (this.clipboardHistory.length === 0) {
        this.showEmptyState();
      } else {
        this.showNoResults();
      }
      return;
    }

    this.hideAllStates();
    
    // Show only the first 10 items initially
    const itemsToShow = this.filteredHistory.slice(0, 10);
    
    this.clipboardItems.innerHTML = itemsToShow.map(item => this.createClipboardItemHTML(item)).join('');
    
    // Bind events for the new items
    this.bindClipboardItemEvents();
  }

  createClipboardItemHTML(item) {
    const formattedTime = this.formatTimestamp(item.timestamp);
    const truncatedText = this.truncateText(item.text, 100);
    const typeIcon = this.getTypeIcon(item.type);
    
    return `
      <div class="clipboard-item ${item.isPinned ? 'pinned' : ''}" data-id="${item.id}">
        <div class="clipboard-item-header">
          <span class="clip-type ${item.type.toLowerCase()}">
            ${typeIcon} ${item.type}
          </span>
          <div class="clip-actions">
            <button class="clip-action pin-btn ${item.isPinned ? 'pinned' : ''}" 
                    data-id="${item.id}" title="${item.isPinned ? 'Unpin' : 'Pin'}">
              ${item.isPinned ? '📌' : '📍'}
            </button>
            <button class="clip-action copy-btn" data-id="${item.id}" title="Copy">
              📋
            </button>
            <button class="clip-action delete-btn" data-id="${item.id}" title="Delete">
              🗑️
            </button>
          </div>
        </div>
        <div class="clipboard-item-content">
          <div class="clip-text" data-full-text="${this.escapeHtml(item.text)}">
            ${this.escapeHtml(truncatedText)}
          </div>
          <div class="clip-footer">
            <span class="clip-timestamp">${formattedTime}</span>
            ${item.text.length > 100 ? '<button class="expand-btn">Show more</button>' : ''}
          </div>
        </div>
      </div>
    `;
  }

  bindClipboardItemEvents() {
    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyClip(btn.dataset.id);
      });
    });

    // Pin buttons
    document.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePin(btn.dataset.id);
      });
    });

    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteClip(btn.dataset.id);
      });
    });

    // Expand buttons
    document.querySelectorAll('.expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleExpand(btn);
      });
    });

    // Item click to copy
    document.querySelectorAll('.clipboard-item').forEach(item => {
      item.addEventListener('click', () => {
        this.copyClip(item.dataset.id);
      });

      // Right-click context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(e, item.dataset.id);
      });
    });
  }

  async copyClip(id) {
    const item = this.clipboardHistory.find(clip => clip.id === id);
    if (!item) return;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'copyToClipboard',
        text: item.text
      });

      if (response.success) {
        this.showNotification('✓ Copied to clipboard');
      } else {
        this.showNotification('❌ Failed to copy', true);
      }
    } catch (error) {
      console.error('Error copying clip:', error);
      this.showNotification('❌ Failed to copy', true);
    }
  }

  async togglePin(id) {
    const item = this.clipboardHistory.find(clip => clip.id === id);
    if (!item) return;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'pinClip',
        id: id,
        pinned: !item.isPinned
      });

      if (response.success) {
        await this.loadClipboardHistory();
        this.showNotification(item.isPinned ? '📍 Unpinned' : '📌 Pinned');
      }
    } catch (error) {
      console.error('Error toggling pin:', error);
      this.showNotification('❌ Failed to pin', true);
    }
  }

  async deleteClip(id) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'deleteClip',
        id: id
      });

      if (response.success) {
        await this.loadClipboardHistory();
        this.showNotification('🗑️ Deleted');
      }
    } catch (error) {
      console.error('Error deleting clip:', error);
      this.showNotification('❌ Failed to delete', true);
    }
  }

  async clearAllClips() {
    if (!confirm('Are you sure you want to clear all unpinned clips?')) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearHistory' });

      if (response.success) {
        await this.loadClipboardHistory();
        this.showNotification('🗑️ Cleared all clips');
      }
    } catch (error) {
      console.error('Error clearing clips:', error);
      this.showNotification('❌ Failed to clear', true);
    }
  }

  toggleExpand(btn) {
    const clipText = btn.closest('.clipboard-item-content').querySelector('.clip-text');
    const fullText = clipText.dataset.fullText;
    
    if (clipText.classList.contains('expanded')) {
      clipText.classList.remove('expanded');
      clipText.textContent = this.truncateText(fullText, 100);
      btn.textContent = 'Show more';
    } else {
      clipText.classList.add('expanded');
      clipText.textContent = fullText;
      btn.textContent = 'Show less';
    }
  }

  toggleSearch() {
    this.searchBar.classList.toggle('hidden');
    if (!this.searchBar.classList.contains('hidden')) {
      this.searchInput.focus();
    } else {
      this.clearSearchTerm();
    }
  }

  handleSearch(term) {
    this.searchTerm = term.trim();
    this.filterHistory();
    this.renderClipboardItems();
  }

  clearSearchTerm() {
    this.searchInput.value = '';
    this.searchTerm = '';
    this.filterHistory();
    this.renderClipboardItems();
  }

  showContextMenu(e, id) {
    this.contextMenuTarget = id;
    this.contextMenu.style.left = `${e.pageX}px`;
    this.contextMenu.style.top = `${e.pageY}px`;
    this.contextMenu.classList.remove('hidden');

    // Bind context menu actions
    this.contextMenu.querySelectorAll('.context-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        this.handleContextAction(item.dataset.action);
      };
    });
  }

  hideContextMenu() {
    this.contextMenu.classList.add('hidden');
    this.contextMenuTarget = null;
  }

  handleContextAction(action) {
    if (!this.contextMenuTarget) return;

    switch (action) {
      case 'copy':
        this.copyClip(this.contextMenuTarget);
        break;
      case 'pin':
        this.togglePin(this.contextMenuTarget);
        break;
      case 'delete':
        this.deleteClip(this.contextMenuTarget);
        break;
    }

    this.hideContextMenu();
  }

  showSettings() {
    this.settingsPanel.classList.remove('hidden');
  }

  hideSettings() {
    this.settingsPanel.classList.add('hidden');
  }

  handleKeyDown(e) {
    // Escape to close search or settings
    if (e.key === 'Escape') {
      if (!this.settingsPanel.classList.contains('hidden')) {
        this.hideSettings();
      } else if (!this.searchBar.classList.contains('hidden')) {
        this.toggleSearch();
      }
    }

    // Ctrl/Cmd + F to toggle search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      this.toggleSearch();
    }
  }

  updateStats() {
    const total = this.clipboardHistory.length;
    const pinned = this.clipboardHistory.filter(item => item.isPinned).length;
    
    this.clipCount.textContent = `${total} clip${total !== 1 ? 's' : ''}`;
    this.pinnedCount.textContent = `${pinned} pinned`;
  }

  showLoading() {
    this.loadingSpinner.classList.remove('hidden');
    this.hideAllStates();
  }

  hideLoading() {
    this.loadingSpinner.classList.add('hidden');
  }

  showEmptyState() {
    this.hideLoading();
    this.emptyState.classList.remove('hidden');
    this.noResults.classList.add('hidden');
    this.clipboardItems.innerHTML = '';
  }

  showNoResults() {
    this.hideLoading();
    this.noResults.classList.remove('hidden');
    this.emptyState.classList.add('hidden');
    this.clipboardItems.innerHTML = '';
  }

  hideAllStates() {
    this.emptyState.classList.add('hidden');
    this.noResults.classList.add('hidden');
  }

  showNotification(message, isError = false) {
    // Create notification element
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${isError ? '#dc3545' : '#28a745'};
      color: white;
      padding: 10px 15px;
      border-radius: 6px;
      z-index: 9999;
      font-size: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 2 seconds
    setTimeout(() => {
      notification.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 2000);
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getTypeIcon(type) {
    const icons = {
      'URL': '🔗',
      'Email': '📧',
      'Code': '💻',
      'Phone': '📞',
      'Text': '📝'
    };
    return icons[type] || '📝';
  }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ClipNestPopup();
});
