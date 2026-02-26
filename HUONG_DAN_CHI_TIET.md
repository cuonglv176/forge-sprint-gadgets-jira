# 🚀 Hướng dẫn Chi tiết: Deploy Jira Dashboard Gadgets với Atlassian Forge

## 📋 Tổng quan

Hướng dẫn này sẽ giúp bạn tạo và deploy 5 Dashboard Gadgets cho Jira Cloud:

1. **Sprint Burndown Chart** - Biểu đồ burndown với Ideal line = Max Capacity
2. **Sprint Health** - Underestimated / Normal / Good
3. **At Risk Items** - Time Box & Deadline exceeded
4. **Scope Changes** - Added / Removed / Priority Changed
5. **High Priority Items** - Highest & High priority tasks

---

## 📦 Yêu cầu

- **Node.js 18+** - [Download](https://nodejs.org/)
- **npm** (đi kèm Node.js)
- **Atlassian Account** - Tài khoản có quyền admin trên Jira site
- **Docker** (optional) - Để chạy local

### Kiểm tra Node.js
```bash
node --version   # Phải >= 18.0.0
npm --version    # Phải >= 8.0.0
```

---

## 🔧 Bước 1: Cài đặt Forge CLI

```bash
# Cài đặt Forge CLI globally
npm install -g @forge/cli

# Kiểm tra cài đặt
forge --version
```

---

## 🔐 Bước 2: Đăng nhập Atlassian

```bash
forge login
```

Lệnh này sẽ:
1. Mở browser tự động
2. Yêu cầu đăng nhập Atlassian account
3. Cấp quyền cho Forge CLI

**Lưu ý**: Sử dụng tài khoản có quyền **admin** trên Jira site.

---

## 📁 Bước 3: Setup Project

### 3.1 Giải nén package

```bash
# Giải nén file đã download
unzip forge-sprint-gadgets.zip
cd forge-sprint-gadgets
```

### 3.2 Cài đặt dependencies

```bash
# Cài dependencies cho backend (resolvers)
npm install

# Cài dependencies cho frontend (React UI)
cd static/gadget
npm install
cd ../..
```

---

## 📝 Bước 4: Đăng ký App

```bash
forge register
```

Lệnh này sẽ:
1. Tạo App ID mới trên Atlassian Developer Console
2. Tự động cập nhật `app.id` trong `manifest.yml`

**Output mẫu:**
```
✔ App registered: ari:cloud:ecosystem::app/abc123-def456-...
Updated manifest.yml with app ID
```

---

## 🏗️ Bước 5: Build Frontend

```bash
# Build React app
cd static/gadget
npm run build
cd ../..
```

Sau khi build, thư mục `static/gadget/build` sẽ được tạo.

---

## 🚀 Bước 6: Deploy App

```bash
forge deploy
```

**Output mẫu:**
```
ℹ Uploading app
ℹ Validating manifest
ℹ Snapshotting functions
ℹ Deploying to environment: development

✔ Deployed to development
```

---

## 📲 Bước 7: Cài đặt lên Jira Site

```bash
forge install --site jeisysvn.atlassian.net
```

Thay `jeisysvn.atlassian.net` bằng URL Jira site của bạn.

**Chọn product:**
```
? Select a product: Jira
```

**Output mẫu:**
```
✔ Installed to jeisysvn.atlassian.net
```

---

## ⚙️ Bước 8: Sử dụng Gadgets

### 8.1 Mở Jira Dashboard

1. Đăng nhập Jira Cloud
2. Click **Dashboards** trong menu
3. Chọn hoặc tạo Dashboard mới

### 8.2 Thêm Gadget

1. Click **"Add gadget"** (góc phải dashboard)
2. Tìm kiếm: "Sprint Burndown", "Sprint Health", "At Risk", v.v.
3. Click **"Add"** để thêm gadget

### 8.3 Cấu hình Gadget

1. Click **⚙️ (icon bánh răng)** trên gadget
2. Chọn **Scrum Board** từ dropdown
3. Điều chỉnh **Team Size** và **Working Days** nếu cần
4. Click **Save**

---

## 🔄 Cập nhật App

Khi cần update code:

```bash
# Build lại frontend
cd static/gadget && npm run build && cd ../..

# Deploy version mới
forge deploy

# Nếu thay đổi permissions, cần upgrade
forge install --upgrade
```

---

## 🐛 Debug và Logs

### Xem logs realtime:
```bash
forge logs --tail
```

### Xem logs gần đây:
```bash
forge logs
```

### Development mode với tunnel:
```bash
forge tunnel
```
Cho phép test local changes mà không cần deploy.

---

## 🗑️ Gỡ cài đặt

```bash
# Gỡ khỏi Jira site
forge uninstall --site jeisysvn.atlassian.net

# Xóa app hoàn toàn (cẩn thận!)
# Vào Atlassian Developer Console để xóa
```

---

## ❓ Troubleshooting

### "No active sprint found"
- Kiểm tra board có sprint đang active không
- Board phải là **Scrum board** (không phải Kanban)

### "Permission denied"
- Kiểm tra đã login đúng account: `forge whoami`
- Tài khoản cần quyền admin trên Jira site

### "Build failed"
```bash
# Xóa node_modules và cài lại
rm -rf node_modules static/gadget/node_modules
npm install
cd static/gadget && npm install && cd ../..
```

### Gadget không hiển thị data
1. Click edit gadget → kiểm tra đã chọn Board chưa
2. Kiểm tra board có sprint active
3. Xem logs: `forge logs --tail`

---

## 📊 Cấu trúc Project

```
forge-sprint-gadgets/
├── manifest.yml              # Cấu hình Forge app
├── package.json              # Dependencies backend
├── src/
│   └── resolvers/
│       └── index.js          # Backend logic (gọi Jira API)
└── static/
    └── gadget/
        ├── package.json      # Dependencies frontend
        ├── public/
        │   └── index.html
        └── src/
            ├── index.js      # React entry
            ├── index.css     # Styles
            ├── App.js        # Main component
            └── components/
                ├── BurndownGadget.js
                ├── HealthGadget.js
                ├── RiskGadget.js
                ├── ChangesGadget.js
                ├── PriorityGadget.js
                └── ConfigForm.js
```

---

## 📚 Tài liệu tham khảo

- [Forge Documentation](https://developer.atlassian.com/platform/forge/)
- [Dashboard Gadget Tutorial](https://developer.atlassian.com/platform/forge/build-a-jira-dashboard-gadget/)
- [Forge CLI Reference](https://developer.atlassian.com/platform/forge/cli-reference/)
- [Custom UI Guide](https://developer.atlassian.com/platform/forge/custom-ui/)
- [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)

---

## 🆘 Hỗ trợ

Nếu gặp vấn đề:
1. Kiểm tra logs: `forge logs --tail`
2. Xem Atlassian Community: https://community.atlassian.com/
3. Tạo issue trên repo nếu có

---

**Happy Building! 🎉**
