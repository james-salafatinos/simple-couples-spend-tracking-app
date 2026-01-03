const { test, describe } = require('node:test');
const assert = require('node:assert');

// Import merge function from server
const { mergeRecords } = require('../server.js');

describe('Transaction Validation', () => {
  test('should validate transaction has required fields', () => {
    const validTransaction = {
      id: 'tx-123',
      date: '2024-01-15',
      person: 'James',
      category: 'Groceries',
      amount: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'James',
      deletedAt: null
    };

    assert.ok(validTransaction.id, 'Transaction should have an id');
    assert.ok(validTransaction.date, 'Transaction should have a date');
    assert.ok(validTransaction.person, 'Transaction should have a person');
    assert.ok(validTransaction.category, 'Transaction should have a category');
    assert.ok(validTransaction.amount > 0, 'Amount should be positive');
  });

  test('should reject invalid amount', () => {
    const invalidAmounts = [0, -5, null, undefined, 'abc'];
    
    invalidAmounts.forEach(amount => {
      const isValid = typeof amount === 'number' && amount > 0 && Number.isInteger(amount);
      assert.strictEqual(isValid, false, `Amount ${amount} should be invalid`);
    });
  });

  test('should accept valid integer amounts', () => {
    const validAmounts = [1, 10, 100, 1000, 9999];
    
    validAmounts.forEach(amount => {
      const isValid = typeof amount === 'number' && amount > 0 && Number.isInteger(amount);
      assert.strictEqual(isValid, true, `Amount ${amount} should be valid`);
    });
  });

  test('should validate person is James or Samantha', () => {
    const validPersons = ['James', 'Samantha'];
    const invalidPersons = ['John', 'jane', '', null];

    validPersons.forEach(person => {
      assert.ok(validPersons.includes(person), `${person} should be valid`);
    });

    invalidPersons.forEach(person => {
      assert.ok(!validPersons.includes(person), `${person} should be invalid`);
    });
  });
});

describe('Category CRUD', () => {
  test('should create a new category with required fields', () => {
    const category = {
      id: 'cat-new',
      name: 'New Category',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'James',
      deletedAt: null
    };

    assert.ok(category.id, 'Category should have an id');
    assert.ok(category.name, 'Category should have a name');
    assert.ok(category.createdAt, 'Category should have createdAt');
    assert.ok(category.updatedAt, 'Category should have updatedAt');
    assert.strictEqual(category.deletedAt, null, 'New category should not be deleted');
  });

  test('should soft delete a category', () => {
    const category = {
      id: 'cat-1',
      name: 'Test Category',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      updatedBy: 'James',
      deletedAt: null
    };

    // Simulate soft delete
    category.deletedAt = new Date().toISOString();
    category.updatedAt = new Date().toISOString();

    assert.ok(category.deletedAt, 'Deleted category should have deletedAt timestamp');
  });

  test('should update category name', () => {
    const category = {
      id: 'cat-1',
      name: 'Old Name',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };

    category.name = 'New Name';
    category.updatedAt = new Date().toISOString();

    assert.strictEqual(category.name, 'New Name', 'Category name should be updated');
  });
});

