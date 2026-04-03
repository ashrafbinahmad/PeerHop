# Mobile Download Progress - Root Cause & Complete Fix

## Problem Summary

Download progress on mobile browsers (especially Android) was:

1. **Going backwards** - Progress would jump from 65% → 58% → 72%
2. **Not matching browser download** - UI showed different progress than browser's download manager
3. **Speed disappearing** - Download speed would show "0.0 MB/s" intermittently
4. **Downloaded bytes jumping** - "Downloaded" amount varying wildly

## Root Cause Analysis

### Backend Issue (Primary)

The main issue was in **how the backend tracks download progress with browser range requests**:

1. **Browser Behavior**: When downloading files, mobile browsers (especially Chrome on Android) make **multiple HTTP range requests** to download the file in chunks
   - First request: `Range: bytes=0-1023`
   - Second request: `Range: bytes=1024-2047`
   - And so on...

2. **Backend Bug**: For each range request, a **new** `transactionProgressWriter` was created with:

   ```go
   BytesWritten: 0  // Reset to 0 for each request!
   ```

3. **Result**: Each new range request reported progress starting from 0, making it appear the download restarted

### Frontend Issues (Secondary)

- Speed calculation hook wasn't preserving speeds between rapid updates
- No monotonicity enforcement on progress display
- Calculated bytes from percentage instead of using actual WebSocket data

## Complete Solution

### 1. Backend Fixes ✅

#### A. Range Request Support (`unified_handler.go`)

Added proper range request handling:

```go
type transactionProgressWriter struct {
    // ... existing fields ...
    BytesWritten int64  // Bytes written in THIS request
    BytesOffset  int64  // Starting offset for range requests (NEW!)
}
```

Parse Range header to get offset:

```go
rangeHeader := r.Header.Get("Range")
// Parse "bytes=1024-2047" to extract offset: 1024
bytesOffset := parseRangeOffset(rangeHeader)
```

Calculate cumulative progress:

```go
cumulativeBytes := w.BytesOffset + w.BytesWritten
w.TxStore.UpdateClientProgress(w.TxnID, w.ClientIP, cumulativeBytes, w.TotalBytes)
```

#### B. Monotonic Progress (`transaction.go`)

Ensure progress only increases in the transaction store:

```go
func (ts *TransactionStore) UpdateClientProgress(...) {
    previousBytes := txn.ClientBytes[clientIP]
    previousProgress := txn.ClientProgress[clientIP]

    // Only update if making forward progress
    if bytesTransferred > previousBytes {
        // Update progress
    } else if bytesTransferred == totalBytes {
        // Always set to 100% when complete
    }
    // Ignore backwards movement
}
```

### 2. Frontend Fixes ✅

#### A. Speed Stability (`useTransferSpeed.ts`)

```typescript
if (timeDiff >= 0.5) {
  // Calculate new speed
} else {
  // Preserve previous speed from state
  if (speeds[txn.id]) {
    newSpeeds[txn.id] = speeds[txn.id];
  }
}
```

#### B. Progress Monotonicity (`MobileUnified.tsx`)

```typescript
const highestProgressRef = useRef<Record<number, number>>({});

// Ensure progress never decreases
if (currentProgress < previousHighest && currentProgress > 0) {
  currentProgress = previousHighest; // Don't go backwards
} else if (currentProgress > previousHighest) {
  highestProgressRef.current[transaction.id] = currentProgress;
}
```

#### C. Accurate Byte Display (`MobileUnified.tsx`)

```typescript
// Use actual bytes from WebSocket instead of calculating from percentage
if (transaction.clientBytes && transaction.clientBytes[myIp]) {
  downloadedBytes = transaction.clientBytes[myIp]; // Actual bytes!
} else {
  downloadedBytes = fileSize * (percent / 100); // Fallback calc
}
```

## How It Works Now

### Normal Download Flow:

1. User clicks download → Browser initiates download
2. Browser makes request: `GET /api/download-file/123 Range: bytes=0-1023`
3. Backend creates writer with `BytesOffset=0`, `TotalBytes=10000`
4. Writer writes 1024 bytes → reports `cumulativeBytes = 0 + 1024 = 1024`
5. Progress: 1024/10000 = 10.24%

### Range Request (Browser makes second request):

1. Browser makes request: `GET /api/download-file/123 Range: bytes=1024-2047`
2. Backend creates NEW writer with `BytesOffset=1024`, `TotalBytes=10000`
3. Writer writes 1024 bytes → reports `cumulativeBytes = 1024 + 1024 = 2048`
4. Progress: 2048/10000 = 20.48% ✅ (Continues from previous!)

### Monotonicity Protection:

- Backend: Rejects any bytesTransferred < previousBytes
- Frontend: `highestProgressRef` ensures UI never shows decreasing progress
- Result: Smooth, always-increasing progress bar

## Files Modified

### Backend:

1. **`pkg/server/transaction.go`**
   - Made `UpdateClientProgress` monotonic
   - Added previousBytes/previousProgress tracking

2. **`pkg/server/unified_handler.go`**
   - Added `BytesOffset` field to `transactionProgressWriter`
   - Parse Range header to extract offset
   - Calculate cumulative bytes for progress updates

### Frontend:

1. **`ui/frontend/src/hooks/useTransferSpeed.ts`**
   - Preserve speeds between rapid updates
   - Add validation and clamping
   - Skip non-in-progress transactions

2. **`ui/frontend/src/views/MobileUnified.tsx`**
   - Added `highestProgressRef` for monotonic progress
   - Use actual `clientBytes` instead of calculated values
   - Clamp progress to 0-100% range

## Testing Checklist

Run these tests on an **Android phone** (Chrome/Firefox):

1. ✅ **Large File Download** (100MB+)
   - Progress should only increase, never decrease
   - Completion should reach exactly 100%
2. ✅ **Multiple Downloads** (3-5 simultaneous)
   - Each should track independently
   - No progress mixing between files

3. ✅ **Network Interruption**
   - Pause/resume download
   - Progress should continue from last point

4. ✅ **Speed Display**
   - Speed should stay visible throughout
   - Should show reasonable values (not 0.0 or 10000+)

5. ✅ **Browser vs UI Progress**
   - Compare browser's download manager with UI
   - Should match within ~5%

## Expected Behavior After Fix

✅ Progress goes from 0% → 100% smoothly, **never backwards**
✅ Speed stays visible and stable throughout download
✅ Downloaded bytes increase monoton ically
✅ UI progress matches browser download progress
✅ Handles browser range requests transparently
✅ Works across all mobile browsers (Chrome, Firefox, Safari)

## Technical Notes

- **Range requests are normal**: Browsers use them for resumable downloads and better performance
- **http.ServeContent** handles range requests automatically, we just need to track offset
- **Mobile browsers** are more aggressive with range requests than desktopbrowsers
- **Monotonicity** must be enforced at both backend (source of truth) and frontend (UX)
