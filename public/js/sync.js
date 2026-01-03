// Sync service for offline-first functionality
class SyncService {
  constructor(database) {
    this.db = database;
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.syncCallbacks = [];
    this.syncResultCallbacks = [];
    this.lastSyncTime = null;
    this.syncStats = {
      transactions: { added: 0, updated: 0, conflicted: 0 },
      categories: { added: 0, updated: 0 },
      recurring: { added: 0, updated: 0 }
    };
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyStatusChange();
      this.sync();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyStatusChange();
    });
  }

  onStatusChange(callback) {
    this.syncCallbacks.push(callback);
  }

  onSyncResult(callback) {
    this.syncResultCallbacks.push(callback);
  }

  notifyStatusChange() {
    const status = this.getStatus();
    this.syncCallbacks.forEach(cb => cb(status));
  }

  notifySyncResult(result) {
    this.syncResultCallbacks.forEach(cb => cb(result));
  }

  getStatus() {
    if (!this.isOnline) return 'offline';
    if (this.isSyncing) return 'syncing';
    return 'synced';
  }

  async sync() {
    if (!this.isOnline || this.isSyncing) return;
    
    this.isSyncing = true;
    this.notifyStatusChange();
    this.resetStats();
    
    try {
      // Sync transactions
      await this.syncTransactions();
      
      // Sync categories
      await this.syncCategories();
      
      // Sync recurring
      await this.syncRecurring();
      
      // Clear sync queue after successful sync
      await this.db.clearSyncQueue();
      
      this.lastSyncTime = new Date();
      const result = {
        success: true,
        stats: this.syncStats,
        timestamp: this.lastSyncTime,
        message: this.generateSyncMessage()
      };
      this.notifySyncResult(result);
      console.log('Sync completed successfully', result);
    } catch (error) {
      console.error('Sync failed:', error);
      const result = {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
      this.notifySyncResult(result);
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }
  }

  resetStats() {
    this.syncStats = {
      transactions: { added: 0, updated: 0, conflicted: 0 },
      categories: { added: 0, updated: 0 },
      recurring: { added: 0, updated: 0 }
    };
  }

  generateSyncMessage() {
    const tx = this.syncStats.transactions;
    const cat = this.syncStats.categories;
    const total = tx.added + tx.updated + cat.added + cat.updated;
    
    if (total === 0) return 'Cool';
    
    const parts = [];
    if (tx.added > 0) parts.push(`${tx.added} transaction${tx.added > 1 ? 's' : ''} added`);
    if (tx.updated > 0) parts.push(`${tx.updated} transaction${tx.updated > 1 ? 's' : ''} updated`);
    if (cat.added > 0) parts.push(`${cat.added} categor${cat.added > 1 ? 'ies' : 'y'} added`);
    if (cat.updated > 0) parts.push(`${cat.updated} categor${cat.updated > 1 ? 'ies' : 'y'} updated`);
    
    return parts.join(', ');
  }

  async syncTransactions() {
    const localTransactions = await this.db.getAllTransactionsIncludingDeleted();
    
    try {
      const response = await fetch('/api/transactions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: localTransactions }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const serverTransactions = Array.isArray(data) ? data : data.transactions || [];
        const stats = data.stats || { added: 0, updated: 0, conflicted: 0 };
        
        this.syncStats.transactions = stats;
        await this.db.mergeTransactions(serverTransactions);
      } else if (response.status === 401) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Transaction sync failed:', error);
      throw error;
    }
  }

  async syncCategories() {
    const localCategories = await this.db.getAllCategoriesIncludingDeleted();
    
    try {
      const response = await fetch('/api/categories/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: localCategories }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const serverCategories = Array.isArray(data) ? data : data.categories || [];
        const stats = data.stats || { added: 0, updated: 0 };
        
        this.syncStats.categories = stats;
        await this.db.mergeCategories(serverCategories);
      }
    } catch (error) {
      console.error('Category sync failed:', error);
      throw error;
    }
  }

  async syncRecurring() {
    const localRecurring = await this.db.getAllRecurringIncludingDeleted();
    
    try {
      const response = await fetch('/api/recurring/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurring: localRecurring }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const serverRecurring = Array.isArray(data) ? data : data.recurring || [];
        const stats = data.stats || { added: 0, updated: 0 };
        
        this.syncStats.recurring = stats;
        await this.db.mergeRecurring(serverRecurring);
      }
    } catch (error) {
      console.error('Recurring sync failed:', error);
      throw error;
    }
  }

  async fetchInitialData() {
    if (!this.isOnline) {
      // Load from local DB if offline
      return {
        transactions: await this.db.getTransactions(),
        categories: await this.db.getCategories(),
        recurring: await this.db.getRecurring()
      };
    }
    
    try {
      // Fetch from server
      const [txRes, catRes, recRes] = await Promise.all([
        fetch('/api/transactions', { credentials: 'include' }),
        fetch('/api/categories', { credentials: 'include' }),
        fetch('/api/recurring', { credentials: 'include' })
      ]);
      
      if (txRes.ok && catRes.ok && recRes.ok) {
        const transactions = await txRes.json();
        const categories = await catRes.json();
        const recurring = await recRes.json();
        
        // Merge with local data
        const mergedTx = await this.db.mergeTransactions(transactions);
        const mergedCat = await this.db.mergeCategories(categories);
        const mergedRec = await this.db.mergeRecurring(recurring);
        
        return {
          transactions: mergedTx,
          categories: mergedCat,
          recurring: mergedRec
        };
      }
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
    }
    
    // Fallback to local data
    return {
      transactions: await this.db.getTransactions(),
      categories: await this.db.getCategories(),
      recurring: await this.db.getRecurring()
    };
  }
}

// Export singleton
const syncService = new SyncService(db);
