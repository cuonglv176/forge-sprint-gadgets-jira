# CHANGELOG

## [2.1.0] - 2026-02-05

### 🎉 Major Release - SRS v2.1 Compliance

### ✨ Added

#### Backend (src/resolvers/index.js)
- **Baseline Tracking System**
  - `getSprintBaseline()` function
  - `saveSprintBaseline()` function
  - Auto-create baseline on first load
  - Store in Forge Storage: `baseline-{sprintId}`

- **Enhanced Scope Detection**
  - ADDED: Tasks not in baseline
  - REMOVED: Tasks in baseline but not current
  - PRIORITY: Changed priority from baseline

- **Reset Baseline**
  - New `resetBaseline` resolver

#### Frontend (BurndownGadget.js)
- **Scope Visualization**
  - Orange stacked bars for added scope
  - Red negative bars for removed scope
  - `stackOffset="sign"` for negative rendering

- **Enhanced Metrics Panel**
  - Original Estimate
  - Scope Changes summary
  - Task counts

- **Scope Change Alert**
  - Visual warning box
  - Added/removed details

### 🔧 Changed

#### Backend
- **Ideal Line Calculation** ⚠️ BREAKING
  - OLD: Based on max capacity
  - NEW: Based on original estimate from baseline

- **Filtering**
  - Baseline also filtered by assignee

#### Frontend
- Chart height: 300px → 350px
- Better color contrast
- Responsive grid layout

### 🐛 Fixed
- Scope detection now uses baseline
- Ideal line reflects actual work
- Filtering applies to baseline

### ⚠️ Breaking Changes
1. Ideal line calculation changed
2. Baseline required for scope tracking

---

## [1.0.0] - 2024

### Initial Release
- Basic Burndown Chart
- Sprint Health
- At Risk Items
- Scope Changes (basic)
- High Priority Items
