# ClipNest Debug Guide

## Error: "Error in offscreen document"

This error typically occurs due to one of these issues:

### 1. **Offscreen Document Creation Failure**
**Symptoms**: Extension fails to start, no clipboard monitoring
**Check**: 
- Go to `chrome://extensions/`
- Click "Errors" button next to ClipNest
- Look for offscreen creation errors

**Common Causes**:
- Missing `offscreen` permission (now fixed)
- Chrome version too old (need Chrome 109+)
- Extension reload needed

### 2. **Clipboard API Access Issues**
**Symptoms**: "Clipboard API not available" errors
**Check**:
- Browser console for detailed error messages
- HTTPS requirement (clipboard API needs secure context)

### 3. **Message Passing Errors**
**Symptoms**: Communication failures between scripts
**Check**: Background script console for message errors

## Debugging Steps

### Step 1: Check Extension Loading
```
1. Go to chrome://extensions/
2. Remove the extension
3. Re-add using "Load unpacked"
4. Check for any immediate errors
```

### Step 2: Check Console Logs
```
1. Right-click extension icon → "Inspect views: background page"
2. Look for these messages:
   ✓ "ClipNest background script initialized"
   ✓ "Offscreen document created successfully"
   ✓ "Clipboard monitoring started"
   
   ❌ Any error messages
```

### Step 3: Test Basic Functionality
```
1. Copy any text (Ctrl+C)
2. Check background console for:
   ✓ "Clipboard content changed, new length: X"
   ✓ "Successfully sent clipboard change to background"
   ✓ "Saved clipboard item: Text ..."
```

### Step 4: Manual Debugging
If errors persist, try this JavaScript in the background console:

```javascript
// Test offscreen document creation manually
chrome.offscreen.createDocument({
  url: chrome.runtime.getURL('offscreen.html'),
  reasons: ['CLIPBOARD'],
  justification: 'Debug test'
}).then(() => {
  console.log('Manual offscreen creation successful');
}).catch(error => {
  console.error('Manual offscreen creation failed:', error);
});
```

## Quick Fixes

### Fix 1: Force Extension Restart
1. Go to `chrome://extensions/`
2. Toggle the extension off and on
3. Check console logs again

### Fix 2: Check Chrome Version
- Offscreen API requires Chrome 109+
- Update Chrome if needed

### Fix 3: Clear Extension Data
```javascript
// Run in background console to clear data
chrome.storage.local.clear();
```

### Fix 4: Use Debug Version
1. Replace `content.js` reference in manifest with `content_new.js`
2. Reload extension
3. Check for more detailed error messages

## Common Error Messages and Solutions

| Error Message | Solution |
|---------------|----------|
| "Clipboard API not available" | Check HTTPS, update Chrome |
| "Failed to create offscreen document" | Check permissions, restart extension |
| "Context invalidated" | Extension was reloaded, restart it |
| "Could not establish connection" | Background script crashed, check console |

## If All Else Fails

1. **Check Extension Manifest**: Ensure all permissions are correct
2. **Try Incognito Mode**: Rule out other extensions interfering
3. **Test on Different Sites**: Some sites block clipboard access
4. **Browser Restart**: Sometimes Chrome needs a restart

The enhanced error logging should now show exactly where the failure occurs!
