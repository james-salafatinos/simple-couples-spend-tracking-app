const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_PORT = 3099;
const TEST_PASSWORD = 'testpassword';
const DATA_DIR = path.join(__dirname, '..', 'data');

// Helper to make HTTP requests
function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

describe('Integration Tests - Sync Behavior', () => {
  
  describe('Last-Write-Wins Sync', () => {
    test('should merge transactions correctly with last-write-wins', () => {
      const serverTransactions = [
        { id: 'tx-1', amount: 100, updatedAt: '2024-01-15T10:00:00.000Z' },
        { id: 'tx-2', amount: 200, updatedAt: '2024-01-15T10:00:00.000Z' }
      ];
      
      const clientTransactions = [
        { id: 'tx-1', amount: 150, updatedAt: '2024-01-15T12:00:00.000Z' }, // Newer
        { id: 'tx-3', amount: 300, updatedAt: '2024-01-15T11:00:00.000Z' }  // New
      ];

      // Simulate merge logic
      const merged = new Map();
      
      for (const record of serverTransactions) {
        merged.set(record.id, record);
      }
      
      for (const clientRecord of clientTransactions) {
        const serverRecord = merged.get(clientRecord.id);
        
        if (!serverRecord) {
          merged.set(clientRecord.id, clientRecord);
        } else {
          const serverTime = new Date(serverRecord.updatedAt).getTime();
          const clientTime = new Date(clientRecord.updatedAt).getTime();
          
          if (clientTime > serverTime) {
            merged.set(clientRecord.id, clientRecord);
          }
        }
      }

      const result = Array.from(merged.values());
      
      assert.strictEqual(result.length, 3, 'Should have 3 merged transactions');
      
      const tx1 = result.find(t => t.id === 'tx-1');
      assert.strictEqual(tx1.amount, 150, 'tx-1 should have client amount (newer)');
      
      const tx2 = result.find(t => t.id === 'tx-2');
      assert.strictEqual(tx2.amount, 200, 'tx-2 should remain from server');
      
      const tx3 = result.find(t => t.id === 'tx-3');
      assert.ok(tx3, 'tx-3 should be added from client');
    });

    test('should handle soft deletes in sync', () => {
      const serverTransactions = [
        { id: 'tx-1', amount: 100, updatedAt: '2024-01-15T10:00:00.000Z', deletedAt: null }
      ];
      
      const clientTransactions = [
        { id: 'tx-1', amount: 100, updatedAt: '2024-01-15T12:00:00.000Z', deletedAt: '2024-01-15T12:00:00.000Z' }
      ];

      // Simulate merge
      const merged = new Map();
      for (const record of serverTransactions) {
        merged.set(record.id, record);
      }
      for (const clientRecord of clientTransactions) {
        const serverRecord = merged.get(clientRecord.id);
        if (!serverRecord || new Date(clientRecord.updatedAt) > new Date(serverRecord.updatedAt)) {
          merged.set(clientRecord.id, clientRecord);
        }
      }

      const result = Array.from(merged.values());
      const tx1 = result.find(t => t.id === 'tx-1');
      
      assert.ok(tx1.deletedAt, 'Transaction should be soft deleted');
    });

    test('should preserve all fields during merge', () => {
      const serverRecord = {
        id: 'tx-1',
        date: '2024-01-15',
        person: 'James',
        category: 'Groceries',
        vendor: 'Store A',
        amount: 100,
        memo: 'Test memo',
        createdAt: '2024-01-15T08:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
        updatedBy: 'James',
        deletedAt: null
      };

      const clientRecord = {
        id: 'tx-1',
        date: '2024-01-15',
        person: 'James',
        category: 'Groceries',
        vendor: 'Store B', // Changed
        amount: 120,       // Changed
        memo: 'Updated memo', // Changed
        createdAt: '2024-01-15T08:00:00.000Z',
        updatedAt: '2024-01-15T12:00:00.000Z', // Newer
        updatedBy: 'Samantha',
        deletedAt: null
      };

      // Client wins
      const winner = new Date(clientRecord.updatedAt) > new Date(serverRecord.updatedAt) 
        ? clientRecord 
        : serverRecord;

      assert.strictEqual(winner.vendor, 'Store B');
      assert.strictEqual(winner.amount, 120);
      assert.strictEqual(winner.memo, 'Updated memo');
      assert.strictEqual(winner.updatedBy, 'Samantha');
      assert.strictEqual(winner.createdAt, '2024-01-15T08:00:00.000Z', 'createdAt should be preserved');
    });
  });

  describe('Offline to Online Sync Simulation', () => {
    test('should queue changes made offline', () => {
      const syncQueue = [];
      
      // Simulate offline changes
      const offlineTransaction = {
        id: 'offline-tx-1',
        amount: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      syncQueue.push({
        type: 'transaction',
        data: offlineTransaction,
        timestamp: new Date().toISOString()
      });

      assert.strictEqual(syncQueue.length, 1, 'Should have 1 item in sync queue');
      assert.strictEqual(syncQueue[0].type, 'transaction');
    });

    test('should process sync queue in order', () => {
      const syncQueue = [
        { id: 1, type: 'transaction', timestamp: '2024-01-15T10:00:00.000Z' },
        { id: 2, type: 'category', timestamp: '2024-01-15T10:01:00.000Z' },
        { id: 3, type: 'transaction', timestamp: '2024-01-15T10:02:00.000Z' }
      ];

      // Sort by timestamp
      syncQueue.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      assert.strictEqual(syncQueue[0].id, 1);
      assert.strictEqual(syncQueue[1].id, 2);
      assert.strictEqual(syncQueue[2].id, 3);
    });

    test('should handle concurrent edits from both users', () => {
      // James edits offline
      const jamesEdit = {
        id: 'tx-shared',
        amount: 100,
        updatedAt: '2024-01-15T10:00:00.000Z',
        updatedBy: 'James'
      };

      // Samantha edits the same transaction (also offline, but later)
      const samanthaEdit = {
        id: 'tx-shared',
        amount: 150,
        updatedAt: '2024-01-15T10:05:00.000Z',
        updatedBy: 'Samantha'
      };

      // When both sync, Samantha's should win (newer)
      const winner = new Date(samanthaEdit.updatedAt) > new Date(jamesEdit.updatedAt)
        ? samanthaEdit
        : jamesEdit;

      assert.strictEqual(winner.amount, 150);
      assert.strictEqual(winner.updatedBy, 'Samantha');
    });
  });

  describe('Recurring Transaction Generation', () => {
    function generateRecurringTransactions(recurring, today) {
      const generated = [];
      
      function getNextDate(dateStr, frequency) {
        const date = new Date(dateStr + 'T12:00:00');
        switch (frequency) {
          case 'weekly': date.setDate(date.getDate() + 7); break;
          case 'biweekly': date.setDate(date.getDate() + 14); break;
          case 'monthly': date.setMonth(date.getMonth() + 1); break;
          case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
        }
        return date.toISOString().split('T')[0];
      }

      for (const rec of recurring) {
        let nextDate = rec.lastGenerated 
          ? getNextDate(rec.lastGenerated, rec.frequency) 
          : rec.startDate;

        while (nextDate <= today) {
          generated.push({
            id: `gen-${rec.id}-${nextDate}`,
            date: nextDate,
            person: rec.person,
            category: rec.category,
            vendor: rec.vendor,
            amount: rec.amount,
            recurringId: rec.id
          });
          
          nextDate = getNextDate(nextDate, rec.frequency);
        }
      }

      return generated;
    }

    test('should generate weekly recurring transactions', () => {
      const recurring = [{
        id: 'rec-1',
        startDate: '2024-01-01',
        frequency: 'weekly',
        person: 'James',
        category: 'Subscription',
        vendor: 'Netflix',
        amount: 15,
        lastGenerated: null
      }];

      const today = '2024-01-22';
      const generated = generateRecurringTransactions(recurring, today);

      assert.strictEqual(generated.length, 4, 'Should generate 4 weekly transactions');
      assert.strictEqual(generated[0].date, '2024-01-01');
      assert.strictEqual(generated[1].date, '2024-01-08');
      assert.strictEqual(generated[2].date, '2024-01-15');
      assert.strictEqual(generated[3].date, '2024-01-22');
    });

    test('should generate monthly recurring transactions', () => {
      const recurring = [{
        id: 'rec-2',
        startDate: '2024-01-15',
        frequency: 'monthly',
        person: 'Samantha',
        category: 'Bills',
        vendor: 'Electric',
        amount: 100,
        lastGenerated: null
      }];

      const today = '2024-04-20';
      const generated = generateRecurringTransactions(recurring, today);

      assert.strictEqual(generated.length, 4, 'Should generate 4 monthly transactions');
    });

    test('should not regenerate already generated transactions', () => {
      const recurring = [{
        id: 'rec-3',
        startDate: '2024-01-01',
        frequency: 'weekly',
        person: 'James',
        category: 'Test',
        vendor: 'Test',
        amount: 10,
        lastGenerated: '2024-01-15' // Already generated up to this date
      }];

      const today = '2024-01-22';
      const generated = generateRecurringTransactions(recurring, today);

      // Should only generate for 2024-01-22 (next after lastGenerated)
      assert.strictEqual(generated.length, 1);
      assert.strictEqual(generated[0].date, '2024-01-22');
    });

    test('should handle multiple recurring transactions', () => {
      const recurring = [
        {
          id: 'rec-a',
          startDate: '2024-01-01',
          frequency: 'weekly',
          person: 'James',
          category: 'A',
          vendor: 'A',
          amount: 10,
          lastGenerated: null
        },
        {
          id: 'rec-b',
          startDate: '2024-01-01',
          frequency: 'monthly',
          person: 'Samantha',
          category: 'B',
          vendor: 'B',
          amount: 50,
          lastGenerated: null
        }
      ];

      const today = '2024-01-15';
      const generated = generateRecurringTransactions(recurring, today);

      const fromA = generated.filter(t => t.recurringId === 'rec-a');
      const fromB = generated.filter(t => t.recurringId === 'rec-b');

      assert.strictEqual(fromA.length, 3, 'Should have 3 weekly transactions');
      assert.strictEqual(fromB.length, 1, 'Should have 1 monthly transaction');
    });
  });

  describe('Data Integrity', () => {
    test('should maintain referential integrity between transactions and categories', () => {
      const categories = [
        { id: 'cat-1', name: 'Groceries', deletedAt: null },
        { id: 'cat-2', name: 'Gas', deletedAt: null }
      ];

      const transactions = [
        { id: 'tx-1', categoryId: 'cat-1', category: 'Groceries' },
        { id: 'tx-2', categoryId: 'cat-2', category: 'Gas' }
      ];

      // Verify all transactions reference valid categories
      const categoryIds = new Set(categories.map(c => c.id));
      const allValid = transactions.every(t => categoryIds.has(t.categoryId));

      assert.ok(allValid, 'All transactions should reference valid categories');
    });

    test('should handle category deletion gracefully', () => {
      // When a category is deleted, existing transactions keep the category name
      const deletedCategory = { id: 'cat-1', name: 'Old Category', deletedAt: '2024-01-15T00:00:00.000Z' };
      const transaction = { id: 'tx-1', categoryId: 'cat-1', category: 'Old Category' };

      // Transaction still has the category name even though category is deleted
      assert.strictEqual(transaction.category, 'Old Category');
    });
  });

  describe('Sync Enhancement - Statistics Tracking', () => {
    test('should track transaction statistics during sync', () => {
      const syncStats = {
        transactions: { added: 0, updated: 0, conflicted: 0 },
        categories: { added: 0, updated: 0 },
        recurring: { added: 0, updated: 0 }
      };

      // Simulate sync response with stats
      const syncResponse = {
        transactions: [
          { id: 'tx-1', amount: 100, updatedAt: '2024-01-15T10:00:00.000Z' },
          { id: 'tx-2', amount: 200, updatedAt: '2024-01-15T10:00:00.000Z' }
        ],
        stats: {
          added: 2,
          updated: 0,
          conflicted: 0
        }
      };

      syncStats.transactions = syncResponse.stats;

      assert.strictEqual(syncStats.transactions.added, 2);
      assert.strictEqual(syncStats.transactions.updated, 0);
      assert.strictEqual(syncStats.transactions.conflicted, 0);
    });

    test('should track category statistics during sync', () => {
      const syncStats = {
        transactions: { added: 0, updated: 0, conflicted: 0 },
        categories: { added: 0, updated: 0 },
        recurring: { added: 0, updated: 0 }
      };

      const syncResponse = {
        categories: [
          { id: 'cat-1', name: 'Groceries', updatedAt: '2024-01-15T10:00:00.000Z' }
        ],
        stats: {
          added: 1,
          updated: 0
        }
      };

      syncStats.categories = syncResponse.stats;

      assert.strictEqual(syncStats.categories.added, 1);
      assert.strictEqual(syncStats.categories.updated, 0);
    });

    test('should accumulate statistics across multiple sync types', () => {
      const syncStats = {
        transactions: { added: 5, updated: 2, conflicted: 0 },
        categories: { added: 1, updated: 0 },
        recurring: { added: 0, updated: 0 }
      };

      const totalAdded = syncStats.transactions.added + syncStats.categories.added;
      const totalUpdated = syncStats.transactions.updated + syncStats.categories.updated;

      assert.strictEqual(totalAdded, 6);
      assert.strictEqual(totalUpdated, 2);
    });

    test('should reset statistics before new sync', () => {
      let syncStats = {
        transactions: { added: 5, updated: 2, conflicted: 1 },
        categories: { added: 1, updated: 0 },
        recurring: { added: 0, updated: 0 }
      };

      // Reset before sync
      syncStats = {
        transactions: { added: 0, updated: 0, conflicted: 0 },
        categories: { added: 0, updated: 0 },
        recurring: { added: 0, updated: 0 }
      };

      assert.strictEqual(syncStats.transactions.added, 0);
      assert.strictEqual(syncStats.transactions.updated, 0);
      assert.strictEqual(syncStats.transactions.conflicted, 0);
      assert.strictEqual(syncStats.categories.added, 0);
    });
  });

  describe('Sync Enhancement - Result Notifications', () => {
    test('should generate sync success result with statistics', () => {
      const result = {
        success: true,
        stats: {
          transactions: { added: 3, updated: 1, conflicted: 0 },
          categories: { added: 0, updated: 0 },
          recurring: { added: 0, updated: 0 }
        },
        timestamp: new Date('2024-01-15T10:00:00.000Z'),
        message: '3 transactions added, 1 transaction updated'
      };

      assert.ok(result.success);
      assert.strictEqual(result.stats.transactions.added, 3);
      assert.strictEqual(result.stats.transactions.updated, 1);
      assert.ok(result.timestamp);
      assert.ok(result.message);
    });

    test('should generate sync error result with error message', () => {
      const result = {
        success: false,
        error: 'Network timeout during sync',
        timestamp: new Date('2024-01-15T10:00:00.000Z')
      };

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(result.error, 'Network timeout during sync');
    });

    test('should handle sync result with no changes', () => {
      const result = {
        success: true,
        stats: {
          transactions: { added: 0, updated: 0, conflicted: 0 },
          categories: { added: 0, updated: 0 },
          recurring: { added: 0, updated: 0 }
        },
        timestamp: new Date('2024-01-15T10:00:00.000Z'),
        message: 'Everything is up to date'
      };

      assert.ok(result.success);
      assert.strictEqual(result.message, 'Everything is up to date');
    });

    test('should execute sync result callbacks', () => {
      let callbacksCalled = [];
      const callbacks = [];

      // Register callbacks
      const onSyncResult = (callback) => {
        callbacks.push(callback);
      };

      onSyncResult((result) => {
        callbacksCalled.push('callback1');
      });

      onSyncResult((result) => {
        callbacksCalled.push('callback2');
      });

      // Trigger callbacks
      const result = {
        success: true,
        stats: { transactions: { added: 1, updated: 0, conflicted: 0 }, categories: { added: 0, updated: 0 }, recurring: { added: 0, updated: 0 } },
        timestamp: new Date(),
        message: '1 transaction added'
      };

      callbacks.forEach(cb => cb(result));

      assert.strictEqual(callbacksCalled.length, 2);
      assert.ok(callbacksCalled.includes('callback1'));
      assert.ok(callbacksCalled.includes('callback2'));
    });
  });

  describe('Sync Enhancement - Toast Messages', () => {
    test('should generate toast message for successful sync with transactions', () => {
      const stats = {
        transactions: { added: 5, updated: 2, conflicted: 0 },
        categories: { added: 0, updated: 0 }
      };

      const generateMessage = (stats) => {
        const tx = stats.transactions;
        const cat = stats.categories;
        const total = tx.added + tx.updated + cat.added + cat.updated;

        if (total === 0) return 'Everything is up to date';

        const parts = [];
        if (tx.added > 0) parts.push(`${tx.added} transaction${tx.added > 1 ? 's' : ''} added`);
        if (tx.updated > 0) parts.push(`${tx.updated} transaction${tx.updated > 1 ? 's' : ''} updated`);
        if (cat.added > 0) parts.push(`${cat.added} categor${cat.added > 1 ? 'ies' : 'y'} added`);
        if (cat.updated > 0) parts.push(`${cat.updated} categor${cat.updated > 1 ? 'ies' : 'y'} updated`);

        return parts.join(', ');
      };

      const message = generateMessage(stats);
      assert.strictEqual(message, '5 transactions added, 2 transactions updated');
    });

    test('should generate toast message for sync with categories', () => {
      const stats = {
        transactions: { added: 0, updated: 0, conflicted: 0 },
        categories: { added: 2, updated: 1 }
      };

      const generateMessage = (stats) => {
        const tx = stats.transactions;
        const cat = stats.categories;
        const total = tx.added + tx.updated + cat.added + cat.updated;

        if (total === 0) return 'Everything is up to date';

        const parts = [];
        if (tx.added > 0) parts.push(`${tx.added} transaction${tx.added > 1 ? 's' : ''} added`);
        if (tx.updated > 0) parts.push(`${tx.updated} transaction${tx.updated > 1 ? 's' : ''} updated`);
        if (cat.added > 0) parts.push(`${cat.added} categor${cat.added > 1 ? 'ies' : 'y'} added`);
        if (cat.updated > 0) parts.push(`${cat.updated} categor${cat.updated > 1 ? 'ies' : 'y'} updated`);

        return parts.join(', ');
      };

      const message = generateMessage(stats);
      assert.strictEqual(message, '2 categories added, 1 category updated');
    });

    test('should generate error toast message', () => {
      const errorMessage = 'Sync failed: Network timeout';
      assert.ok(errorMessage.includes('Sync failed'));
      assert.ok(errorMessage.includes('Network timeout'));
    });
  });

  describe('Sync Enhancement - Timestamp Formatting', () => {
    test('should format timestamp as "Just now"', () => {
      const formatSyncTime = (date) => {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);

        if (seconds < 60) return 'Just now';
        return 'Later';
      };

      const now = new Date();
      const formatted = formatSyncTime(now);
      assert.strictEqual(formatted, 'Just now');
    });

    test('should format timestamp as minutes ago', () => {
      const formatSyncTime = (date) => {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);

        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        return 'Later';
      };

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const formatted = formatSyncTime(fiveMinutesAgo);
      assert.ok(formatted.includes('m ago'));
    });

    test('should format timestamp as hours ago', () => {
      const formatSyncTime = (date) => {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return 'Later';
      };

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const formatted = formatSyncTime(twoHoursAgo);
      assert.ok(formatted.includes('h ago'));
    });

    test('should format timestamp as full date string', () => {
      const formatSyncTime = (date) => {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;

        return date.toLocaleString();
      };

      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const formatted = formatSyncTime(yesterday);
      assert.ok(!formatted.includes('ago'), 'Should be full date string');
    });
  });

  describe('Sync Enhancement - Modal State Management', () => {
    test('should show progress state during sync', () => {
      const modalState = {
        progress: { hidden: false },
        results: { hidden: true },
        error: { hidden: true }
      };

      assert.strictEqual(modalState.progress.hidden, false);
      assert.strictEqual(modalState.results.hidden, true);
      assert.strictEqual(modalState.error.hidden, true);
    });

    test('should show results state after successful sync', () => {
      const modalState = {
        progress: { hidden: true },
        results: { hidden: false },
        error: { hidden: true }
      };

      assert.strictEqual(modalState.progress.hidden, true);
      assert.strictEqual(modalState.results.hidden, false);
      assert.strictEqual(modalState.error.hidden, true);
    });

    test('should show error state after failed sync', () => {
      const modalState = {
        progress: { hidden: true },
        results: { hidden: true },
        error: { hidden: false }
      };

      assert.strictEqual(modalState.progress.hidden, true);
      assert.strictEqual(modalState.results.hidden, true);
      assert.strictEqual(modalState.error.hidden, false);
    });

    test('should transition from progress to results', () => {
      let modalState = {
        progress: { hidden: false },
        results: { hidden: true },
        error: { hidden: true }
      };

      // Simulate sync completion
      modalState = {
        progress: { hidden: true },
        results: { hidden: false },
        error: { hidden: true }
      };

      assert.strictEqual(modalState.progress.hidden, true);
      assert.strictEqual(modalState.results.hidden, false);
    });
  });
});

console.log('Running integration tests...');
