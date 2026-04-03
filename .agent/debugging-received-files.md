# 🔍 Debugging Received Files Issue

## Check These Steps:

### 1. **Open Browser Console** (Desktop)

Press F12 and check the Console tab. You should see:

```
Polling uploads: []
Polling uploads: []
Polling uploads: []
```

Every 2 seconds, it should log the current uploads.

### 2. **Upload a File from Mobile**

1. On mobile, click "Send Files"
2. Select a file
3. Click "Send" to upload

### 3. **Check Desktop Console Again**

After upload, you should see:

```
Polling uploads: ["filename.jpg"]
New files detected: ["filename.jpg"]
```

Then a received message should appear in the chat!

### 4. **Test the API Endpoint Directly**

Open this URL in your browser:

```
http://localhost:34115/api/uploads
```

You should see:

```json
{
  "files": []
}
```

Or if files were uploaded:

```json
{
  "files": ["file1.pdf", "file2.jpg"]
}
```

## Common Issues:

### Issue 1: Console shows "Error checking uploads"

**Problem**: API endpoint not accessible
**Fix**: Make sure the Go server is running

### Issue 2: Polling shows empty array even after upload

**Problem**: Upload handler not adding files to the list
**Fix**: Check if upload was successful (check mobile for success message)

### Issue 3: New files detected but no message appears

**Problem**: Message state not updating
**Fix**: Check browser console for React errors

### Issue 4: CORS error

**Problem**: Desktop trying to access wrong URL
**Fix**: Should use relative URL `/api/uploads`, not full URL

## Quick Test:

1. **Desktop**: Open browser console (F12)
2. **Mobile**: Upload a file
3. **Desktop Console**: Should show "New files detected: [...]"
4. **Desktop UI**: Should show received message within 2 seconds

## Manual Test of Upload:

You can test the upload endpoint directly:

1. Open desktop app
2. Open browser to http://localhost:34115
3. Open DevTools Console
4. Run this:

```javascript
// Test upload
const formData = new FormData();
const blob = new Blob(["test content"], { type: "text/plain" });
formData.append("file", blob, "test.txt");

fetch("/api/upload", {
  method: "POST",
  body: formData,
})
  .then((r) => r.json())
  .then(console.log);
```

5. Then check `/api/uploads`:

```javascript
fetch("/api/uploads")
  .then((r) => r.json())
  .then(console.log);
```

Should show: `{files: ["test.txt"]}`

## If Still Not Working:

1. **Check Go server logs** - Look for "Received file: ..." message
2. **Verify file was saved** - Check current directory for uploaded files
3. **Test API manually** - Use the JavaScript snippets above
4. **Check network tab** - See if `/api/uploads` requests are happening
5. **Clear localStorage** - `localStorage.clear()` in console

## Expected Behavior:

✅ Console logs "Polling uploads" every 2 seconds
✅ After mobile upload, logs "New files detected"
✅ Received message appears in chat (left side, white bubble)
✅ Message persists after page reload
