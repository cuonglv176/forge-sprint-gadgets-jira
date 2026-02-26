# 🔄 WHAT CHANGED - v2.1.0

## 📝 Summary

Cập nhật 2 files chính để tuân thủ 100% SRS v2.1:
1. Backend: `src/resolvers/index.js`
2. Frontend: `static/gadget/src/components/BurndownGadget.js`

---

## ✨ FILES UPDATED

### 1. `src/resolvers/index.js` ⭐⭐⭐
**Size:** 32KB → ~700 lines  
**Status:** ✅ UPDATED

#### What Changed:

**A. New Functions Added:**
```javascript
// Baseline Management
const getSprintBaseline = async (sprintId) => { ... }
const saveSprintBaseline = async (sprintId, issues) => { ... }

// New Resolver
resolver.define('resetBaseline', async ({ payload }) => { ... })
```

**B. Updated Functions:**
```javascript
// getBurndownData - Now uses baseline
- OLD: const maxCapacity = workingDays * 8 * teamSize;
+ NEW: const totalOriginalEstimate = baseline.issues.reduce(...);

// getScopeChanges - Full baseline comparison
- OLD: if (created > sprintStart) { added.push(...) }
+ NEW: Baseline comparison for ADDED/REMOVED/PRIORITY
```

**C. Enhanced Logic:**
- Baseline tracking system
- Scope change detection với baseline
- Ideal line từ original estimate
- Filtering cũng apply cho baseline

---

### 2. `static/gadget/src/components/BurndownGadget.js` ⭐⭐⭐
**Size:** 15KB → ~400 lines  
**Status:** ✅ UPDATED

#### What Changed:

**A. New Visual Elements:**
```jsx
// Scope Removed (Negative Bar)
<Bar dataKey="removed" fill="#DE350B" stackId="scope" />

// Scope Added (Stacked Bar)
<Bar dataKey="added" fill="#FF991F" stackId="main" />

// Critical: Enable negative bars
<ComposedChart stackOffset="sign">
```

**B. New Components:**
```jsx
// Metrics Panel
<div className="metrics-panel">
  <MetricCard label="Original Estimate" ... />
  <MetricCard label="Scope Changes" ... />
</div>

// Scope Alert
{(addedIssuesCount > 0) && (
  <div className="scope-alert">...</div>
)}
```

**C. Enhanced Features:**
- Custom legend với 5 elements
- Better tooltip
- Responsive layout
- Scope change summary

---

### 3. `manifest.yml` ⭐
**Updated:** Description to v2.1

```yaml
- title: Sprint Burndown Chart
+ title: Sprint Burndown Chart v2.1
- description: Burndown chart with Ideal line based on Max Capacity
+ description: Advanced burndown with scope tracking - Shows Added/Removed tasks
```

---

### 4. `package.json` (x2) ⭐
**Updated:** Version to 2.1.0

```json
- "version": "1.0.0",
+ "version": "2.1.0",
```

---

## ✅ BACKUP FILES CREATED

```
src/resolvers/index.js.backup
static/gadget/src/components/BurndownGadget.js.backup
```

Nếu có vấn đề, restore:
```bash
cp src/resolvers/index.js.backup src/resolvers/index.js
cp static/gadget/src/components/BurndownGadget.js.backup static/gadget/src/components/BurndownGadget.js
```

---

## 🔍 HOW TO VERIFY

### Check Backend Changes:
```bash
# Should show ~700 lines
wc -l src/resolvers/index.js

# Should have baseline references
grep -c "baseline" src/resolvers/index.js
# Expected: 30+ matches
```

### Check Frontend Changes:
```bash
# Should show ~400 lines
wc -l static/gadget/src/components/BurndownGadget.js

# Should have stackOffset
grep "stackOffset" static/gadget/src/components/BurndownGadget.js
# Expected: stackOffset="sign"

# Should have scope references
grep -c "scope" static/gadget/src/components/BurndownGadget.js
# Expected: 10+ matches
```

---

## 📊 COMPARISON

| Aspect | v1.0 (OLD) | v2.1 (NEW) |
|--------|-----------|-----------|
| **Ideal Line** | Max Capacity | Original Estimate |
| **Scope Detection** | Creation date only | Baseline comparison |
| **Visualization** | 3 elements | 5 elements |
| **Negative Bars** | ❌ No | ✅ Yes |
| **Stacked Bars** | ❌ No | ✅ Yes |
| **Metrics Panel** | Basic | Enhanced |
| **Scope Alert** | ❌ No | ✅ Yes |
| **Baseline** | ❌ No | ✅ Yes |

---

## 🚀 DEPLOY NOW

```bash
# Option 1: Quick script
./quick-deploy.sh

# Option 2: Manual
npm install
cd static/gadget && npm install && npm run build && cd ../..
forge deploy
forge install
```

---

## 🎯 KEY IMPROVEMENTS

1. **Baseline System** ⭐⭐⭐
   - Captures sprint start state
   - Accurate scope detection
   - Stored in Forge Storage

2. **Visual Enhancements** ⭐⭐⭐
   - Orange bars = Added tasks
   - Red bars = Removed tasks
   - 5 chart elements total

3. **Corrected Logic** ⭐⭐⭐
   - Ideal line realistic
   - Scope changes accurate
   - Better filtering

4. **User Experience** ⭐⭐
   - Clear metrics
   - Visual alerts
   - Professional design

---

**✅ Ready to Deploy!**

See `README.md` for detailed instructions.
