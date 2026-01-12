# 🧪 Testing Guide - Android Download Progress Fix

## ✅ Server Status

The dev server is running with the new range-based progress tracking!

## 📱 How to Test

### Step 1: Connect Android Device

1. Open Chrome browser on your Android phone
2. Scan the QR code from the desktop app OR enter the URL manually
3. Make sure you're connected (you should see your device in the desktop app)

### Step 2: Prepare for Download

1. **On Desktop**: Share a file (preferably 10MB+ to see the effect clearly)
   - Larger files (50MB+) will show parallel requests more clearly
   - Video files (MP4) or archives (ZIP) work well

### Step 3: Start Download and Monitor Logs

**On your computer**, watch the terminal running `npm run dev`. You should see:

#### ✅ **What You Should See (Success)**

```
[RANGE-DEBUG] TxID=1 Client=10.30.170.241 RangeHeader=bytes=0-1048575 Offset=0
[PROGRESS-DEBUG] TxID=1 Client=10.30.170.241 Offset=0 Written=32768...
[RANGE-UPDATE] TxID=1 Client=10.30.170.241 Range=[0-32767] TotalRanges=1 TotalBytes=32768/10680160 Progress=0.3%

[RANGE-DEBUG] TxID=1 Client=10.30.170.241 RangeHeader=bytes=1048576-2097151 Offset=1048576
[PROGRESS-DEBUG] TxID=1 Client=10.30.170.241 Offset=1048576 Written=32768...
[RANGE-UPDATE] TxID=1 Client=10.30.170.241 Range=[1048576-1081343] TotalRanges=2 TotalBytes=65536/10680160 Progress=0.6%

[RANGE-UPDATE] ... TotalRanges=3 TotalBytes=1000000/10680160 Progress=9.4%
[RANGE-UPDATE] ... TotalRanges=2 TotalBytes=3000000/10680160 Progress=28.1%  ← Ranges merging!
[RANGE-UPDATE] ... TotalRanges=1 TotalBytes=5000000/10680160 Progress=46.8%  ← All merged!
[RANGE-UPDATE] ... TotalRanges=1 TotalBytes=10680160/10680160 Progress=100.0% ✅
```

**Key Indicators of Success:**

- ✅ Multiple `[RANGE-DEBUG]` entries with DIFFERENT offsets (parallel requests!)
- ✅ `TotalRanges` count may go up then down (as ranges merge)
- ✅ `TotalBytes` ALWAYS increases (never decreases!)
- ✅ `Progress` smoothly goes from 0% → 100%
- ✅ No `⏸️ SKIPPED` messages (old bug is fixed!)

#### ❌ **What You Should NOT See (Old Bug)**

```
[UPDATE-DEBUG] ... ⏸️ SKIPPED (bytes not higher: 500KB <= 2MB)
[UPDATE-DEBUG] ... ⏸️ SKIPPED (bytes not higher: 1.5MB <= 2MB)
```

These indicate the old monotonic check rejecting valid updates.

### Step 4: Check UI Progress

**On your Android phone**, the download progress should:

- ✅ Start at 0%
- ✅ Smoothly increase without going backwards
- ✅ Show accurate download speed (not 0.0 MB/s)
- ✅ Show accurate bytes downloaded
- ✅ Reach 100% when complete
- ✅ File appears in your Downloads folder

## 🔍 Detailed Monitoring

### Terminal Output Analysis

**Look for these patterns:**

1. **Parallel Connections** (Android Chrome):

   ```
   [RANGE-DEBUG] Offset=0
   [RANGE-DEBUG] Offset=1048576   ← 1MB offset (Connection 2)
   [RANGE-DEBUG] Offset=2097152   ← 2MB offset (Connection 3)
   ```

   This means Chrome is downloading in parallel! ✅

2. **Range Merging**:

   ```
   TotalRanges=3  ← Three parallel connections
   TotalRanges=2  ← Two ranges merged
   TotalRanges=1  ← All ranges merged (file complete!)
   ```

