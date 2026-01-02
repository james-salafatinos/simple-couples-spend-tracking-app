# SpendTrack - Couples Spending Tracker

A simple, fast, offline-first PWA for tracking spending between two people (James & Samantha).

## Features

- **Quick Entry**: Add spending in seconds with auto-populated defaults
- **Offline-First**: Works fully offline, syncs when online
- **Analytics**: View spending by week, month, category, and person
- **Recurring Transactions**: Set up subscriptions and recurring bills
- **Export**: Backup data as JSON or CSV
- **PWA**: Install on mobile (Android/iPhone) for native-like experience

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```
PASSWORD=your_shared_password_here
PORT=3000
```

### 3. Run the App

```bash
npm start
```

Visit `http://localhost:3000` in your browser.

### 4. Install as PWA (Mobile)

1. Open the app in your mobile browser
2. **Android**: Tap menu → "Add to Home Screen"
3. **iPhone**: Tap Share → "Add to Home Screen"

## Usage

### Adding Spending

1. Select the date (defaults to today)
2. Choose person (James or Samantha)
3. Pick a category or create a new one
4. Enter vendor name and amount
5. Add optional memo
6. Tap "Add Spending"

### Viewing Transactions

- Filter by person, category, date range
- Search by vendor or memo
- Tap any transaction to edit or delete

### Analytics

- Toggle between James, Samantha, or Combined view
- See weekly, monthly, and all-time totals
- View spending breakdown by category

### Recurring Transactions

1. Go to Settings → Recurring Transactions
2. Add new recurring entry with frequency (weekly/monthly/etc.)
3. Transactions auto-generate on schedule

### Export Data

- Settings → Export JSON (full backup)
- Settings → Export CSV (spreadsheet-friendly)

## Tech Stack

- **Backend**: Express.js
- **Frontend**: Vanilla HTML/CSS/JS
- **Storage**: JSON files (server) + IndexedDB (client)
- **Offline**: Service Worker + IndexedDB
- **Sync**: Last-write-wins with UUID-based records

## Project Structure

```
├── server.js           # Express server & API
├── package.json        # Dependencies
├── public/
│   ├── index.html      # Main HTML
│   ├── manifest.json   # PWA manifest
│   ├── sw.js           # Service Worker
│   ├── css/
│   │   └── styles.css  # All styles
│   ├── js/
│   │   ├── app.js      # Main app logic
│   │   ├── db.js       # IndexedDB wrapper
│   │   └── sync.js     # Sync service
│   └── icons/          # PWA icons
├── data/               # JSON data storage (auto-created)
└── tests/              # Unit & integration tests
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with password |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/check` | Check auth status |
| GET | `/api/transactions` | Get all transactions |
| POST | `/api/transactions` | Create transaction |
| POST | `/api/transactions/sync` | Sync transactions |
| PUT | `/api/transactions/:id` | Update transaction |
| DELETE | `/api/transactions/:id` | Soft delete transaction |
| GET | `/api/categories` | Get all categories |
| POST | `/api/categories` | Create category |
| POST | `/api/categories/sync` | Sync categories |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Soft delete category |
| GET | `/api/recurring` | Get recurring transactions |
| POST | `/api/recurring` | Create recurring |
| POST | `/api/recurring/sync` | Sync recurring |
| PUT | `/api/recurring/:id` | Update recurring |
| DELETE | `/api/recurring/:id` | Soft delete recurring |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |
| GET | `/api/export/json` | Export all data as JSON |
| GET | `/api/export/csv` | Export transactions as CSV |

## Sync Strategy

- Each record has a client-generated UUID
- Records include `createdAt`, `updatedAt`, `updatedBy`
- **Last-write-wins**: Newer `updatedAt` timestamp wins
- Soft deletes via `deletedAt` timestamp
- Automatic background sync when online
- Manual "Sync Now" button available

## Deployment (DigitalOcean App Platform)

1. Push code to your Git repository
2. Create new App in DigitalOcean App Platform
3. Connect your repository
4. Set environment variables:
   - `PASSWORD`: Your shared password
   - `PORT`: 8080 (or as configured)
5. Deploy!

The app will automatically:
- Install dependencies
- Start the server
- Serve the PWA

## Running Tests

```bash
npm test
```

Tests cover:
- Transaction validation
- Category CRUD operations
- Analytics aggregation
- Sync merge logic (last-write-wins)
- Recurring transaction generation

## Data Storage

**Server-side** (`/data/` directory):
- `transactions.json` - All spending entries
- `categories.json` - Category list
- `settings.json` - App settings
- `recurring.json` - Recurring transaction definitions

**Client-side** (IndexedDB):
- Mirrors server data for offline access
- Sync queue for pending changes

## Security Notes

- Simple shared password authentication
- Password stored in environment variable (not in code)
- Auth token stored in HTTP-only cookie (1 year expiry)
- No sensitive data transmitted - just spending records

## Timezone

All dates use **US Central Time** (America/Chicago).
Week starts on **Monday**.

## License

MIT
