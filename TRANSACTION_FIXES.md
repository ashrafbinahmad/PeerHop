# Transaction System Fixes

## Issues Fixed

### 1. ✅ Transactions Changing Order in Mobile
**Problem:** Transactions were appearing in random order because Go's map iteration is non-deterministic.

**Solution:** Added sorting by timestamp in `GetAllTransactions()`:
```go
// Sort by timestamp (oldest first)
sort.Slice(result, func(i, j int) bool {
    return result[i].Timestamp.Before(result[j].Timestamp)
})
```

**File:** `pkg/server/transaction.go`

### 2. 🔍 Desktop Not Showing Files - Debugging Added
**Problem:** Files selected on desktop weren't appearing in the chat.

**Solution:** Added comprehensive logging to track transaction lifecycle:

#### Backend Logging:
- `[Desktop] Created download transaction ID=X for file: filename` - When desktop selects files
- `[Upload] Created transaction ID=X for file: filename (size: X bytes)` - When mobile uploads
- `[API] Returning X transactions` - When API endpoint is called
- `[API] TxStore is nil` - If transaction store isn't initialized

#### Frontend Logging:
- `[useTransactions] Fetched transactions: X [...]` - Shows all fetched transactions

**Files Modified:**
- `ui/app.go` - Desktop file selection logging
- `pkg/server/unified_handler.go` - Upload and API logging  
- `ui/frontend/src/hooks/useTransactions.ts` - Frontend fetch logging

## How to Debug

### Check Desktop Console
When you select files on desktop, you should see:
```
[Desktop] Created download transaction ID=1 for file: example.pdf
```

### Check Browser Console (F12)
You should see every 200ms:
```
[useTransactions] Fetched transactions: 1 [...]
```

### Check Terminal (Backend)
When mobile uploads, you should see:
```
[Upload] Created transaction ID=2 for file: photo.jpg (size: 1024000 bytes)
[API] Returning 2 transactions
```

## Expected Behavior

### Desktop:
1. Click "Send Files" button
2. Select file(s)
3. Console shows: `[Desktop] Created download transaction ID=X`
4. Transaction appears in chat immediately (within 200ms)
5. Shows as "📤 Ready to Send" with filename and size

### Mobile:
1. Click "Send Files" button
2. Select file(s)
3. Upload starts
4. Backend shows: `[Upload] Created transaction ID=X`
5. Transaction appears in chat on both desktop and mobile
6. Shows as "📤 Sent" on mobile, "📥 Received" on desktop

### Text Messages:
1. Click 💬 button
2. Type message and send
3. Transaction created instantly
4. Appears in chat on both UIs within 200ms

## Troubleshooting

### If Desktop Shows No Transactions:
1. Check browser console (F12) - should see polling logs
2. Check if `[API] Returning X transactions` shows count > 0
3. Verify transaction was created: look for `[Desktop] Created download transaction`

### If Mobile Order Keeps Changing:
- This should now be fixed with timestamp sorting
- Verify you're running the updated code
- Check that transactions have proper timestamps

### If Transactions Duplicate:
- Should not happen - React uses `key={transaction.id}`
- Check browser console for any errors
- Verify IDs are unique in API response

## Next Steps

1. **Test Desktop File Selection:**
   - Select files on desktop
   - Check console logs
   - Verify transaction appears in chat

2. **Test Mobile Upload:**
   - Upload file from mobile
   - Check backend logs
   - Verify appears on both UIs

3. **Test Text Messages:**
   - Send text from desktop
   - Send text from mobile
   - Verify bidirectional communication

4. **Verify Sorting:**
   - Send multiple messages/files
   - Verify chronological order maintained
   - Check oldest messages appear first

## Code Changes Summary

### Modified Files:
1. `pkg/server/transaction.go` - Added sorting
2. `ui/app.go` - Added desktop logging
3. `pkg/server/unified_handler.go` - Added upload/API logging
4. `ui/frontend/src/hooks/useTransactions.ts` - Added frontend logging

### No Breaking Changes:
- All existing functionality preserved
- Only added logging and sorting
- API responses unchanged
- Transaction structure unchanged