3. **Monotonic Progress**:
   ```
   Progress=0.3%
   Progress=0.6%   ← Always increasing!
   Progress=28.1%  ← Big jump (range merged)
   Progress=100.0% ← Complete!
   ```

## 📊 Test Scenarios

### Test 1: Small File (1-5MB)

**Expected**: May use sequential download (single range)

- Should still work perfectly
- Progress: 0% → 100% smoothly

### Test 2: Medium File (10-50MB)

**Expected**: Likely uses 2-3 parallel connections

- Multiple `[RANGE-DEBUG]` entries
- `TotalRanges` will vary (2-3)
- Progress should be accurate

### Test 3: Large File (100MB+)

**Expected**: Definitely uses parallel connections (3-6)

- Many `[RANGE-DEBUG]` entries
- `TotalRanges` up to 6
- Excellent stress test for range merging logic

## 🐛 Troubleshooting

### Issue: Still seeing backwards progress

**Check:**

1. Did the server restart with new code? Look for compilation messages
2. Are you seeing `[RANGE-UPDATE]` logs? (New code)
3. Or still seeing `[UPDATE-DEBUG]` logs? (Old code - needs restart)

**Fix**:

```bash
# Stop the server (Ctrl+C)
# Restart:
npm run dev
```

### Issue: No `[RANGE-DEBUG]` logs

**Possible Causes:**

1. **Browser not using range requests**: Try a larger file
2. **Using Firefox instead of Chrome**: Firefox may behave differently
3. **Network issue**: Try downloading again

### Issue: File not downloading

**Check:**

1. Security token is valid (in URL)
2. File is still available (desktop didn't close)
3. No errors in terminal

## 📈 Success Metrics

After testing, you should confirm:

- [ ] **No backward progress** (never goes 65% → 58%)
- [ ] **Accurate speed display** (shows MB/s, not 0.0)
- [ ] **Correct byte count** (matches file size)
- [ ] **Smooth UI updates** (no freezing or jumping)
- [ ] **Complete downloads** (file fully downloaded)
- [ ] **Range tracking works** (terminal shows `[RANGE-UPDATE]` logs)

## 💡 Understanding the Logs

### Log Format

```
[RANGE-UPDATE] TxID=1 Client=10.30.170.241 Range=[START-END] TotalRanges=N TotalBytes=X/Y Progress=Z%
```

- **Range=[START-END]**: The byte range just updated
- **TotalRanges=N**: How many separate ranges are currently tracked
- **TotalBytes=X/Y**: Total downloaded / Total file size
- **Progress=Z%**: Current download percentage

### Example Download Flow

```
[RANGE-UPDATE] Range=[0-999999] TotalRanges=1 TotalBytes=1000000/10000000 Progress=10%
[RANGE-UPDATE] Range=[1000000-1999999] TotalRanges=2 TotalBytes=2000000/10000000 Progress=20%
[RANGE-UPDATE] Range=[999999-1500000] TotalRanges=1 TotalBytes=2000000/10000000 Progress=20%
                                         ↑ Merged! (overlapping ranges combined)
```

## 🎉 When Everything Works

You should experience:

1. **Fast downloads** - Android Chrome can use all its connections
2. **Accurate progress** - Real-time updates that make sense
3. **No confusion** - Progress matches browser's download manager
4. **Reliable completion** - Downloads always finish at 100%

## 📝 Report Results

After testing, please share:

1. **File size tested**: e.g., "Tested with 50MB video file"
2. **Parallel connections observed**: e.g., "Saw 3-4 parallel Range requests"
3. **Progress behavior**: e.g., "Smooth 0% → 100%, no backwards movement"
4. **Any issues**: If something didn't work as expected

**Copy relevant terminal logs** showing the `[RANGE-UPDATE]` messages - this confirms the fix is working!

---

Ready to test! 📱✨
