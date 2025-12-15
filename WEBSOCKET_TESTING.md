# WebSocket Testing Guide

## Testing the WebSocket Implementation

### 1. Basic Connection Test

1. Start the application with `wails dev`
2. Open browser console (F12)
3. Look for WebSocket connection logs:
   ```
   [useTransactions] Connecting to WebSocket: ws://...
   [useTransactions] WebSocket connected
   [useDevices] Connecting to WebSocket: ws://...
   [useDevices] WebSocket connected
   ```

### 2. Transaction Updates Test

**Test Real-time File Transfer:**

1. Select files from desktop app
2. Use mobile/browser to receive files
3. Verify:
   - Progress bar updates in real-time
   - Percentage only changes on whole numbers (0%, 1%, 2%, etc.)
   - File appears immediately in chat when transfer starts
   - Completion status updates instantly

**Test Text Messages:**

1. Send text from desktop or mobile
2. Verify message appears immediately without delay
3. Check console for "transaction_update" WebSocket messages

### 3. Device Updates Test

1. Open mobile browser and connect to the QR code URL
2. Desktop should show connected device immediately in the right panel
3. Close mobile browser
4. Device should disappear from desktop within 2-3 seconds
5. Console should show "devices_update" messages

### 4. Reconnection Test

**Simulator Network Interruption:**

1. Open Browser DevTools Network tab
2. Set throttling to "Offline"
3. Wait 3 seconds
4. Set throttling back to "Online"
5. Verify WebSocket reconnects automatically
6. Check console for "WebSocket closed, reconnecting in 3s..." message

### 5. Multiple Clients Test

1. Open the mobile URL in multiple browsers/devices
2. All should show in the connected devices list
3. Send files from desktop
4. All clients should see real-time updates
5. Upload from one client
6. Desktop and other clients should see the upload progress

### 6. Percentage Update Optimization Test

**Verify Whole Number Updates:**

1. Open Browser DevTools Console
2. Filter WebSocket messages: `transaction_update`
3. Upload a large file (so transfer takes time)
4. Observe that percentage updates only come at: 0%, 1%, 2%, 3%, etc.
5. Confirm NO updates like 0.5%, 1.2%, etc.

### Expected WebSocket Messages

#### Initial Connection
```json
{
  "type": "transactions_init",
  "data": {
    "transactions": [...]
  }
}
```

```json
{
  "type": "devices_init",
  "data": {
    "clients": [...]
  }
}
```

#### Updates
```json
{
  "type": "transaction_update",
  "data": {
    "id": 1,
    "type": "file",
    "transactionPercent": 45,
    "status": "in_progress",
    ...
  }
}
```

```json
{
  "type": "devices_update",
  "data": {
    "clients": [
      {
        "id": "abc123",
        "platform": "android",
        ...
      }
    ]
  }
}
```

## Common Issues

### WebSocket Not Connecting

**Symptom:** Console shows connection errors

**Debug:**
1. Check if server is running
2. Verify WebSocket endpoint: `ws://localhost:PORT/api/ws`
3. Check browser console for CORS errors
4. Ensure firewall allows WebSocket connections

### Percentage Updates Not Working

**Symptom:** No progress shown during transfer

**Debug:**
1. Check backend logs for transaction updates
2. Verify WebSocket hub is initialized
3. Check frontend is receiving "transaction_update" messages
4. Verify transaction ID exists in state

### Devices Not Updating

**Symptom:** Connected devices not showing

**Debug:**
1. Check if client sends X-Client-ID header
2. Verify devices_update messages in console
3. Check backend ClientStore is tracking clients
4. Verify client lastSeen timestamp is recent

## Performance Monitoring

### Browser DevTools

1. **Network Tab:**
   - WS connection should show as "101 Switching Protocols"
   - Messages should be minimal (only on changes)
   
2. **Console:**
   - Should not spam with messages
   - Only updates when data actually changes

3. **Memory:**
   - WebSocket connections should not leak
   - Reconnection should clean up old connections

### Backend Logs

Look for:
```
[WebSocket] New connection added. Total connections: X
[WebSocket] Client connected from IP
[Upload] Created transaction ID=X for file: filename
```

## Success Criteria

✅ Transactions appear instantly  
✅ Progress updates show only whole number changes  
✅ Devices list updates immediately on connect/disconnect  
✅ WebSocket reconnects automatically after network issues  
✅ No polling-related HTTP requests in Network tab  
✅ Smooth, real-time user experience  
