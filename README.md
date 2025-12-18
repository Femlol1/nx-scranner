# NX Scanner - QR Code Ticket Validator

A professional Next.js-based QR code scanner for validating train and bus tickets. Features real-time scanning with duplicate detection, admin dashboard, and comprehensive ticket validation.

## 🚀 Features

- **Real-time QR Scanning**: Uses native BarcodeDetector API with jsQR fallback
- **Ticket Format Support**:
  - QIT/QCK extended format with optional RRD codes
  - Short ticket format with ::#: markers
  - Generic fallback format
- **Duplicate Detection**: Tracks scan history with timestamps and count
- **Admin Dashboard**: View and manage today's scans with pagination
- **Haptic Feedback**: Vibration patterns for scan results (success/warning/error)
- **Dark Mode**: System-aware theme with manual toggle
- **Accessibility**: ARIA labels and keyboard navigation support
- **Mobile-Optimized**: Responsive design with torch/flashlight control

## 📋 Prerequisites

- Node.js 18+ or Bun
- MongoDB instance (local or cloud)
- Modern browser with camera support

## 🛠️ Installation

1. **Clone the repository**
```bash
git clone https://github.com/Femlol1/nx-scranner.git
cd nx-scranner
```

2. **Install dependencies**
```bash
npm install
# or
bun install
```

3. **Configure environment variables**

Create a `.env.local` file in the root directory:

```env
# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/nx-scanner

# Admin credentials for /admin route
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

> ⚠️ **Security Warning**: Use strong passwords in production!

4. **Run the development server**
```bash
npm run dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) to start scanning.

## 📱 Usage

### Scanner Page (`/`)

1. **Start Scanning**: Click "Start" to activate the camera
2. **Position QR Code**: Center the ticket QR code in the viewfinder
3. **View Results**: Modal displays validation status, ticket details, and duplicate warnings
4. **Scan Modes**:
   - **Continuous**: Auto-scans multiple tickets
   - **Single**: Stops after each scan (toggle with 'S' key)

### Admin Dashboard (`/admin`)

Protected by HTTP Basic Auth. Features:
- List of today's scans with pagination (25/50/100/200 per page)
- Scan count and timestamp tracking
- Search/filter by ticket text or key
- Expandable details showing scan history
- Clear all scans button

**Access**: Navigate to `/admin` and enter credentials from `.env.local`

## 🎨 Keyboard Shortcuts

- `S` - Toggle single-scan mode
- `Escape` - Close result modal
- `Space` - Start/Stop scanning (when focused)

## 🏗️ Project Structure

```
nx-scranner/
├── app/
│   ├── page.tsx           # Main scanner interface
│   ├── layout.tsx         # Root layout with metadata
│   ├── admin/
│   │   └── page.tsx       # Admin dashboard
│   ├── api/
│   │   └── scans/
│   │       ├── route.ts   # POST scan, check duplicates
│   │       ├── list/route.ts   # GET scans with pagination
│   │       └── clear/route.ts  # DELETE all scans
│   └── lib/
│       └── mongo.ts       # MongoDB connection pool
├── components/
│   ├── ScanResultModal.tsx  # Scan result modal with Portal
│   └── ui/
│       └── sonner.tsx      # Toast notifications
├── middleware.ts          # HTTP Basic Auth for /admin
└── public/                # Static assets
```

## 🔧 Configuration

### Ticket Format Validation

The scanner validates three ticket formats:

1. **QIT/QCK Extended**: `QIT:FLIGHT[:RRD]:TYPE:FARE:PURCHASE:ADULTS:CHILDREN:DEPART[:RETURN]::#:::#:QCODE:HASH`
2. **Short Format**: Markers with `::#:` separators
3. **Generic Fallback**: Any colon-separated data

### MongoDB Schema

Scans collection with TTL index (expires after 24 hours):
```javascript
{
  _id: ObjectId,
  text: String,        // Raw QR text
  key: String,         // Hash of text
  parsed: Object,      // Parsed ticket fields
  count: Number,       // Scan count
  firstSeen: Date,
  lastSeen: Date,
  createdAt: Date,
  uses: [{
    at: Date
  }]
}
```

## 🚀 Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables (Production)

Set these in your hosting platform:
- `MONGODB_URI` - Production MongoDB connection
- `ADMIN_USERNAME` - Admin login username
- `ADMIN_PASSWORD` - Strong password

### Recommended Platforms

- **Vercel**: Best for Next.js apps
- **Railway/Render**: Good for full-stack apps
- **Docker**: See `.dockerignore` for containerization

## 🔐 Security Features

- ✅ HTTP Basic Auth for admin routes
- ✅ MongoDB URI validation
- ✅ Environment variable protection
- ✅ Input sanitization and validation
- ✅ Race condition prevention
- ✅ Memory leak protection

## 📊 Recent Improvements

### High Priority (Completed)
- ✅ Admin authentication with middleware
- ✅ Memory leak fixes in scanner loop
- ✅ Camera race condition prevention
- ✅ MongoDB connection validation

### Medium Priority (Completed)
- ✅ Error handling with toast notifications
- ✅ Pagination on admin list (25/50/100/200 per page)
- ✅ Loading states for API operations
- ✅ UTC timezone consistency for date parsing

### Low Priority (Completed)
- ✅ Haptic feedback for scan results
- ✅ ARIA labels for accessibility
- ✅ Code documentation and comments
- ✅ Comprehensive README

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🐛 Known Issues

- BarcodeDetector API not available in all browsers (jsQR fallback active)
- Camera permissions required on first use
- Torch/flashlight may not work on all devices

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check existing issues for solutions

## 🙏 Acknowledgments

- Built with [Next.js 15](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- QR scanning via [jsQR](https://github.com/cozmo/jsQR)
- Toast notifications by [Sonner](https://sonner.emilkowal.ski/)
