# Android Download Progress Debugging - Next Steps

## Changes Made

Added comprehensive debug logging to track download progress issues:

### 1. Backend Progress Writer (`unified_handler.go`)

**Location**: `transactionProgressWriter.Write()`

```
[PROGRESS-DEBUG] TxID=X Client=IP Offset=Y Written=Z Cumulative=A Total=B Percent=C%
```

Shows:

- Transaction ID
- Client IP
- Range request offset
- Bytes written in this request
- Cumulative bytes (offset + written)
- Total file size
- Current percentage

### 2. Transaction Store Updates (`transaction.go`)

**Location**: `UpdateClientProgress()`

```
[UPDATE-DEBUG] TxID=X Client=IP Previous=A/T (P%) New=B/T (N%) ✅ UPDATED to X%
[UPDATE-DEBUG] TxID=X Client=IP Previous=A/T (P%) New=B/T (N%) ⏸️ SKIPPED (reason)
```

Shows:

- Previous vs. new bytes/progress
- Whether update was accepted or rejected
- Reason for rejection (if any)

### 3. Range Request Parsing (`unified_handler.go`)

**Location**: `serveFile()`

```
[RANGE-DEBUG] TxID=X Client=IP RangeHeader=bytes=Y-Z Offset=Y
[RANGE-DEBUG] TxID=X Client=IP NO Range header (full download)
```

Shows:

- Original Range header from browser
- Parsed offset value
- Whether browser is using range requests

## How to Test

### Step 1: Start the Desktop App

```bash
cd "f:\PeerHop\PeerHop desktop"
npm run dev
```

### Step 2: Open on Android Device

1. Scan the QR code to connect your Android phone
2. Navigate to a download in the UI

### Step 3: Start a Download

Download a file (preferably 10MB+ to see range request behavior)

### Step 4: Monitor the Terminal

Watch for debug logs in the terminal running `npm run dev`. You should see:

```
[RANGE-DEBUG] TxID=123 Client=192.168.1.100 RangeHeader=bytes=0-1048575 Offset=0
[PROGRESS-DEBUG] TxID=123 Client=192.168.1.100 Offset=0 Written=32768 Cumulative=32768 Total=10485760 Percent=0.3%
[UPDATE-DEBUG] TxID=123 Client=192.168.1.100 Previous=0/10485760 (0.0%) New=32768/10485760 (0.3%) ✅ UPDATED to 0.3%
[PROGRESS-DEBUG] TxID=123 Client=192.168.1.100 Offset=0 Written=65536 Cumulative=65536 Total=10485760 Percent=0.6%
...
```

## What to Look For

### Normal Sequential Behavior

```
[RANGE-DEBUG] ... Offset=0
[PROGRESS-DEBUG] ... Cumulative=100KB
[PROGRESS-DEBUG] ... Cumulative=200KB
[PROGRESS-DEBUG] ... Cumulative=300KB
✅ All increasing, all accepted
```

### Parallel Range Requests (Android Chrome)

```
[RANGE-DEBUG] TxID=123 Offset=0        ← Request 1
[RANGE-DEBUG] TxID=123 Offset=1048576  ← Request 2 (parallel!)
[RANGE-DEBUG] TxID=123 Offset=2097152  ← Request 3 (parallel!)
```

### Progress Going Backwards (The Bug!)

```
[PROGRESS-DEBUG] ... Cumulative=1500KB  ← From Request 2
[UPDATE-DEBUG] ... ✅ UPDATED to 15%
[PROGRESS-DEBUG] ... Cumulative=500KB   ← From Request 1 (lower!)
[UPDATE-DEBUG] ... ⏸️ SKIPPED (bytes not higher: 500KB <= 1500KB)  ← Correctly rejected!
```

But if you see:

```
[UPDATE-DEBUG] ... ✅ UPDATED to 5%  ← After showing 15%!
```

Then the monotonic check is failing!

## Expected Findings

Based on the logs, we should see one of these patterns:

### Pattern A: Backend is Working, Frontend Issue

- Backend logs show monotonically increasing progress
- All updates are ✅ UPDATED
- But UI still shows backwards progress
- **Solution**: Issue is in frontend WebSocket handling or display

### Pattern B: Parallel Requests Causing Issues

- Multiple [RANGE-DEBUG] logs with different offsets at the same time
- Some updates are ⏸️ SKIPPED due to lower bytes
- Progress appears to stall
- **Solution**: Need to handle parallel range requests better

### Pattern C: Race Condition in Transaction Store

- Updates are ✅ ACCEPTED but with decreasing values
- Monotonic check is not working
- **Solution**: Fix mutex/locking in UpdateClientProgress

## Next Steps After Testing

### If Pattern A (Frontend Issue):

1. Add frontend logging to track WebSocket messages
2. Check if messages arrive out of order
3. Verify `highestProgressRef` is working correctly
4. Consider buffering/ordering WebSocket updates

### If Pattern B (Parallel Range Requests):

Two options:

**Option 1**: Track per-connection progress

```go
type Transaction struct {
    ClientConnections map[string]map[string]*ConnectionProgress
}
```

**Option 2**: Track byte ranges

```go
type Transaction struct {
    ClientRanges map[string][]ByteRange
}
```

### If Pattern C (Race Condition):

1. Review mutex locking in `UpdateClientProgress`
2. Add connection ID to progress writer
3. Consider using atomic operations for progress

## Temporary Solution

If the issue is confirmed to be parallel range requests, we can:

1. **Disable parallel downloads** by not supporting range requests:

   - Remove Range header support
   - Force full file downloads
   - Less efficient but guaranteed to work

2. **Track maximum position** instead of cumulative bytes:
   - Report highest byte received from any connection
   - Simpler than tracking all ranges
   - May show incorrect progress if ranges have gaps

## Clean Up

Once debugging is complete, remove or comment out the debug logs:

```bash
# Search for debug logs
grep -r "PROGRESS-DEBUG\|UPDATE-DEBUG\|RANGE-DEBUG" pkg/server/
```

Then remove or change `fmt.Printf` to `// fmt.Printf` for each debug log.

## Questions to Answer

Please provide feedback after testing:

1. **Do you see parallel range requests?**

   - Multiple [RANGE-DEBUG] logs at the same time?
   - Different offset values?

2. **Is the backend rejecting backward updates correctly?**

   - Do you see ⏸️ SKIPPED logs?
   - Or do you see ✅ UPDATED with decreasing values?

3. **What does the UI show vs. what the logs show?**

   - Does UI progress match the [UPDATE-DEBUG] logs?
   - Or is there a discrepancy?

4. **What browser are you using on Android?**
   - Chrome, Firefox, Samsung Internet?
   - Different browsers handle range requests differently

Share the terminal logs and UI behavior, and we can identify the exact root cause!
