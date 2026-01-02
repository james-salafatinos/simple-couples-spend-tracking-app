// Sync service for offline-first functionality
class SyncService {
  constructor(database) {
    this.db = database;
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.syncCallbacks = [];
    
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

  notifyStatusChange() {
    const status = this.getStatus();
    this.syncCallbacks.forEach(cb => cb(status));
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
    
    try {
      // Sync transactions
      await this.syncTransactions();
      
      // Sync categories
      await this.syncCategories();
      
      // Sync recurring
      await this.syncRecurring();
      
      // Clear sync queue after successful sync
      await this.db.clearSyncQueue();
      
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }
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
        const serverTransactions = await response.json();
        await this.db.mergeTransactions(serverTransactions);
      } else if (response.status === 401) {
        // Not authenticated, redirect to login
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
        const serverCategories = await response.json();
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
        const serverRecurring = await response.json();
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
