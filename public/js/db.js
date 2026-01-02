// IndexedDB wrapper for offline storage
const DB_NAME = 'SpendTrackDB';
const DB_VERSION = 1;

const STORES = {
  transactions: 'transactions',
  categories: 'categories',
  settings: 'settings',
  recurring: 'recurring',
  syncQueue: 'syncQueue'
};

class Database {
  constructor() {
    this.db = null;
    this.ready = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Transactions store
        if (!db.objectStoreNames.contains(STORES.transactions)) {
          const txStore = db.createObjectStore(STORES.transactions, { keyPath: 'id' });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('person', 'person', { unique: false });
          txStore.createIndex('category', 'category', { unique: false });
          txStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Categories store
        if (!db.objectStoreNames.contains(STORES.categories)) {
          const catStore = db.createObjectStore(STORES.categories, { keyPath: 'id' });
          catStore.createIndex('name', 'name', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'key' });
        }

        // Recurring store
        if (!db.objectStoreNames.contains(STORES.recurring)) {
          const recStore = db.createObjectStore(STORES.recurring, { keyPath: 'id' });
          recStore.createIndex('nextDate', 'nextDate', { unique: false });
        }

        // Sync queue for pending changes
        if (!db.objectStoreNames.contains(STORES.syncQueue)) {
          const syncStore = db.createObjectStore(STORES.syncQueue, { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  async ensureReady() {
    if (!this.db) {
      await this.ready;
    }
    return this.db;
  }

  // Generic CRUD operations
  async getAll(storeName) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, id) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, item) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, id) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async bulkPut(storeName, items) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      items.forEach(item => store.put(item));
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Transaction-specific methods
  async getTransactions() {
    const all = await this.getAll(STORES.transactions);
    return all.filter(t => !t.deletedAt);
  }

  async getAllTransactionsIncludingDeleted() {
    return this.getAll(STORES.transactions);
  }

  async saveTransaction(transaction) {
    await this.put(STORES.transactions, transaction);
    await this.addToSyncQueue('transaction', transaction);
    return transaction;
  }

  async deleteTransaction(id) {
    const tx = await this.get(STORES.transactions, id);
    if (tx) {
      tx.deletedAt = new Date().toISOString();
      tx.updatedAt = new Date().toISOString();
      await this.put(STORES.transactions, tx);
      await this.addToSyncQueue('transaction', tx);
    }
    return tx;
  }

  // Category-specific methods
  async getCategories() {
    const all = await this.getAll(STORES.categories);
    return all.filter(c => !c.deletedAt);
  }

  async getAllCategoriesIncludingDeleted() {
    return this.getAll(STORES.categories);
  }

  async saveCategory(category) {
    await this.put(STORES.categories, category);
    await this.addToSyncQueue('category', category);
    return category;
  }

  async deleteCategory(id) {
    const cat = await this.get(STORES.categories, id);
    if (cat) {
      cat.deletedAt = new Date().toISOString();
      cat.updatedAt = new Date().toISOString();
      await this.put(STORES.categories, cat);
      await this.addToSyncQueue('category', cat);
    }
    return cat;
  }

  // Recurring-specific methods
  async getRecurring() {
    const all = await this.getAll(STORES.recurring);
    return all.filter(r => !r.deletedAt);
  }

  async getAllRecurringIncludingDeleted() {
    return this.getAll(STORES.recurring);
  }

  async saveRecurring(recurring) {
    await this.put(STORES.recurring, recurring);
    await this.addToSyncQueue('recurring', recurring);
    return recurring;
  }

  async deleteRecurring(id) {
    const rec = await this.get(STORES.recurring, id);
    if (rec) {
      rec.deletedAt = new Date().toISOString();
      rec.updatedAt = new Date().toISOString();
      await this.put(STORES.recurring, rec);
      await this.addToSyncQueue('recurring', rec);
    }
    return rec;
  }

  // Settings methods
  async getSetting(key) {
    const result = await this.get(STORES.settings, key);
    return result ? result.value : null;
  }

  async setSetting(key, value) {
    await this.put(STORES.settings, { key, value });
  }

  async getSettings() {
    const all = await this.getAll(STORES.settings);
    const settings = {};
    all.forEach(item => {
      settings[item.key] = item.value;
    });
    return settings;
  }

  // Sync queue methods
  async addToSyncQueue(type, data) {
    await this.put(STORES.syncQueue, {
      type,
      data,
      timestamp: new Date().toISOString()
    });
  }

  async getSyncQueue() {
    return this.getAll(STORES.syncQueue);
  }

  async clearSyncQueue() {
    return this.clear(STORES.syncQueue);
  }

  // Merge server data with local (last-write-wins)
  async mergeTransactions(serverTransactions) {
    const localTransactions = await this.getAllTransactionsIncludingDeleted();
    const merged = this.mergeRecords(localTransactions, serverTransactions);
    await this.clear(STORES.transactions);
    await this.bulkPut(STORES.transactions, merged);
    return merged.filter(t => !t.deletedAt);
  }

  async mergeCategories(serverCategories) {
    const localCategories = await this.getAllCategoriesIncludingDeleted();
    const merged = this.mergeRecords(localCategories, serverCategories);
    await this.clear(STORES.categories);
    await this.bulkPut(STORES.categories, merged);
    return merged.filter(c => !c.deletedAt);
  }

  async mergeRecurring(serverRecurring) {
    const localRecurring = await this.getAllRecurringIncludingDeleted();
    const merged = this.mergeRecords(localRecurring, serverRecurring);
    await this.clear(STORES.recurring);
    await this.bulkPut(STORES.recurring, merged);
    return merged.filter(r => !r.deletedAt);
  }

  mergeRecords(localRecords, serverRecords) {
    const merged = new Map();

    // Add all local records
    for (const record of localRecords) {
      merged.set(record.id, record);
    }

    // Merge server records using last-write-wins
    for (const serverRecord of serverRecords) {
      const localRecord = merged.get(serverRecord.id);

      if (!localRecord) {
        merged.set(serverRecord.id, serverRecord);
      } else {
        const localTime = new Date(localRecord.updatedAt).getTime();
        const serverTime = new Date(serverRecord.updatedAt).getTime();

        if (serverTime > localTime) {
          merged.set(serverRecord.id, serverRecord);
        }
      }
    }

    return Array.from(merged.values());
  }
}

// Generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Export singleton instance
const db = new Database();
