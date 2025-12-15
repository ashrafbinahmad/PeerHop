# WebSocket Download Progress Fix

## Issue
Download progress was not showing on mobile clients when downloading files from the server.

## Root Cause
The WebSocket monitoring system was storing direct pointers to transactions instead of copies, which prevented proper change detection. When the transaction was updated in the store, the "last" transaction reference was also updated (since they pointed to the same object), making it appear as if nothing had changed.

## Fixes Applied

### 1. Transaction Copy Storage (`pkg/server/websocket.go`)
**Problem**: Storing pointers meant the comparison always showed identical values.

**Fix**: Create copies of transactions when storing them for comparison:
```go
// Before
lastTransactions[txn.ID] = txn

// After  
txnCopy := *txn
lastTransactions[txn.ID] = &txnCopy
```

This ensures we're comparing against the previous state, not the current state.

### 2. Locking Optimization
**Problem**: Potential deadlock when broadcasting while holding mutex.

**Fix**: Release lock before calling Broadcast:
```go
hub.mu.Lock()
shouldBroadcast := /* condition check */
if shouldBroadcast {
    hub.lastSentPercent[txn.ID] = currentPercent
}
hub.mu.Unlock()

if shouldBroadcast {
    hub.Broadcast("transaction_update", txn)
}
```

### 3. Debug Logging
Added comprehensive logging to help diagnose issues:
- **Backend**: Logs when broadcasting transaction updates with ID, filename, percent, and status
- **Frontend**: Logs when receiving transaction updates via WebSocket

## How It Works Now

1. **Download Starts**: Server creates transaction with 0% progress
2. **Progress Updates**: 
   - `transactionProgressWriter` updates transaction store every 200ms
   - WebSocket monitor checks transactions every 500ms
   - When percentage changes by a whole number (1%, 2%, etc.), broadcasts update
3. **Frontend Receives**: 
   - WebSocket hook receives `transaction_update` message
   - Updates existing transaction in state
   - UI re-renders with new progress percentage
4. **Visual Display**:
   - Mobile shows progress overlay (`bg-[#007bff50]`) 
   - Width animates based on `transactionPercent`

## Testing

### To Verify Fix Works:

1. **Start Application**: Run `wails dev`
2. **Open Mobile Client**: Scan QR code from mobile browser
3. **Send File from Desktop**: Select files to share
4. **Watch Console**:
   
   **Backend logs** (in terminal):
   ```
   [WebSocket] Broadcasting txn 1: example.pdf 0% (status: pending)
   [WebSocket] Broadcasting txn 1: example.pdf 1% (status: in_progress)
   [WebSocket] Broadcasting txn 1: example.pdf 2% (status: in_progress)
   ...
   [WebSocket] Broadcasting txn 1: example.pdf 100% (status: completed)
   ```
   
   **Frontend logs** (in browser console):
   ```
   [useTransactions] Update: txn 1 - example.pdf 0% (pending)
   [useTransactions] Update: txn 1 - example.pdf 1% (in_progress)
   [useTransactions] Update: txn 1 - example.pdf 2% (in_progress)
   ...
   ```

5. **Watch Mobile UI**: Blue progress overlay should animate from left to right

### Visual Confirmation
- Progress overlay div has `width: ${transaction.transactionPercent}%`
- Should see smooth animation from 0% to 100%
- Only updates on whole number percentages (reduces jitter)

## Performance Optimization

The system only broadcasts when:
1. First time seeing a transaction
2. Percentage increases to next whole number (not 1.5%, only 1%, 2%, etc.)
3. Status changes to "completed"

This prevents excessive WebSocket traffic while maintaining smooth visual progress.

## Before vs After

**Before**:
- ❌ Transactions compared against themselves
- ❌ Changes never detected
- ❌ No WebSocket broadcasts
- ❌ No progress shown

**After**:
- ✅ Transactions compared against snapshots
- ✅ Changes properly detected
- ✅ Real-time WebSocket broadcasts
- ✅ Smooth progress display

## Files Modified

1. `pkg/server/websocket.go`:
   - Fixed transaction copy storage
   - Improved locking mechanism
   - Added debug logging

2. `ui/frontend/src/hooks/useTransactions.ts`:
   - Added debug logging for received updates

## Related Documentation
- See `WEBSOCKET_IMPLEMENTATION.md` for architecture details
- See `WEBSOCKET_TESTING.md` for comprehensive testing guide