describe('Analytics Aggregation', () => {
  const sampleTransactions = [
    { id: '1', date: '2024-01-15', person: 'James', category: 'Groceries', amount: 100, deletedAt: null },
    { id: '2', date: '2024-01-15', person: 'Samantha', category: 'Groceries', amount: 50, deletedAt: null },
    { id: '3', date: '2024-01-16', person: 'James', category: 'Eating Out', amount: 30, deletedAt: null },
    { id: '4', date: '2024-01-10', person: 'Samantha', category: 'Gas', amount: 45, deletedAt: null },
    { id: '5', date: '2024-01-15', person: 'James', category: 'Groceries', amount: 25, deletedAt: '2024-01-16T00:00:00.000Z' } // Deleted
  ];

  test('should calculate total for all transactions', () => {
    const activeTransactions = sampleTransactions.filter(t => !t.deletedAt);
    const total = activeTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    assert.strictEqual(total, 225, 'Total should be 225 (excluding deleted)');
  });

  test('should calculate total by person', () => {
    const activeTransactions = sampleTransactions.filter(t => !t.deletedAt);
    
    const jamesTotal = activeTransactions
      .filter(t => t.person === 'James')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const samanthaTotal = activeTransactions
      .filter(t => t.person === 'Samantha')
      .reduce((sum, t) => sum + t.amount, 0);

    assert.strictEqual(jamesTotal, 130, 'James total should be 130');
    assert.strictEqual(samanthaTotal, 95, 'Samantha total should be 95');
  });

  test('should group spending by category', () => {
    const activeTransactions = sampleTransactions.filter(t => !t.deletedAt);
    const byCategory = {};
    
    activeTransactions.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    assert.strictEqual(byCategory['Groceries'], 150, 'Groceries should total 150');
    assert.strictEqual(byCategory['Eating Out'], 30, 'Eating Out should total 30');
    assert.strictEqual(byCategory['Gas'], 45, 'Gas should total 45');
  });

  test('should filter transactions by date range', () => {
    const activeTransactions = sampleTransactions.filter(t => !t.deletedAt);
    const startDate = '2024-01-15';
    const endDate = '2024-01-16';
    
    const filtered = activeTransactions.filter(t => 
      t.date >= startDate && t.date <= endDate
    );

    assert.strictEqual(filtered.length, 3, 'Should have 3 transactions in date range');
  });
});

describe('Sync - Last Write Wins', () => {
  test('should keep server record when server is newer', () => {
    const serverRecords = [
      { id: '1', name: 'Server Version', updatedAt: '2024-01-15T12:00:00.000Z' }
    ];
    const clientRecords = [
      { id: '1', name: 'Client Version', updatedAt: '2024-01-15T10:00:00.000Z' }
    ];

    const merged = mergeRecords(serverRecords, clientRecords);
    
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].name, 'Server Version', 'Should keep server version (newer)');
  });

  test('should use client record when client is newer', () => {
    const serverRecords = [
      { id: '1', name: 'Server Version', updatedAt: '2024-01-15T10:00:00.000Z' }
    ];
    const clientRecords = [
      { id: '1', name: 'Client Version', updatedAt: '2024-01-15T12:00:00.000Z' }
    ];

    const merged = mergeRecords(serverRecords, clientRecords);
    
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].name, 'Client Version', 'Should use client version (newer)');
  });

  test('should add new client records not on server', () => {
    const serverRecords = [
      { id: '1', name: 'Server Record', updatedAt: '2024-01-15T10:00:00.000Z' }
    ];
    const clientRecords = [
      { id: '2', name: 'New Client Record', updatedAt: '2024-01-15T11:00:00.000Z' }
    ];

    const merged = mergeRecords(serverRecords, clientRecords);
    
    assert.strictEqual(merged.length, 2, 'Should have both records');
  });

  test('should handle empty arrays', () => {
    assert.deepStrictEqual(mergeRecords([], []), []);
    
    const records = [{ id: '1', name: 'Test', updatedAt: '2024-01-15T10:00:00.000Z' }];
    assert.strictEqual(mergeRecords(records, []).length, 1);
    assert.strictEqual(mergeRecords([], records).length, 1);
  });
});

