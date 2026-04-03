# Transaction-Based Messaging System

## Overview

This document describes the in-memory transaction tracking system implemented for real-time file and text transfer monitoring between server and client.

## Backend Implementation

### 1. Transaction Structure (`pkg/server/transaction.go`)

```go
type Transaction struct {
    ID                  int                  `json:"id"`
    Type                TransactionType      `json:"type"`                    // "file" or "text"
    Direction           TransactionDirection `json:"direction"`               // "from server" or "from client"
    TransactionPercent  float64              `json:"transactionPercent"`      // Progress (0-100), resets to 0 when complete
    DownloadLink        string               `json:"downloadLink,omitempty"`  // For server files
    UploadLink          string               `json:"uploadLink,omitempty"`    // For client uploads
    SavedInLocation     string               `json:"savedInLocation,omitempty"` // For client files
    Filename            string               `json:"filename,omitempty"`      // File name
    FileSize            int64                `json:"fileSize,omitempty"`      // File size in bytes
    TextContent         string               `json:"textContent,omitempty"`   // Text message content
    Timestamp           time.Time            `json:"timestamp"`
    BytesTransferred    int64                `json:"bytesTransferred,omitempty"`
    Status              string               `json:"status"`                  // "pending", "in_progress", "completed", "failed"
}
```

### 2. Transaction Store

- **In-memory storage**: All transactions stored in `map[int]*Transaction`
- **Thread-safe**: Uses `sync.RWMutex` for concurrent access
- **Auto-incrementing IDs**: Unique ID for each transaction
- **Progress tracking**: Updates transaction progress in real-time

### 3. API Endpoints

#### GET `/api/transactions`

Returns all transactions for polling.

**Response:**

```json
{
  "transactions": [
    {
      "id": 1,
      "type": "file",
      "direction": "from client",
      "transactionPercent": 0,
      "filename": "example.pdf",
      "fileSize": 1024000,
      "status": "completed",
      "timestamp": "2025-12-12T07:00:00Z"
    }
  ]
}
```

#### POST `/api/send-text`

Send a text message.

**Request:**

```json
{
  "text": "Hello, this is a message",
  "direction": "from client" // or "from server"
}
```

**Response:**

```json
{
  "success": true,
  "id": 2
}
```

#### GET `/api/transaction/{id}`

Get specific transaction progress by ID.

**Response:**

```json
{
  "id": 1,
  "type": "file",
  "transactionPercent": 45.5,
  "status": "in_progress",
  ...
}
```

## Frontend Implementation

### 1. Transaction Polling Hook (`ui/frontend/src/hooks/useTransactions.ts`)

**Features:**

- Polls `/api/transactions` every 200ms
- Automatic state management
- Text message sending function
- Type-safe transaction interface

**Usage:**

```typescript
const { transactions, sendText, refreshTransactions } = useTransactions(500);
```

### 2. Mobile UI (`ui/frontend/src/views/MobileUnified.tsx`)

**Features:**

- Real-time transaction display
- Text message input with toggle button
- File upload with progress tracking
- Chat-style interface with:
  - Sent messages (right-aligned, blue)
  - Received messages (left-aligned, white)
  - Text messages (💬 icon)
  - File messages (📄 icon with size)
  - Progress indicators (⏳ with percentage)
  - Status indicators (✓ completed, ✗ failed)

**Text Message Flow:**

1. Click 💬 button to show text input
2. Type message and press Enter or click Send
3. Message sent to `/api/send-text` with direction "from client"
4. Transaction appears in chat immediately via polling

### 3. Desktop UI (`ui/frontend/src/views/DesktopView.tsx`)

**Features:**

- Same transaction display as mobile
- Text message button (💬) next to Send Files
- Expandable text input field
- Real-time updates via polling
- Shows both sent and received transactions

**Text Message Flow:**

1. Click 💬 button to show text input
2. Type message and press Enter or click Send
3. Message sent to `/api/send-text` with direction "from server"
4. Transaction appears in chat immediately via polling

## Transaction Lifecycle

### File Upload (Client → Server)

1. **Client uploads file** → POST `/api/upload`
2. **Server creates transaction** with:
   - Type: "file"
   - Direction: "from client"
   - Status: "in_progress"
3. **Server saves file** and updates transaction:
   - SavedInLocation: absolute path
   - Status: "completed"
   - TransactionPercent: 0 (reset after completion)
4. **Client polls** and displays in chat

### File Download (Server → Client)

1. **Server prepares file** via `StartTransfer()`
2. **Server creates transaction** with:
   - Type: "file"
   - Direction: "from server"
   - DownloadLink: "/api/download"
   - Status: "pending"
3. **Client downloads** via QR code scan
4. **Transaction visible** on both UIs via polling

### Text Message

1. **User sends text** via UI
2. **POST `/api/send-text`** creates transaction:
   - Type: "text"
   - Direction: "from client" or "from server"
   - Status: "completed" (instant)
   - TransactionPercent: 0
3. **Both UIs poll** and display message immediately

## Key Features

### ✅ Real-time Progress

- Polling every 200ms ensures near-instant updates
- Progress percentage shown for in-progress transfers
- Status indicators for completed/failed transfers

### ✅ No Duplication

- Transactions identified by unique ID
- React key={transaction.id} prevents duplicates
- No localStorage needed (server is source of truth)

### ✅ Unified Chat Interface

- Both files and text in same chat view
- Chronological ordering by timestamp
- Visual distinction between sent/received
- Auto-scroll to latest message

### ✅ Bidirectional Communication

- Server can send files and text to client
- Client can send files and text to server
- Direction clearly indicated in UI

## Progress Tracking

### Transaction Percent Behavior

- **During transfer**: 0-100% based on bytes transferred
- **On completion**: Automatically resets to 0 (as per requirement)
- **Display**: Shows percentage only when status is "in_progress"

### Status States

- `pending`: Transaction created, not started
- `in_progress`: Transfer ongoing, percentage updating
- `completed`: Transfer finished successfully
- `failed`: Transfer failed with error

## Testing Checklist

- [x] Backend transaction store created
- [x] API endpoints implemented
- [x] Frontend polling hook created
- [x] Mobile UI updated with transactions
- [x] Desktop UI updated with transactions
- [x] Text message support added
- [x] Progress tracking working
- [x] No duplicate messages
- [x] Real-time updates (200ms polling)
- [x] Both UIs show same data

## Future Enhancements

1. **WebSocket Support**: Replace polling with WebSocket for true real-time updates
2. **Transaction History**: Add pagination for large transaction lists
3. **File Preview**: Show thumbnails for image files
4. **Download Progress**: Track download progress on client side
5. **Message Editing**: Allow editing/deleting sent messages
6. **Read Receipts**: Show when messages are seen by other party
