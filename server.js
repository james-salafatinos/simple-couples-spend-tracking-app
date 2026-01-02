require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.PASSWORD || 'changeme';

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Data directory setup
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Data file paths
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const RECURRING_FILE = path.join(DATA_DIR, 'recurring.json');

// Initialize data files if they don't exist
function initDataFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

const defaultCategories = [
  { id: 'cat-1', name: 'Groceries', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'James', deletedAt: null },
  { id: 'cat-2', name: 'Eating Out', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'James', deletedAt: null },
  { id: 'cat-3', name: 'Gas', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'James', deletedAt: null },
  { id: 'cat-4', name: 'Uber', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'James', deletedAt: null },
  { id: 'cat-5', name: 'Entertainment', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'James', deletedAt: null },
  { id: 'cat-6', name: 'Shopping', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'James', deletedAt: null },
  { id: 'cat-7', name: 'Bills', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'James', deletedAt: null },
  { id: 'cat-8', name: 'Other', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'James', deletedAt: null }
];

const defaultSettings = {
  lastUser: 'James',
  lastCategory: null,
  timezone: 'America/Chicago'
};

initDataFile(TRANSACTIONS_FILE, []);
initDataFile(CATEGORIES_FILE, defaultCategories);
initDataFile(SETTINGS_FILE, defaultSettings);
initDataFile(RECURRING_FILE, []);

// Helper functions
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Auth middleware
function authMiddleware(req, res, next) {
  const authToken = req.cookies.authToken;
  if (authToken === PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Auth routes
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD) {
    res.cookie('authToken', PASSWORD, {
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      sameSite: 'strict'
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('authToken');
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  const authToken = req.cookies.authToken;
  res.json({ authenticated: authToken === PASSWORD });
});

// Transaction routes
app.get('/api/transactions', authMiddleware, (req, res) => {
  const transactions = readJSON(TRANSACTIONS_FILE);
  res.json(transactions);
});

app.post('/api/transactions/sync', authMiddleware, (req, res) => {
  const clientTransactions = req.body.transactions || [];
  let serverTransactions = readJSON(TRANSACTIONS_FILE);
  
  // Merge using last-write-wins
  const merged = mergeRecords(serverTransactions, clientTransactions);
  writeJSON(TRANSACTIONS_FILE, merged);
  
  res.json(merged);
});

app.post('/api/transactions', authMiddleware, (req, res) => {
  const transactions = readJSON(TRANSACTIONS_FILE);
  const newTransaction = req.body;
  
  // Check if transaction with this ID already exists
  const existingIndex = transactions.findIndex(t => t.id === newTransaction.id);
  if (existingIndex >= 0) {
    // Update if client version is newer
    if (new Date(newTransaction.updatedAt) > new Date(transactions[existingIndex].updatedAt)) {
      transactions[existingIndex] = newTransaction;
    }
  } else {
    transactions.push(newTransaction);
  }
  
  writeJSON(TRANSACTIONS_FILE, transactions);
  res.json(newTransaction);
});

app.put('/api/transactions/:id', authMiddleware, (req, res) => {
  const transactions = readJSON(TRANSACTIONS_FILE);
  const index = transactions.findIndex(t => t.id === req.params.id);
  
  if (index >= 0) {
    const updated = { ...transactions[index], ...req.body };
    transactions[index] = updated;
    writeJSON(TRANSACTIONS_FILE, transactions);
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Transaction not found' });
  }
});

app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
  const transactions = readJSON(TRANSACTIONS_FILE);
  const index = transactions.findIndex(t => t.id === req.params.id);
  
  if (index >= 0) {
    // Soft delete
    transactions[index].deletedAt = new Date().toISOString();
    transactions[index].updatedAt = new Date().toISOString();
    writeJSON(TRANSACTIONS_FILE, transactions);
    res.json(transactions[index]);
  } else {
    res.status(404).json({ error: 'Transaction not found' });
  }
});

// Category routes
app.get('/api/categories', authMiddleware, (req, res) => {
  const categories = readJSON(CATEGORIES_FILE);
  res.json(categories);
});

app.post('/api/categories/sync', authMiddleware, (req, res) => {
  const clientCategories = req.body.categories || [];
  let serverCategories = readJSON(CATEGORIES_FILE);
  
  const merged = mergeRecords(serverCategories, clientCategories);
  writeJSON(CATEGORIES_FILE, merged);
  
  res.json(merged);
});

app.post('/api/categories', authMiddleware, (req, res) => {
  const categories = readJSON(CATEGORIES_FILE);
  const newCategory = req.body;
  
  const existingIndex = categories.findIndex(c => c.id === newCategory.id);
  if (existingIndex >= 0) {
    if (new Date(newCategory.updatedAt) > new Date(categories[existingIndex].updatedAt)) {
      categories[existingIndex] = newCategory;
    }
  } else {
    categories.push(newCategory);
  }
  
  writeJSON(CATEGORIES_FILE, categories);
  res.json(newCategory);
});

