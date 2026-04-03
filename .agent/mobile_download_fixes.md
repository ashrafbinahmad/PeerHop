# Mobile Browser Download Progress Fixes

## Issues Fixed

### 1. **Download Speed Jumping/Disappearing**

**Problem:** Download speeds were showing 0.0 MB/s or disappearing intermittently on mobile browsers.

**Root Cause:**

- The `useTransferSpeed` hook only calculated speed when `timeDiff >= 0.5` seconds
- When time difference was less than 0.5s, the hook didn't set any new speed value
- This caused the speed to disappear or show as "0.0 MB/s" between updates

**Fix:**

- Added state preservation: when time difference is less than threshold, keep the previous speed from state
- Added validation to prevent negative or invalid speed values (clamped to 0-10000 MB/s)
- Skip speed calculations for transactions that are not "in_progress"
- Handle the case when bytes don't change (show 0.0 MB/s instead of nothing)

**Changes in:** `ui/frontend/src/hooks/useTransferSpeed.ts`

### 2. **Progress Going Back and Forth**

**Problem:** Progress percentage would jump backwards and forwards, especially noticeable on Android browsers.

**Root Cause:**

- WebSocket updates can arrive out of order on mobile browsers
- Multiple progress sources (globalProgress, clientProgress, uploadProgress) competing
- No mechanism to prevent progress from decreasing

**Fix:**

- Added `highestProgressRef` to track the maximum progress seen for each transaction
- Progress can only increase or stay the same, never decrease (for in-progress downloads)
- Completed transactions are always clamped to 100%
- Progress values are validated and clamped to 0-100 range
- Cleanup tracking when transaction is cancelled

**Changes in:** `ui/frontend/src/views/MobileUnified.tsx`

### 3. **Downloaded Bytes Varying Wildly**

**Problem:** The "downloaded" amount shown (e.g., "5.2 MB / 10 MB") would jump around.

**Root Cause:**

- Downloaded bytes were calculated from percentage: `fileSize * (percent / 100)`
- Since percentage was jumping, the calculated bytes were also jumping
- Actual byte counts from WebSocket were available but not being used

**Fix:**

- Prioritize actual `clientBytes` from WebSocket updates when available
- Fall back to `bytesTransferred` for global tracking
- Only calculate from percentage as a last resort
- This gives more accurate and stable byte counts

**Changes in:** `ui/frontend/src/views/MobileUnified.tsx`

## Technical Details

### Speed Calculation Algorithm

```typescript
// Before: Speed disappeared when timeDiff < 0.5s
if (timeDiff >= 0.5) {
  calculate speed
  update refs
} else {
  // Keep existing speed - BUT DIDN'T ACTUALLY KEEP IT!
}

// After: Speed is preserved properly
if (timeDiff >= 0.5) {
  calculate and clamp speed
  update refs
} else {
  // Actually preserve the previous speed from state
  if (speeds[txn.id]) {
    newSpeeds[txn.id] = speeds[txn.id];
  }
}
```

### Progress Monotonicity

```typescript
// Track highest progress seen
const previousHighest = highestProgressRef.current[transaction.id] || 0;

if (currentProgress < previousHighest && currentProgress > 0) {
  // Don't allow backwards progress
  currentProgress = previousHighest;
} else if (currentProgress > previousHighest) {
  // Update the highest we've seen
  highestProgressRef.current[transaction.id] = currentProgress;
}
```

### Byte Count Priority

```typescript
// Priority order for downloaded bytes:
1. transaction.clientBytes[myIp]     // Most accurate, client-specific
2. transaction.bytesTransferred      // Global tracking
3. fileSize * (percent / 100)        // Calculated fallback
```

## Testing Recommendations

1. Test on Android Chrome with:
   - Large file downloads (100MB+)
   - Varying network speeds
   - Multiple simultaneous downloads

2. Test on iOS Safari with:
   - Background tab switching
   - Screen lock/unlock during download
   - Low power mode

3. Verify that:
   - Speed stays visible throughout download
   - Progress only increases, never decreases
   - Downloaded bytes match actual download progress
   - Completion reaches 100% reliably

## Performance Impact

- **Minimal:** Added one ref for progress tracking and improved conditional logic
- **Benefits:** Reduced UI jank and improved user experience on mobile browsers
- **Side effects:** None expected - changes are defensive and backwards compatible
