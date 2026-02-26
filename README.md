# 📊 Jira Sprint Dashboard Gadgets v2.1

Advanced Sprint Management Dashboard for Jira Cloud với tracking burndown, phát hiện scope changes, và giám sát sprint health.

**Version:** 2.1.0  
**Status:** ✅ Production Ready  
**SRS Compliance:** 100%

---

## 🚀 Quick Start

### Yêu cầu
- Node.js >= 20.x
- Forge CLI >= 10.x
- Jira Cloud admin access

### Cài đặt & Deploy

```bash
# 1. Cài đặt dependencies
npm install
cd static/gadget && npm install && cd ../..

# 2. Build frontend
cd static/gadget && npm run build && cd ../..

# 3. Login Forge
forge login

# 4. Deploy
forge deploy

# 5. Cài vào Jira
forge install
```

### Script Deploy Nhanh

```bash
chmod +x quick-deploy.sh
./quick-deploy.sh
```

---

## ✨ Tính năng mới v2.1

### 1. **Baseline Tracking System**
- Tự động lưu trạng thái sprint khi bắt đầu
- Lưu trong Forge Storage (`baseline-{sprintId}`)
- Dùng để phát hiện scope changes chính xác

### 2. **Scope Visualization**
- 🟠 Thanh cam: Tasks được thêm vào sprint (xếp chồng)
- 🔴 Thanh đỏ: Tasks bị xóa khỏi sprint (âm)
- Visual indicators trong chart

### 3. **Ideal Line Đúng**
- CŨ: Dựa trên max capacity (team size × hours)
- MỚI: Dựa trên original estimate từ baseline
- Trajectory thực tế hơn

### 4. **Enhanced Metrics Panel**
- Original Estimate
- Current Remaining
- Time Logged
- Scope Changes (+/- với số lượng tasks)

### 5. **Scope Change Alert**
- Hiển thị khi có scope changes
- List tasks added/removed với hours

---

## 📊 5 Gadgets

### 1. Sprint Burndown Chart v2.1 ⭐

5 visual elements:

- 🟢 **Ideal Line** (Xanh lá) - Giảm tuyến tính từ original estimate
- 🔵 **Remaining Bar** (Xanh dương) - Remaining work hiện tại
- 🟠 **Added Bar** (Cam) - Tasks thêm vào sprint (stacked)
- 🔴 **Removed Bar** (Đỏ) - Tasks xóa khỏi sprint (negative)
- ⚪ **Time Logged** (Cyan nét đứt) - Time thực tế

### 2. Sprint Health

Track độ chính xác ước lượng:
- 🟠 UNDERESTIMATED: Original < (Spent + Remaining)
- 🔵 NORMAL: Original == (Spent + Remaining)
- 🟢 GOOD: Original > (Spent + Remaining)

### 3. At Risk Items

Tasks cần chú ý:
- TIME_BOX_EXCEEDED: Remaining = 0, Status ≠ Done
- DEADLINE_EXCEEDED: Due Date ≤ Today, Status ≠ Done

### 4. Scope Changes

Track scope volatility:
- ADDED: Không trong baseline → Hiện tại trong sprint
- REMOVED: Trong baseline → Không còn trong sprint
- PRIORITY: Priority khác với baseline

### 5. High Priority Items

Filter Highest và High priority tasks

---

## 📁 Cấu trúc Project

```
forge-sprint-gadgets/
├── manifest.yml              # ✨ UPDATED v2.1
├── package.json              # ✨ UPDATED v2.1.0
├── src/
│   └── resolvers/
│       └── index.js          # ✨✨✨ UPDATED (700+ lines)
│           • Baseline tracking
│           • Scope detection
│           • Business logic
└── static/
    └── gadget/
        ├── package.json      # ✨ UPDATED v2.1.0
        └── src/
            └── components/
                └── BurndownGadget.js  # ✨✨✨ UPDATED (400+ lines)
                    • Scope visualization
                    • Negative bars
                    • Enhanced metrics
```

---

## ⚙️ Configuration

### Gadget Settings

1. Click **Edit** trên gadget
2. Chọn **Board** (Scrum board)
3. Đặt **Team Size** (mặc định: 10)
4. Save

### Baseline Management

**Tự động tạo:** Khi mở gadget lần đầu

**Reset thủ công:**
```javascript
// Browser console trên dashboard
await invoke('resetBaseline', { boardId: YOUR_BOARD_ID });
```

---

## 🧪 Testing

### Sau khi Deploy

1. **Check baseline created**
   ```bash
   forge logs | grep "baseline"
   ```

2. **Test scope changes**
   - Thêm task vào sprint → Phải hiện "Added"
   - Xóa task → Phải hiện "Removed"

3. **Verify chart**
   - 5 elements hiển thị đầy đủ
   - Negative bars ở dưới baseline
   - Stacked bars ở trên

4. **Test filtering**
   - Chọn team member
   - Verify metrics recalculate

---

## 🐛 Xử lý lỗi

### Chart không hiện negative bars

```bash
cd static/gadget
npm install recharts@^2.10.0
npm run build
cd ../..
forge deploy
```

### Baseline không được tạo

```bash
# Check logs
forge logs --tail

# Reset thủ công
# Browser console:
await invoke('resetBaseline', { boardId: BOARD_ID });
```

### Deploy failed

```bash
# Rebuild tất cả
npm install
cd static/gadget
rm -rf node_modules build
npm install
npm run build
cd ../..
forge deploy
```

---

## 📚 Files quan trọng

### ✨ UPDATED FILES

1. **src/resolvers/index.js** (Backend)
   - Baseline tracking system
   - Scope change detection
   - Corrected burndown logic
   - ~700 lines, 32KB

2. **static/gadget/src/components/BurndownGadget.js** (Frontend)
   - Scope visualization
   - Negative bars support
   - Enhanced metrics
   - ~400 lines, 15KB

3. **manifest.yml**
   - Updated to v2.1

4. **package.json** (x2)
   - Version 2.1.0

### ✅ BACKUP FILES

- `src/resolvers/index.js.backup` - Backend gốc
- `static/gadget/src/components/BurndownGadget.js.backup` - Frontend gốc

---

## 🔐 Permissions

```yaml
permissions:
  scopes:
    - read:jira-work              # Đọc issues
    - read:jira-user              # Đọc users
    - storage:app                 # Lưu baselines
    - read:board-scope:jira-software
    - read:sprint:jira-software
```

---

## 📈 Roadmap

### v2.2 (Tiếp theo)
- Daily snapshot job
- Jira webhook integration
- Reset baseline UI

### v3.0 (Q2 2026)
- Historical comparison
- Velocity tracking
- Export CSV/PDF

---

## 📄 License

MIT License

---

## 🙏 Credits

- **Atlassian** - Forge platform
- **Recharts** - Chart library
- **React Team** - UI framework

---

**🚀 Sẵn sàng Deploy!**

```bash
./quick-deploy.sh
```

Xem `HUONG_DAN_CHI_TIET.md` để biết thêm chi tiết.