app.put('/api/categories/:id', authMiddleware, (req, res) => {
  const categories = readJSON(CATEGORIES_FILE);
  const index = categories.findIndex(c => c.id === req.params.id);
  
  if (index >= 0) {
    const updated = { ...categories[index], ...req.body };
    categories[index] = updated;
    writeJSON(CATEGORIES_FILE, categories);
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Category not found' });
  }
});

app.delete('/api/categories/:id', authMiddleware, (req, res) => {
  const categories = readJSON(CATEGORIES_FILE);
  const index = categories.findIndex(c => c.id === req.params.id);
  
  if (index >= 0) {
    categories[index].deletedAt = new Date().toISOString();
    categories[index].updatedAt = new Date().toISOString();
    writeJSON(CATEGORIES_FILE, categories);
    res.json(categories[index]);
  } else {
    res.status(404).json({ error: 'Category not found' });
  }
});

// Settings routes
app.get('/api/settings', authMiddleware, (req, res) => {
  const settings = readJSON(SETTINGS_FILE);
  res.json(settings);
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const settings = { ...readJSON(SETTINGS_FILE), ...req.body };
  writeJSON(SETTINGS_FILE, settings);
  res.json(settings);
});

// Recurring transactions routes
app.get('/api/recurring', authMiddleware, (req, res) => {
  const recurring = readJSON(RECURRING_FILE);
  res.json(recurring);
});

app.post('/api/recurring/sync', authMiddleware, (req, res) => {
  const clientRecurring = req.body.recurring || [];
  let serverRecurring = readJSON(RECURRING_FILE);
  
  const merged = mergeRecords(serverRecurring, clientRecurring);
  writeJSON(RECURRING_FILE, merged);
  
  res.json(merged);
});

app.post('/api/recurring', authMiddleware, (req, res) => {
  const recurring = readJSON(RECURRING_FILE);
  const newRecurring = req.body;
  
  const existingIndex = recurring.findIndex(r => r.id === newRecurring.id);
  if (existingIndex >= 0) {
    if (new Date(newRecurring.updatedAt) > new Date(recurring[existingIndex].updatedAt)) {
      recurring[existingIndex] = newRecurring;
    }
  } else {
    recurring.push(newRecurring);
  }
  
  writeJSON(RECURRING_FILE, recurring);
  res.json(newRecurring);
});

app.put('/api/recurring/:id', authMiddleware, (req, res) => {
  const recurring = readJSON(RECURRING_FILE);
  const index = recurring.findIndex(r => r.id === req.params.id);
  
  if (index >= 0) {
    const updated = { ...recurring[index], ...req.body };
    recurring[index] = updated;
    writeJSON(RECURRING_FILE, recurring);
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Recurring transaction not found' });
  }
});

app.delete('/api/recurring/:id', authMiddleware, (req, res) => {
  const recurring = readJSON(RECURRING_FILE);
  const index = recurring.findIndex(r => r.id === req.params.id);
  
  if (index >= 0) {
    recurring[index].deletedAt = new Date().toISOString();
    recurring[index].updatedAt = new Date().toISOString();
    writeJSON(RECURRING_FILE, recurring);
    res.json(recurring[index]);
  } else {
    res.status(404).json({ error: 'Recurring transaction not found' });
  }
});

// Export routes
app.get('/api/export/json', authMiddleware, (req, res) => {
  const data = {
    transactions: readJSON(TRANSACTIONS_FILE),
    categories: readJSON(CATEGORIES_FILE),
    settings: readJSON(SETTINGS_FILE),
    recurring: readJSON(RECURRING_FILE),
    exportedAt: new Date().toISOString()
  };
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=spending-backup-${new Date().toISOString().split('T')[0]}.json`);
  res.json(data);
});

app.get('/api/export/csv', authMiddleware, (req, res) => {
  const transactions = readJSON(TRANSACTIONS_FILE).filter(t => !t.deletedAt);
  
  const headers = ['Date', 'Person', 'Category', 'Vendor', 'Amount', 'Memo'];
  const rows = transactions.map(t => [
    t.date,
    t.person,
    t.category,
    `"${(t.vendor || '').replace(/"/g, '""')}"`,
    t.amount,
    `"${(t.memo || '').replace(/"/g, '""')}"`
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=spending-${new Date().toISOString().split('T')[0]}.csv`);
  res.send(csv);
});

// Merge function for last-write-wins sync
function mergeRecords(serverRecords, clientRecords) {
  const merged = new Map();
  
  // Add all server records
  for (const record of serverRecords) {
    merged.set(record.id, record);
  }
  
  // Merge client records using last-write-wins
  for (const clientRecord of clientRecords) {
    const serverRecord = merged.get(clientRecord.id);
    
    if (!serverRecord) {
      // New record from client
      merged.set(clientRecord.id, clientRecord);
    } else {
      // Compare updatedAt timestamps
      const serverTime = new Date(serverRecord.updatedAt).getTime();
      const clientTime = new Date(clientRecord.updatedAt).getTime();
      
      if (clientTime > serverTime) {
        merged.set(clientRecord.id, clientRecord);
      }
    }
  }
  
  return Array.from(merged.values());
}

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only start server if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Couples Spend App running on http://localhost:${PORT}`);
  });
}

module.exports = { app, mergeRecords };