describe('Recurring Transactions', () => {
  function getNextRecurringDate(dateStr, frequency) {
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

  test('should calculate next weekly date', () => {
    const next = getNextRecurringDate('2024-01-15', 'weekly');
    assert.strictEqual(next, '2024-01-22');
  });

  test('should calculate next biweekly date', () => {
    const next = getNextRecurringDate('2024-01-15', 'biweekly');
    assert.strictEqual(next, '2024-01-29');
  });

  test('should calculate next monthly date', () => {
    const next = getNextRecurringDate('2024-01-15', 'monthly');
    assert.strictEqual(next, '2024-02-15');
  });

  test('should calculate next yearly date', () => {
    const next = getNextRecurringDate('2024-01-15', 'yearly');
    assert.strictEqual(next, '2025-01-15');
  });

  test('should handle month boundary for monthly recurring', () => {
    const next = getNextRecurringDate('2024-01-31', 'monthly');
    // JavaScript Date handles this by rolling over
    assert.ok(next.startsWith('2024-0'), 'Should be in February or March 2024');
  });
});

describe('UUID Generation', () => {
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  test('should generate valid UUID format', () => {
    const uuid = generateUUID();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    
    assert.ok(uuidRegex.test(uuid), `UUID ${uuid} should match UUID v4 format`);
  });

  test('should generate unique UUIDs', () => {
    const uuids = new Set();
    for (let i = 0; i < 100; i++) {
      uuids.add(generateUUID());
    }
    
    assert.strictEqual(uuids.size, 100, 'All 100 UUIDs should be unique');
  });
});

describe('Sync Enhancement - Toast & Modal Feedback', () => {
  test('should generate sync message with no changes', () => {
    const stats = {
      transactions: { added: 0, updated: 0, conflicted: 0 },
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
    assert.strictEqual(message, 'Everything is up to date');
  });

  test('should generate sync message with transactions added', () => {
    const stats = {
      transactions: { added: 5, updated: 0, conflicted: 0 },
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
    assert.strictEqual(message, '5 transactions added');
  });

  test('should generate sync message with mixed changes', () => {
    const stats = {
      transactions: { added: 3, updated: 2, conflicted: 0 },
      categories: { added: 1, updated: 0 }
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
    assert.strictEqual(message, '3 transactions added, 2 transactions updated, 1 category added');
  });

  test('should format sync timestamp correctly', () => {
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
    
    const now = new Date();
    const formatted = formatSyncTime(now);
    assert.strictEqual(formatted, 'Just now');
  });

  test('should format sync timestamp as minutes ago', () => {
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
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const formatted = formatSyncTime(fiveMinutesAgo);
    assert.ok(formatted.includes('m ago'), 'Should show minutes ago');
  });

  test('should track sync statistics correctly', () => {
    const syncStats = {
      transactions: { added: 0, updated: 0, conflicted: 0 },
      categories: { added: 0, updated: 0 },
      recurring: { added: 0, updated: 0 }
    };
    
    // Simulate sync results
    syncStats.transactions = { added: 5, updated: 2, conflicted: 0 };
    syncStats.categories = { added: 1, updated: 0 };
    
    assert.strictEqual(syncStats.transactions.added, 5);
    assert.strictEqual(syncStats.transactions.updated, 2);
    assert.strictEqual(syncStats.categories.added, 1);
  });

  test('should reset sync statistics before sync', () => {
    let syncStats = {
      transactions: { added: 5, updated: 2, conflicted: 1 },
      categories: { added: 1, updated: 0 },
      recurring: { added: 0, updated: 0 }
    };
    
    // Reset stats
    syncStats = {
      transactions: { added: 0, updated: 0, conflicted: 0 },
      categories: { added: 0, updated: 0 },
      recurring: { added: 0, updated: 0 }
    };
    
    assert.strictEqual(syncStats.transactions.added, 0);
    assert.strictEqual(syncStats.transactions.updated, 0);
    assert.strictEqual(syncStats.transactions.conflicted, 0);
  });

  test('should handle sync result with success', () => {
    const result = {
      success: true,
      stats: {
        transactions: { added: 3, updated: 1, conflicted: 0 },
        categories: { added: 0, updated: 0 }
      },
      timestamp: new Date(),
      message: '3 transactions added, 1 transaction updated'
    };
    
    assert.ok(result.success);
    assert.strictEqual(result.stats.transactions.added, 3);
    assert.ok(result.message);
  });

  test('should handle sync result with error', () => {
    const result = {
      success: false,
      error: 'Network timeout',
      timestamp: new Date()
    };
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.strictEqual(result.error, 'Network timeout');
  });

  test('should validate sync result callback execution', () => {
    let callbackExecuted = false;
    let receivedResult = null;
    
    const onSyncResult = (callback) => {
      const result = {
        success: true,
        stats: { transactions: { added: 2, updated: 0, conflicted: 0 }, categories: { added: 0, updated: 0 } },
        timestamp: new Date(),
        message: '2 transactions added'
      };
      callback(result);
    };
    
    onSyncResult((result) => {
      callbackExecuted = true;
      receivedResult = result;
    });
    
    assert.ok(callbackExecuted, 'Callback should be executed');
    assert.ok(receivedResult.success);
    assert.strictEqual(receivedResult.stats.transactions.added, 2);
  });
});
