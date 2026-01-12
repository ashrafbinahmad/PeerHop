# Android Download Progress Issue - Parallel Range Requests

## Current Status

The previous fixes addressed:

- ✅ Sequential range requests (browser requests chunks one after another)
- ✅ Backend monotonic progress (prevents backwards movement in transaction store)
- ✅ Frontend monotonic progress (prevents UI from showing backwards movement)

## Remaining Issue: Parallel Range Requests

### Problem

Modern Android browsers (especially Chrome) make **multiple simultaneous range requests** to download files faster:

```
Request 1: Range: bytes=0-1048575      (0-1MB)
Request 2: Range: bytes=1048576-2097151 (1-2MB)
Request 3: Range: bytes=2097152-3145727 (2-3MB)
```

These requests happen **in parallel**, not sequentially.

### What Happens

1. **Request 1** starts, creates writer with `BytesOffset=0`
2. **Request 2** starts **simultaneously**, creates writer with `BytesOffset=1048576`
3. **Request 3** starts **simultaneously**, creates writer with `BytesOffset=2097152`

Each writer reports progress independently:

- Writer 1: Reports 0, 512KB, 1MB...
- Writer 2: Reports 1MB, 1.5MB, 2MB... (simultaneously with Writer 1!)
- Writer 3: Reports 2MB, 2.5MB, 3MB... (simultaneously with Writers 1 & 2!)

### The Race Condition

The `UpdateClientProgress` function has a monotonic check:

```go
if bytesTransferred > previousBytes {
    // Update progress
} else {
    // Ignore backwards movement
}
```

But with parallel requests, this can fail:

**Timeline:**

1. t=0ms: Writer 2 reports 1.5MB → Updates to 1.5MB ✅
2. t=10ms: Writer 1 reports 512KB → **Ignored** (512KB < 1.5MB) ❌
3. t=20ms: Writer 3 reports 2.2MB → Updates to 2.2MB ✅
4. t=30ms: Writer 2 reports 1.8MB → **Ignored** (1.8MB < 2.2MB) ❌

**Result:** Progress appears to stall at 2.2MB even though data is still being downloaded!

## Root Cause

The current implementation tracks **cumulative** progress per client, but doesn't account for:

1. Multiple simultaneous connections from the same client
2. Out-of-order progress updates from parallel range requests

## Solution

We need to track **per-connection** progress instead of just per-client progress. This requires:

### Option 1: Connection-Level Tracking (Recommended)

Track each HTTP connection separately and aggregate:

```go
type Transaction struct {
    // ... existing fields ...

    // Track each connection's progress individually
    ClientConnections map[string]map[string]int64 // clientIP -> connectionID -> bytesTransferred
}
```

Then aggregate all connections to get total progress:

```go
func (ts *TransactionStore) UpdateConnectionProgress(id int, clientIP string, connectionID string, bytesTransferred int64, totalBytes int64) {
    // Update this specific connection's progress
    // Then aggregate all connections for this client to get total progress
}
```

### Option 2: Range-Aware Progress (Simpler Fix)

Instead of checking if `bytesTransferred > previousBytes`, check if the **range has already been downloaded**:

```go
type Transaction struct {
    // ... existing fields ...

    // Track downloaded byte ranges for each client
    ClientRanges map[string][]ByteRange // clientIP -> list of downloaded ranges
}

type ByteRange struct {
    Start int64
    End   int64
}
```

When a range request completes, mark that range as downloaded and recalculate total:

```go
func (ts *TransactionStore) UpdateRangeProgress(id int, clientIP string, start, end int64) {
    // Add or merge this range into ClientRanges
    // Calculate total bytes from all non-overlapping ranges
}
```

### Option 3: Maximum Progress from All Connections (Quick Fix)

Keep track of the **highest byte position** seen from any connection:

