// Main application logic
class SpendTrackApp {
  constructor() {
    this.transactions = [];
    this.categories = [];
    this.recurring = [];
    this.settings = {
      lastUser: 'James',
      lastCategory: null
    };
    this.currentView = 'add';
    this.selectedPerson = 'James';
    this.selectedCategory = null;
    this.analyticsFilter = 'combined';
    this.lastAddedTransaction = null;
    this.undoTimeout = null;
    
    this.init();
  }

  async init() {
    // Check authentication first
    const isAuthenticated = await this.checkAuth();
    
    if (isAuthenticated) {
      await this.loadApp();
    } else {
      this.showLoginScreen();
    }
    
    this.bindEvents();
  }

  async checkAuth() {
    try {
      const response = await fetch('/api/auth/check', { credentials: 'include' });
      const data = await response.json();
      return data.authenticated;
    } catch (error) {
      // If offline, check if we have local data
      const localTx = await db.getTransactions();
      return localTx.length > 0;
    }
  }

  showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
  }

  async loadApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    // Load data
    await this.loadData();
    
    // Load settings
    await this.loadSettings();
    
    // Process recurring transactions
    await this.processRecurringTransactions();
    
    // Setup sync status listener
    syncService.onStatusChange((status) => this.updateSyncStatus(status));
    syncService.onSyncResult((result) => this.handleSyncResult(result));
    this.updateSyncStatus(syncService.getStatus());
    
    // Initial sync
    syncService.sync();
    
    // Render initial view
    this.renderCategories();
    this.switchView('add');
  }

  async loadData() {
    const data = await syncService.fetchInitialData();
    this.transactions = data.transactions;
    this.categories = data.categories;
    this.recurring = data.recurring;
  }

  async loadSettings() {
    const lastUser = await db.getSetting('lastUser');
    const lastCategory = await db.getSetting('lastCategory');
    
    if (lastUser) this.settings.lastUser = lastUser;
    if (lastCategory) this.settings.lastCategory = lastCategory;
    
    this.selectedPerson = this.settings.lastUser;
    this.selectedCategory = this.settings.lastCategory;
    
    // Update UI
    this.updatePersonToggle();
    this.updateSettingsUserToggle();
  }

  async saveSettings() {
    await db.setSetting('lastUser', this.settings.lastUser);
    await db.setSetting('lastCategory', this.settings.lastCategory);
  }

  bindEvents() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
    
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });
    
    // Sync button
    document.getElementById('sync-btn').addEventListener('click', () => {
      this.showSyncModal();
      syncService.sync();
    });
    
    // Sync modal close
    document.getElementById('sync-modal-close').addEventListener('click', () => this.closeSyncModal());
    document.getElementById('sync-modal-close-btn').addEventListener('click', () => this.closeSyncModal());
    document.getElementById('sync-modal').addEventListener('click', (e) => {
      if (e.target.id === 'sync-modal') this.closeSyncModal();
    });
    
    // Add transaction form
    document.getElementById('add-form').addEventListener('submit', (e) => this.handleAddTransaction(e));
    
    // Person toggle (add form)
    document.querySelectorAll('.person-btn:not(.settings-user-btn):not(.edit-person-btn):not(.recurring-person-btn)').forEach(btn => {
      btn.addEventListener('click', () => this.selectPerson(btn.dataset.person));
    });
    
    // // New category button
    // document.getElementById('add-category-btn').addEventListener('click', () => this.addNewCategory());
    // document.getElementById('new-category-input').addEventListener('keypress', (e) => {
    //   if (e.key === 'Enter') {
    //     e.preventDefault();
    //     this.addNewCategory();
    //   }
    // });
    
    // Undo button
    document.getElementById('undo-btn').addEventListener('click', () => this.undoLastAdd());
    
    // Filters - person toggle buttons
    document.querySelectorAll('.filter-person-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTransactionPersonFilter(btn.dataset.filter));
    });
    document.getElementById('filter-category').addEventListener('change', () => this.renderTransactionsList());
    document.getElementById('filter-date-from').addEventListener('change', () => this.renderTransactionsList());
    document.getElementById('filter-date-to').addEventListener('change', () => this.renderTransactionsList());
    document.getElementById('filter-search').addEventListener('input', () => this.renderTransactionsList());
    
    // Analytics toggle
    document.querySelectorAll('.analytics-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setAnalyticsFilter(btn.dataset.filter));
    });
    
    // Settings - user toggle
    document.querySelectorAll('.settings-user-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setDefaultUser(btn.dataset.person));
    });
    
    // Settings - add category
    document.getElementById('settings-add-category').addEventListener('click', () => this.addCategoryFromSettings());
    document.getElementById('settings-new-category').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addCategoryFromSettings();
      }
    });
    
    // Settings - add recurring
    document.getElementById('add-recurring-btn').addEventListener('click', () => this.showRecurringModal());
    
    // Settings - export
    document.getElementById('export-json-btn').addEventListener('click', () => this.exportJSON());
    document.getElementById('export-csv-btn').addEventListener('click', () => this.exportCSV());
    
    // Settings - import
    document.getElementById('import-json-btn').addEventListener('click', () => this.showImportModal());
    document.getElementById('import-file-input').addEventListener('change', (e) => this.handleImportFileSelect(e));
    document.getElementById('import-modal-close').addEventListener('click', () => this.closeImportModal());
    document.getElementById('import-cancel-btn').addEventListener('click', () => this.closeImportModal());
    document.getElementById('import-confirm-btn').addEventListener('click', () => this.handleImportConfirm());
    document.getElementById('import-modal').addEventListener('click', (e) => {
      if (e.target.id === 'import-modal') this.closeImportModal();
    });
    
    // Settings - logout
    document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
    
    // Edit modal
    document.getElementById('edit-modal-close').addEventListener('click', () => this.closeEditModal());
    document.getElementById('edit-form').addEventListener('submit', (e) => this.handleEditTransaction(e));
    document.getElementById('delete-tx-btn').addEventListener('click', () => this.handleDeleteTransaction());
    document.querySelectorAll('.edit-person-btn').forEach(btn => {
      btn.addEventListener('click', () => this.selectEditPerson(btn.dataset.person));
    });
    
    // Recurring modal
    document.getElementById('recurring-modal-close').addEventListener('click', () => this.closeRecurringModal());
    document.getElementById('recurring-form').addEventListener('submit', (e) => this.handleSaveRecurring(e));
    document.getElementById('delete-recurring-btn').addEventListener('click', () => this.handleDeleteRecurring());
    document.querySelectorAll('.recurring-person-btn').forEach(btn => {
      btn.addEventListener('click', () => this.selectRecurringPerson(btn.dataset.person));
    });
    
    // Close modals on backdrop click
    document.getElementById('edit-modal').addEventListener('click', (e) => {
      if (e.target.id === 'edit-modal') this.closeEditModal();
    });
    document.getElementById('recurring-modal').addEventListener('click', (e) => {
      if (e.target.id === 'recurring-modal') this.closeRecurringModal();
    });
    
    // Set default date to today
    this.setDefaultDate();
  }

  setDefaultDate() {
    const today = this.getTodayInCentral();
    document.getElementById('tx-date').value = today;
  }

  getTodayInCentral() {
    const now = new Date();
    const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    return centralTime.toISOString().split('T')[0];
  }

  async handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('password-input').value;
    const errorEl = document.getElementById('login-error');
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      });
      
      if (response.ok) {
        errorEl.classList.add('hidden');
        await this.loadApp();
      } else {
        errorEl.textContent = 'Invalid password';
        errorEl.classList.remove('hidden');
      }
    } catch (error) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.classList.remove('hidden');
    }
  }

  async handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Logout error:', error);
    }
    this.showLoginScreen();
  }

  switchView(view) {
    this.currentView = view;
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Update views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `${view}-view`);
    });
    
    // Render view-specific content
    if (view === 'transactions') {
      this.renderTransactionsList();
      this.populateFilterCategories();
    } else if (view === 'analytics') {
      this.renderAnalytics();
    } else if (view === 'settings') {
      this.renderSettings();
    } else if (view === 'add') {
      this.setDefaultDate();
      this.renderCategories();
    }
  }

  updateSyncStatus(status) {
    const statusEl = document.getElementById('sync-status');
    statusEl.className = 'sync-status ' + status;
    statusEl.title = status === 'synced' ? 'Synced' : 
                     status === 'syncing' ? 'Syncing...' : 
                     'Offline';
  }

  showSyncModal() {
    const modal = document.getElementById('sync-modal');
    const progress = document.getElementById('sync-progress');
    const results = document.getElementById('sync-results');
    const error = document.getElementById('sync-error');
    
    progress.classList.remove('hidden');
    results.classList.add('hidden');
    error.classList.add('hidden');
    
    modal.classList.remove('hidden');
  }

  closeSyncModal() {
    document.getElementById('sync-modal').classList.add('hidden');
  }

  handleSyncResult(result) {
    const modal = document.getElementById('sync-modal');
    const progress = document.getElementById('sync-progress');
    const results = document.getElementById('sync-results');
    const error = document.getElementById('sync-error');
    
    progress.classList.add('hidden');
    
    if (result.success) {
      results.classList.remove('hidden');
      error.classList.add('hidden');
      
      document.getElementById('sync-tx-added').textContent = result.stats.transactions.added;
      document.getElementById('sync-tx-updated').textContent = result.stats.transactions.updated;
      document.getElementById('sync-tx-conflicted').textContent = result.stats.transactions.conflicted;
      document.getElementById('sync-cat-added').textContent = result.stats.categories.added;
      document.getElementById('sync-cat-updated').textContent = result.stats.categories.updated;
      document.getElementById('sync-timestamp').textContent = this.formatSyncTime(result.timestamp);
      
      this.showToast(result.message, 'success');
    } else {
      results.classList.add('hidden');
      error.classList.remove('hidden');
      document.getElementById('sync-error-message').textContent = `Sync failed: ${result.error}`;
      
      this.showToast(`Sync failed: ${result.error}`, 'error');
    }
  }

  formatSyncTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    
    return date.toLocaleString();
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ'
    };
    
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Person selection
  selectPerson(person) {
    this.selectedPerson = person;
    this.updatePersonToggle();
  }

  updatePersonToggle() {
    document.querySelectorAll('.person-btn:not(.settings-user-btn):not(.edit-person-btn):not(.recurring-person-btn)').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.person === this.selectedPerson);
    });
  }

  // Category management
  renderCategories() {
    const container = document.getElementById('category-tags');
    container.innerHTML = '';
    
    this.categories.forEach(cat => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'category-tag' + (this.selectedCategory === cat.id ? ' active' : '');
      tag.textContent = cat.name;
      tag.addEventListener('click', () => this.selectCategory(cat.id));
      container.appendChild(tag);
    });
  }

  selectCategory(categoryId) {
    this.selectedCategory = categoryId;
    this.settings.lastCategory = categoryId;
    this.saveSettings();
    this.renderCategories();
  }

  async addNewCategory() {
    const input = document.getElementById('new-category-input');
    const name = input.value.trim();
    
    if (!name) return;
    
    // Check if category already exists
    const exists = this.categories.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      input.value = '';
      return;
    }
    
    const category = {
      id: generateUUID(),
      name: name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: this.selectedPerson,
      deletedAt: null
    };
    
    await db.saveCategory(category);
    this.categories.push(category);
    this.selectedCategory = category.id;
    
    input.value = '';
    this.renderCategories();
    
    // Trigger sync
    syncService.sync();
  }

  // Transaction handling
  async handleAddTransaction(e) {
    e.preventDefault();
    
    const date = document.getElementById('tx-date').value;
    const vendor = document.getElementById('tx-vendor').value.trim();
    const amount = parseInt(document.getElementById('tx-amount').value);
    const memo = document.getElementById('tx-memo').value.trim();
    
    // Validation
    if (!this.selectedCategory) {
      alert('Please select a category');
      return;
    }
    
    if (!amount || amount < 1) {
      alert('Please enter a valid amount');
      return;
    }
    
    const category = this.categories.find(c => c.id === this.selectedCategory);
    
    const transaction = {
      id: generateUUID(),
      date: date,
      person: this.selectedPerson,
      category: category ? category.name : 'Other',
      categoryId: this.selectedCategory,
      vendor: vendor,
      amount: amount,
      memo: memo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: this.selectedPerson,
      deletedAt: null
    };
    
    await db.saveTransaction(transaction);
    this.transactions.push(transaction);
    
    // Store for undo
    this.lastAddedTransaction = transaction;
    this.showUndoNotification();
    
    // Reset form
    document.getElementById('tx-vendor').value = '';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-memo').value = '';
    this.setDefaultDate();
    
    // Trigger sync
    syncService.sync();
  }

  showUndoNotification() {
    const container = document.getElementById('undo-container');
    container.classList.remove('hidden');
    
    // Clear existing timeout
    if (this.undoTimeout) {
      clearTimeout(this.undoTimeout);
    }
    
    // Hide after 5 seconds
    this.undoTimeout = setTimeout(() => {
      container.classList.add('hidden');
      this.lastAddedTransaction = null;
    }, 5000);
  }

  async undoLastAdd() {
    if (!this.lastAddedTransaction) return;
    
    await db.deleteTransaction(this.lastAddedTransaction.id);
    this.transactions = this.transactions.filter(t => t.id !== this.lastAddedTransaction.id);
    
    document.getElementById('undo-container').classList.add('hidden');
    this.lastAddedTransaction = null;
    
    if (this.undoTimeout) {
      clearTimeout(this.undoTimeout);
    }
    
    syncService.sync();
  }

  // Transaction list
  populateFilterCategories() {
    const select = document.getElementById('filter-category');
    select.innerHTML = '<option value="all">All Categories</option>';
    
    this.categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      select.appendChild(option);
    });
  }

  setTransactionPersonFilter(filter) {
    this.transactionPersonFilter = filter;
    document.querySelectorAll('.filter-person-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    this.renderTransactionsList();
  }

  renderTransactionsList() {
    const container = document.getElementById('transactions-list');
    const totalEl = document.getElementById('transactions-total');
    
    // Get filter values
    const personFilter = this.transactionPersonFilter || 'all';
    const categoryFilter = document.getElementById('filter-category').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;
    const searchQuery = document.getElementById('filter-search').value.toLowerCase();
    
    // Filter transactions
    let filtered = this.transactions.filter(tx => {
      if (personFilter !== 'all' && tx.person !== personFilter) return false;
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      if (searchQuery) {
        const searchIn = `${tx.vendor} ${tx.memo}`.toLowerCase();
        if (!searchIn.includes(searchQuery)) return false;
      }
      return true;
    });
    
    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt));
    
    // Render
    if (filtered.length === 0) {
      container.innerHTML = '<div class="no-transactions">No transactions found</div>';
      totalEl.innerHTML = '';
      return;
    }
    
    container.innerHTML = filtered.map(tx => `
      <div class="transaction-item" data-id="${tx.id}">
        <div class="transaction-header">
          <span class="transaction-vendor">${tx.vendor || tx.category}</span>
          <span class="transaction-amount">$${tx.amount}</span>
        </div>
        <div class="transaction-details">
          <span class="transaction-person ${tx.person.toLowerCase()}">${tx.person}</span>
          <span class="transaction-tag">${tx.category}</span>
          <span class="transaction-date">${this.formatDate(tx.date)}</span>
          ${tx.memo ? `<span class="transaction-memo">${tx.memo}</span>` : ''}
        </div>
      </div>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.transaction-item').forEach(item => {
      item.addEventListener('click', () => this.openEditModal(item.dataset.id));
    });
    
    // Calculate total
    const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);
    totalEl.innerHTML = `Total: $${total.toLocaleString()}`;
  }

  formatDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // Edit modal
  openEditModal(txId) {
    const tx = this.transactions.find(t => t.id === txId);
    if (!tx) return;
    
    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-date').value = tx.date;
    document.getElementById('edit-tx-vendor').value = tx.vendor || '';
    document.getElementById('edit-tx-amount').value = tx.amount;
    document.getElementById('edit-tx-memo').value = tx.memo || '';
    
    // Set person
    document.querySelectorAll('.edit-person-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.person === tx.person);
    });
    
    // Populate and set category
    const categorySelect = document.getElementById('edit-tx-category');
    categorySelect.innerHTML = this.categories.map(cat => 
      `<option value="${cat.name}" ${cat.name === tx.category ? 'selected' : ''}>${cat.name}</option>`
    ).join('');
    
    document.getElementById('edit-modal').classList.remove('hidden');
  }

  closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
  }

  selectEditPerson(person) {
    document.querySelectorAll('.edit-person-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.person === person);
    });
  }

  async handleEditTransaction(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit-tx-id').value;
    const tx = this.transactions.find(t => t.id === id);
    if (!tx) return;
    
    const activePerson = document.querySelector('.edit-person-btn.active');
    
    tx.date = document.getElementById('edit-tx-date').value;
    tx.person = activePerson ? activePerson.dataset.person : tx.person;
    tx.category = document.getElementById('edit-tx-category').value;
    tx.vendor = document.getElementById('edit-tx-vendor').value.trim();
    tx.amount = parseInt(document.getElementById('edit-tx-amount').value);
    tx.memo = document.getElementById('edit-tx-memo').value.trim();
    tx.updatedAt = new Date().toISOString();
    tx.updatedBy = this.settings.lastUser;
    
    await db.saveTransaction(tx);
    this.closeEditModal();
    this.renderTransactionsList();
    syncService.sync();
  }

  async handleDeleteTransaction() {
    const id = document.getElementById('edit-tx-id').value;
    
    if (!confirm('Delete this transaction?')) return;
    
    await db.deleteTransaction(id);
    this.transactions = this.transactions.filter(t => t.id !== id);
    
    this.closeEditModal();
    this.renderTransactionsList();
    syncService.sync();
  }

  // Analytics
  setAnalyticsFilter(filter) {
    this.analyticsFilter = filter;
    document.querySelectorAll('.analytics-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    this.renderAnalytics();
  }

  renderAnalytics() {
    // Filter transactions by person
    let filtered = this.transactions;
    if (this.analyticsFilter !== 'combined') {
      filtered = filtered.filter(tx => tx.person === this.analyticsFilter);
    }
    
    // Calculate stats
    const today = this.getTodayInCentral();
    const weekStart = this.getWeekStart(today);
    const monthStart = today.substring(0, 7) + '-01';
    
    const weekTotal = filtered
      .filter(tx => tx.date >= weekStart && tx.date <= today)
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const monthTotal = filtered
      .filter(tx => tx.date >= monthStart && tx.date <= today)
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const allTimeTotal = filtered.reduce((sum, tx) => sum + tx.amount, 0);
    
    document.getElementById('stat-week').textContent = `$${weekTotal.toLocaleString()}`;
    document.getElementById('stat-month').textContent = `$${monthTotal.toLocaleString()}`;
    document.getElementById('stat-total').textContent = `$${allTimeTotal.toLocaleString()}`;
    
    // Category chart
    this.renderCategoryChart(filtered);
    
    // Weekly chart
    this.renderWeeklyChart(filtered);
  }

  getWeekStart(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday is start of week
    date.setDate(date.getDate() - diff);
    return date.toISOString().split('T')[0];
  }

  renderCategoryChart(transactions) {
    const container = document.getElementById('category-chart');
    
    // Group by category
    const byCategory = {};
    transactions.forEach(tx => {
      byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.amount;
    });
    
    // Sort by amount
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const maxAmount = sorted.length > 0 ? sorted[0][1] : 0;
    
    if (sorted.length === 0) {
      container.innerHTML = '<div class="no-transactions">No data</div>';
      return;
    }
    
    container.innerHTML = sorted.map(([category, amount]) => {
      const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
      return `
        <div class="category-bar">
          <span class="category-bar-label">${category}</span>
          <div class="category-bar-track">
            <div class="category-bar-fill" style="width: ${Math.max(percentage, 15)}%">
              <span class="category-bar-value">$${amount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderWeeklyChart(transactions) {
    const container = document.getElementById('weekly-chart');
    
    // Get last 8 weeks
    const weeks = [];
    const today = this.getTodayInCentral();
    let weekStart = this.getWeekStart(today);
    
    for (let i = 0; i < 8; i++) {
      const weekEnd = new Date(weekStart + 'T12:00:00');
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split('T')[0];
      
      const weekTotal = transactions
        .filter(tx => tx.date >= weekStart && tx.date <= weekEndStr)
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      weeks.unshift({
        start: weekStart,
        total: weekTotal,
        label: this.formatWeekLabel(weekStart)
      });
      
      // Go to previous week
      const prevWeek = new Date(weekStart + 'T12:00:00');
      prevWeek.setDate(prevWeek.getDate() - 7);
      weekStart = prevWeek.toISOString().split('T')[0];
    }
    
    const maxWeek = Math.max(...weeks.map(w => w.total), 1);
    
    container.innerHTML = weeks.map(week => {
      const height = (week.total / maxWeek) * 100;
      return `
        <div class="week-bar">
          <div class="week-bar-fill" style="height: ${Math.max(height, 2)}%">
            <span class="week-bar-value">$${week.total}</span>
          </div>
          <span class="week-bar-label">${week.label}</span>
        </div>
      `;
    }).join('');
  }

  formatWeekLabel(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Settings
  renderSettings() {
    this.updateSettingsUserToggle();
    this.renderCategoriesList();
    this.renderRecurringList();
  }

  updateSettingsUserToggle() {
    document.querySelectorAll('.settings-user-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.person === this.settings.lastUser);
    });
  }

  async setDefaultUser(person) {
    this.settings.lastUser = person;
    this.selectedPerson = person;
    await this.saveSettings();
    this.updateSettingsUserToggle();
    this.updatePersonToggle();
  }

  renderCategoriesList() {
    const container = document.getElementById('categories-list');
    
    container.innerHTML = this.categories.map(cat => `
      <div class="category-item" data-id="${cat.id}">
        <span class="category-item-name">${cat.name}</span>
        <div class="category-item-actions">
          <button class="edit-cat-btn" title="Edit">✏️</button>
          <button class="delete-cat-btn" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');
    
    // Add event listeners
    container.querySelectorAll('.edit-cat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.category-item').dataset.id;
        this.editCategory(id);
      });
    });
    
    container.querySelectorAll('.delete-cat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.category-item').dataset.id;
        this.deleteCategoryFromSettings(id);
      });
    });
  }

  async addCategoryFromSettings() {
    const input = document.getElementById('settings-new-category');
    const name = input.value.trim();
    
    if (!name) return;
    
    const exists = this.categories.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      alert('Category already exists');
      return;
    }
    
    const category = {
      id: generateUUID(),
      name: name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: this.settings.lastUser,
      deletedAt: null
    };
    
    await db.saveCategory(category);
    this.categories.push(category);
    
    input.value = '';
    this.renderCategoriesList();
    syncService.sync();
  }

  async editCategory(id) {
    const cat = this.categories.find(c => c.id === id);
    if (!cat) return;
    
    const newName = prompt('Edit category name:', cat.name);
    if (!newName || newName.trim() === cat.name) return;
    
    cat.name = newName.trim();
    cat.updatedAt = new Date().toISOString();
    cat.updatedBy = this.settings.lastUser;
    
    await db.saveCategory(cat);
    this.renderCategoriesList();
    this.renderCategories();
    syncService.sync();
  }

  async deleteCategoryFromSettings(id) {
    const cat = this.categories.find(c => c.id === id);
    if (!cat) return;
    
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    
    await db.deleteCategory(id);
    this.categories = this.categories.filter(c => c.id !== id);
    
    if (this.selectedCategory === id) {
      this.selectedCategory = null;
    }
    
    this.renderCategoriesList();
    this.renderCategories();
    syncService.sync();
  }

  // Recurring transactions
  renderRecurringList() {
    const container = document.getElementById('recurring-list');
    
    if (this.recurring.length === 0) {
      container.innerHTML = '<div class="no-transactions">No recurring transactions</div>';
      return;
    }
    
    const frequencyLabels = {
      weekly: 'Weekly',
      biweekly: 'Every 2 weeks',
      monthly: 'Monthly',
      yearly: 'Yearly'
    };
    
    container.innerHTML = this.recurring.map(rec => `
      <div class="recurring-item" data-id="${rec.id}">
        <div class="recurring-item-info">
          <span class="recurring-item-vendor">${rec.vendor}</span>
          <span class="recurring-item-details">${rec.category} • ${frequencyLabels[rec.frequency]} • ${rec.person}</span>
        </div>
        <span class="recurring-item-amount">$${rec.amount}</span>
      </div>
    `).join('');
    
    container.querySelectorAll('.recurring-item').forEach(item => {
      item.addEventListener('click', () => this.showRecurringModal(item.dataset.id));
    });
  }

  showRecurringModal(id = null) {
    const modal = document.getElementById('recurring-modal');
    const title = document.getElementById('recurring-modal-title');
    const deleteBtn = document.getElementById('delete-recurring-btn');
    
    // Populate category select
    const categorySelect = document.getElementById('recurring-category');
    categorySelect.innerHTML = this.categories.map(cat => 
      `<option value="${cat.name}">${cat.name}</option>`
    ).join('');
    
    if (id) {
      // Edit mode
      const rec = this.recurring.find(r => r.id === id);
      if (!rec) return;
      
      title.textContent = 'Edit Recurring Transaction';
      deleteBtn.classList.remove('hidden');
      
      document.getElementById('recurring-id').value = rec.id;
      document.getElementById('recurring-vendor').value = rec.vendor;
      document.getElementById('recurring-amount').value = rec.amount;
      document.getElementById('recurring-frequency').value = rec.frequency;
      document.getElementById('recurring-start').value = rec.startDate;
      document.getElementById('recurring-memo').value = rec.memo || '';
      categorySelect.value = rec.category;
      
      document.querySelectorAll('.recurring-person-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.person === rec.person);
      });
    } else {
      // Add mode
      title.textContent = 'Add Recurring Transaction';
      deleteBtn.classList.add('hidden');
      
      document.getElementById('recurring-id').value = '';
      document.getElementById('recurring-vendor').value = '';
      document.getElementById('recurring-amount').value = '';
      document.getElementById('recurring-frequency').value = 'monthly';
      document.getElementById('recurring-start').value = this.getTodayInCentral();
      document.getElementById('recurring-memo').value = '';
      
      document.querySelectorAll('.recurring-person-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.person === this.settings.lastUser);
      });
    }
    
    modal.classList.remove('hidden');
  }

  closeRecurringModal() {
    document.getElementById('recurring-modal').classList.add('hidden');
  }

  selectRecurringPerson(person) {
    document.querySelectorAll('.recurring-person-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.person === person);
    });
  }

  async handleSaveRecurring(e) {
    e.preventDefault();
    
    const id = document.getElementById('recurring-id').value;
    const activePerson = document.querySelector('.recurring-person-btn.active');
    
    const recurringData = {
      id: id || generateUUID(),
      person: activePerson ? activePerson.dataset.person : this.settings.lastUser,
      category: document.getElementById('recurring-category').value,
      vendor: document.getElementById('recurring-vendor').value.trim(),
      amount: parseInt(document.getElementById('recurring-amount').value),
      frequency: document.getElementById('recurring-frequency').value,
      startDate: document.getElementById('recurring-start').value,
      memo: document.getElementById('recurring-memo').value.trim(),
      lastGenerated: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: this.settings.lastUser,
      deletedAt: null
    };
    
    if (id) {
      // Update existing
      const index = this.recurring.findIndex(r => r.id === id);
      if (index >= 0) {
        recurringData.createdAt = this.recurring[index].createdAt;
        recurringData.lastGenerated = this.recurring[index].lastGenerated;
        this.recurring[index] = recurringData;
      }
    } else {
      // Add new
      this.recurring.push(recurringData);
    }
    
    await db.saveRecurring(recurringData);
    this.closeRecurringModal();
    this.renderRecurringList();
    syncService.sync();
    
    // Process any due recurring transactions
    await this.processRecurringTransactions();
  }

  async handleDeleteRecurring() {
    const id = document.getElementById('recurring-id').value;
    if (!id) return;
    
    if (!confirm('Delete this recurring transaction?')) return;
    
    await db.deleteRecurring(id);
    this.recurring = this.recurring.filter(r => r.id !== id);
    
    this.closeRecurringModal();
    this.renderRecurringList();
    syncService.sync();
  }

  async processRecurringTransactions() {
    const today = this.getTodayInCentral();
    
    for (const rec of this.recurring) {
      if (rec.deletedAt) continue;
      
      let nextDate = rec.lastGenerated ? this.getNextRecurringDate(rec.lastGenerated, rec.frequency) : rec.startDate;
      
      while (nextDate <= today) {
        // Check if transaction already exists for this date
        const exists = this.transactions.some(tx => 
          tx.recurringId === rec.id && tx.date === nextDate
        );
        
        if (!exists) {
          const transaction = {
            id: generateUUID(),
            date: nextDate,
            person: rec.person,
            category: rec.category,
            vendor: rec.vendor,
            amount: rec.amount,
            memo: rec.memo || `Recurring: ${rec.vendor}`,
            recurringId: rec.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: 'System',
            deletedAt: null
          };
          
          await db.saveTransaction(transaction);
          this.transactions.push(transaction);
        }
        
        rec.lastGenerated = nextDate;
        nextDate = this.getNextRecurringDate(nextDate, rec.frequency);
      }
      
      // Update recurring record
      rec.updatedAt = new Date().toISOString();
      await db.saveRecurring(rec);
    }
  }

  getNextRecurringDate(dateStr, frequency) {
    const date = new Date(dateStr + 'T12:00:00');
    
    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'biweekly':
        date.setDate(date.getDate() + 14);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }
    
    return date.toISOString().split('T')[0];
  }

  // Export
  exportJSON() {
    window.location.href = '/api/export/json';
  }

  exportCSV() {
    window.location.href = '/api/export/csv';
  }

  // Import
  showImportModal() {
    const modal = document.getElementById('import-modal');
    const fileInput = document.getElementById('import-file-input');
    const preview = document.getElementById('import-preview');
    const error = document.getElementById('import-error');
    const success = document.getElementById('import-success');
    const confirmBtn = document.getElementById('import-confirm-btn');
    
    fileInput.value = '';
    preview.classList.add('hidden');
    error.classList.add('hidden');
    success.classList.add('hidden');
    confirmBtn.disabled = true;
    
    modal.classList.remove('hidden');
  }

  closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
    document.getElementById('import-file-input').value = '';
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-error').classList.add('hidden');
    document.getElementById('import-success').classList.add('hidden');
    document.getElementById('import-confirm-btn').disabled = true;
  }

  handleImportFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importData = JSON.parse(event.target.result);
        this.validateAndPreviewImport(importData);
      } catch (error) {
        this.showImportError('Invalid JSON file: ' + error.message);
      }
    };
    reader.readAsText(file);
  }

  validateAndPreviewImport(importData) {
    const error = document.getElementById('import-error');
    const preview = document.getElementById('import-preview');
    const confirmBtn = document.getElementById('import-confirm-btn');
    
    error.classList.add('hidden');
    
    // Validate structure
    if (!importData || typeof importData !== 'object') {
      this.showImportError('Invalid import data format');
      return;
    }
    
    const { transactions, categories, settings, recurring } = importData;
    
    if (!Array.isArray(transactions) || !Array.isArray(categories) || !Array.isArray(recurring)) {
      this.showImportError('Missing required data arrays');
      return;
    }
    
    if (!settings || typeof settings !== 'object') {
      this.showImportError('Missing or invalid settings');
      return;
    }
    
    // Validate transaction structure
    for (const tx of transactions) {
      if (!tx.id || !tx.date || !tx.person || !tx.category || tx.amount === undefined) {
        this.showImportError('Invalid transaction structure');
        return;
      }
    }
    
    // Validate category structure
    for (const cat of categories) {
      if (!cat.id || !cat.name) {
        this.showImportError('Invalid category structure');
        return;
      }
    }
    
    // Validate recurring structure
    for (const rec of recurring) {
      if (!rec.id || !rec.person || !rec.category || !rec.vendor || rec.amount === undefined) {
        this.showImportError('Invalid recurring transaction structure');
        return;
      }
    }
    
    // Store validated data for import
    this.pendingImportData = importData;
    
    // Show preview
    document.getElementById('preview-tx-count').textContent = transactions.length;
    document.getElementById('preview-cat-count').textContent = categories.length;
    document.getElementById('preview-rec-count').textContent = recurring.length;
    
    preview.classList.remove('hidden');
    confirmBtn.disabled = false;
  }

  showImportError(message) {
    const error = document.getElementById('import-error');
    const preview = document.getElementById('import-preview');
    const confirmBtn = document.getElementById('import-confirm-btn');
    
    error.textContent = message;
    error.classList.remove('hidden');
    preview.classList.add('hidden');
    confirmBtn.disabled = true;
  }

  async handleImportConfirm() {
    if (!this.pendingImportData) return;
    
    const confirmBtn = document.getElementById('import-confirm-btn');
    const error = document.getElementById('import-error');
    const success = document.getElementById('import-success');
    
    confirmBtn.disabled = true;
    error.classList.add('hidden');
    success.classList.add('hidden');
    
    try {
      const response = await fetch('/api/import/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.pendingImportData),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }
      
      const result = await response.json();
      
      // Update local data
      this.transactions = this.pendingImportData.transactions;
      this.categories = this.pendingImportData.categories;
      this.recurring = this.pendingImportData.recurring;
      this.settings = this.pendingImportData.settings;
      
      // Save to local DB
      for (const tx of this.transactions) {
        await db.saveTransaction(tx);
      }
      for (const cat of this.categories) {
        await db.saveCategory(cat);
      }
      for (const rec of this.recurring) {
        await db.saveRecurring(rec);
      }
      for (const [key, value] of Object.entries(this.settings)) {
        await db.setSetting(key, value);
      }
      
      success.classList.remove('hidden');
      this.pendingImportData = null;
      
      // Reload UI after 1.5 seconds
      setTimeout(() => {
        this.closeImportModal();
        this.switchView('add');
        this.renderCategories();
        syncService.sync();
      }, 1500);
      
    } catch (error) {
      this.showImportError('Import failed: ' + error.message);
      confirmBtn.disabled = false;
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new SpendTrackApp();
});
