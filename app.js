import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import submissionRoutes from "./routes/submissionRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup EJS
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

// Serve static files
app.use(express.static(path.join(process.cwd(), "public")));

// Body parsing middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ ADDED - Enhanced Debug Logging Middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;

  console.log(`🔍 DEBUG: ${method} ${url} - ${timestamp} from ${ip}`);

  // Log form data for POST requests
  if (method === "POST" && req.body) {
    console.log(`📋 Form fields:`, Object.keys(req.body));
  }

  next();
});

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Created uploads directory: ${uploadDir}`);
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    // Generate unique filename to avoid conflicts
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// File filter for image validation
const fileFilter = (req, file, cb) => {
  const allowedMimes = ["image/jpeg", "image/png", "image/jpg"];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, and JPG files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
});

// Make upload middleware available to routes
app.use((req, res, next) => {
  req.upload = upload;
  next();
});

// ✅ ADDED - Route mounting debug
console.log("📌 Mounting submission routes at '/'...");

// Routes
app.use("/", submissionRoutes);

// ✅ ADDED - Catch-all debug middleware for unmatched routes
app.use((req, res, next) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  next();
});

// ✅ ENHANCED - Global error handling middleware
app.use((error, req, res, next) => {
  console.error("🚨 Global error handler:", error.message);
  console.error("📍 Stack trace:", error.stack);

  // Enhanced error context
  const errorContext = {
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString(),
    userAgent: req.get("User-Agent"),
  };

  console.error("📋 Error context:", errorContext);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).render("index", {
        error: "File size too large. Maximum allowed size is 2MB.",
        swappedImage: null,
        oldInput: req.body || {},
        submissionId: null,
        apiStatus: false,
        currentPage: "home",
      });
    }
  }

  if (error.message.includes("Only JPEG, PNG, and JPG files are allowed")) {
    return res.status(400).render("index", {
      error: "Invalid file format. Only JPEG, PNG, and JPG files are allowed.",
      swappedImage: null,
      oldInput: req.body || {},
      submissionId: null,
      apiStatus: false,
      currentPage: "home",
    });
  }

  res.status(500).render("index", {
    error: "An unexpected error occurred. Please try again.",
    swappedImage: null,
    oldInput: req.body || {},
    submissionId: null,
    apiStatus: false,
    currentPage: "home",
  });
});

// ✅ ENHANCED - Server startup with detailed logging
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 Views directory: ${path.join(process.cwd(), "views")}`);
  console.log(`📁 Uploads directory: ${uploadDir}`);
  console.log(`📋 Available routes:`);
  console.log(`   GET  / - Main form page`);
  console.log(`   POST /submit - Form submission`);
  console.log(`   GET  /submissions - View all submissions`);
  console.log(`   GET  /submissions/:id - View submission details`);
  console.log(`   GET  /download/:id/:type - Download images`);
  console.log(`   GET  /health - Health check`);
  console.log(`✅ Server ready to accept requests!`);
});

export default app;