```go
// In transactionProgressWriter.Write()
cumulativeBytes := w.BytesOffset + w.BytesWritten
maxPosition := w.BytesOffset + int64(len(chunkBeingWritten))

// Report the maximum position reached, not cumulative bytes
w.TxStore.UpdateClientProgress(w.TxnID, w.ClientIP, maxPosition, w.TotalBytes)
```

This way, if multiple connections are active:

- Connection 1 at position 512KB → reports 512KB
- Connection 2 at position 2MB → reports 2MB (higher, so updates)
- Connection 1 at position 1MB → reports 1MB (lower, ignored)

This is correct because we only care about the **furthest byte downloaded**.

## Recommended Implementation

**Option 3** is the quickest fix and should work for most cases. Here's the implementation:

### Backend Changes

**File: `pkg/server/unified_handler.go`**

Currently, the writer reports cumulative bytes. We need to report the maximum position instead. But wait - with parallel requests, we actually want to track **which bytes have been downloaded**, not just the maximum position.

**Actually, the current implementation should work!** Let me re-analyze...

## Re-Analysis: Why It Still Fails

Looking back at the code:

```go
cumulativeBytes := w.BytesOffset + w.BytesWritten
w.TxStore.UpdateClientProgress(w.TxnID, w.ClientIP, cumulativeBytes, w.TotalBytes)
```

With parallel requests:

- Writer 1 (offset=0, written=512KB) reports: 0 + 512KB = 512KB
- Writer 2 (offset=1MB, written=512KB) reports: 1MB + 512KB = 1.5MB

The monotonic check should handle this correctly...

**But the issue is timing!** The problem occurs during rapid updates:

1. Writer 2 writes chunk and reports 1.5MB
2. **Before Thread 2 releases the mutex**, Writer 1 tries to acquire it
3. Writer 1 reports 512KB → Correctly ignored
4. But the **WebSocket update** might get delayed
5. Frontend might receive updates out of order!

## Actual Root Cause: WebSocket Message Ordering

The real issue is that WebSocket messages can arrive **out of order**!

1. Backend sends: 512KB, 1.5MB, 1.7MB, 2MB
2. Frontend receives: 512KB, 1.5MB, **2MB**, 1.7MB ← Out of order!

Even with backend monotonic checks, the WebSocket layer doesn't guarantee message ordering.

## The Real Fix

The frontend already has `highestProgressRef` to handle this! But let's verify it's working correctly...

Looking at the frontend code (lines 655-663):

```typescript
const previousHighest = highestProgressRef.current[transaction.id] || 0;
if (currentProgress < previousHighest && currentProgress > 0) {
  // Don't let it go backwards
  currentProgress = previousHighest;
} else if (currentProgress > previousHighest) {
  // Update the highest seen
  highestProgressRef.current[transaction.id] = currentProgress;
}
```

This **should** prevent backwards movement... So what's the issue?

## Hypothesis: The Real Problem

The issue might be with **speed calculation**, not progress display!

In `useTransferSpeed.ts`:

```typescript
const prevBytes = prevBytesRef.current[txn.id];
const bytesDiff = currentBytes - prevBytes;

if (bytesDiff > 0) {
  const speed = bytesDiff / timeDiff;
  // ...
} else if (bytesDiff === 0) {
  newSpeeds[txn.id] = "0.0 MB/s";
}
```

With parallel requests and out-of-order WebSocket messages:

1. Update 1: 1.5MB → Speed calculated correctly
2. Update 2: 1.3MB (out of order!) → `bytesDiff < 0` → Speed set to previous value (not 0)
3. But if previous speed expired, it shows "0.0 MB/s"

Wait, looking at line 61-62:

```typescript
// If bytesDiff is negative (shouldn't happen but handle it), keep previous speed
```

So negative diff is handled by keeping previous speed. That should work...

## Debug Strategy

To identify the exact issue, we need logging. Add debug logs to see:

1. Backend: Log every progress update with timestamp, connection ID, offset, bytes
2. Frontend: Log every WebSocket message received with values
3. Frontend: Log when `highestProgressRef` prevents backwards movement

Let me create the debug version...
