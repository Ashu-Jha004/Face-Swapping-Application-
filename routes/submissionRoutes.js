import express from "express";
import submissionController from "../controllers/submissionController.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Enhanced Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = file.fieldname;
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  },
});

// File filter for strict image validation
const fileFilter = (req, file, cb) => {
  console.log(
    `🔍 Validating file: ${file.originalname}, MIME: ${file.mimetype}`
  );

  const allowedMimes = ["image/jpeg", "image/jpg", "image/png"];
  const allowedExts = [".jpg", ".jpeg", ".png"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    console.log(`✅ File validation passed: ${file.originalname}`);
    cb(null, true);
  } else {
    console.log(`❌ File validation failed: ${file.originalname}`);
    cb(
      new Error(
        `Invalid file type. Only JPEG, JPG, and PNG files are allowed. Received: ${file.mimetype}`
      ),
      false
    );
  }
};

// Configure multer with enhanced options
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
    files: 2, // Maximum 2 files (source + target)
    fields: 10, // Maximum form fields
  },
});

// Middleware for handling file upload errors
const handleUploadErrors = (error, req, res, next) => {
  console.error("📁 File upload error:", error);

  if (error instanceof multer.MulterError) {
    let errorMessage;

    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        errorMessage =
          "File size too large. Maximum allowed size is 2MB per image.";
        break;
      case "LIMIT_FILE_COUNT":
        errorMessage =
          "Too many files. Please upload exactly 2 images (source and target).";
        break;
      case "LIMIT_FIELD_COUNT":
        errorMessage = "Too many form fields.";
        break;
      case "LIMIT_UNEXPECTED_FILE":
        errorMessage =
          'Unexpected file field. Please use "source" and "target" fields only.';
        break;
      default:
        errorMessage = `File upload error: ${error.message}`;
    }

    return res.status(400).render("index", {
      error: errorMessage,
      swappedImage: null,
      oldInput: req.body || {},
      submissionId: null,
      apiStatus: false,
      currentPage: "home",
    });
  }

  if (error.message.includes("Invalid file type")) {
    return res.status(400).render("index", {
      error: error.message,
      swappedImage: null,
      oldInput: req.body || {},
      submissionId: null,
      apiStatus: false,
      currentPage: "home",
    });
  }

  // Pass other errors to global error handler
  next(error);
};

// Middleware to validate required files are present
const validateRequiredFiles = (req, res, next) => {
  if (!req.files) {
    return res.status(400).render("index", {
      error: "No files uploaded. Please select both source and target images.",
      swappedImage: null,
      oldInput: req.body,
      submissionId: null,
      apiStatus: false,
      currentPage: "home",
    });
  }

  if (!req.files.source || !req.files.source[0]) {
    return res.status(400).render("index", {
      error: "Source image is required. Please select your photo.",
      swappedImage: null,
      oldInput: req.body,
      submissionId: null,
      apiStatus: false,
      currentPage: "home",
    });
  }

  if (!req.files.target || !req.files.target[0]) {
    return res.status(400).render("index", {
      error: "Target image is required. Please select the style/target photo.",
      swappedImage: null,
      oldInput: req.body,
      submissionId: null,
      apiStatus: false,
      currentPage: "home",
    });
  }

  console.log("✅ Required files validation passed");
  next();
};

// Rate limiting middleware
const rateLimitMap = new Map();
const rateLimit = (maxRequests = 10, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitMap.has(ip)) {
      rateLimitMap.set(ip, []);
    }

    const requests = rateLimitMap.get(ip);
    const recentRequests = requests.filter((time) => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      console.warn(`⚠️ Rate limit exceeded for IP: ${ip}`);
      return res.status(429).render("index", {
        error: "Too many requests. Please wait a moment before trying again.",
        swappedImage: null,
        oldInput: req.body || {},
        submissionId: null,
        apiStatus: false,
        currentPage: "home",
      });
    }

    recentRequests.push(now);
    rateLimitMap.set(ip, recentRequests);
    next();
  };
};

// Middleware to log request details
const logRequest = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;

  console.log(`📝 ${timestamp} - ${method} ${url} from ${ip}`);

  if (req.body && Object.keys(req.body).length > 0) {
    const bodyKeys = Object.keys(req.body);
    console.log(`📋 Form fields: ${bodyKeys.join(", ")}`);
  }

  next();
};

// Apply global middleware to all routes
router.use(logRequest);

// ===============================
// PUBLIC ROUTES
// ===============================

/**
 * GET / - Main form page
 */
router.get("/", submissionController.renderForm);

/**
 * ✅ FIXED - POST /submit - Handle form submission with face swap
 */
router.post(
  "/submit",
  rateLimit(5, 15 * 60 * 1000), // 5 requests per 15 minutes
  upload.fields([
    { name: "source", maxCount: 1 },
    { name: "target", maxCount: 1 },
  ]),
  handleUploadErrors,
  validateRequiredFiles,
  submissionController.handleSubmission
);

/**
 * GET /submissions - List all submissions
 */
router.get("/submissions", submissionController.listSubmissions);
router.get("/submit", (req, res) => {
  console.log("⚠️ Direct GET access to /submit - redirecting to home");
  res.redirect(
    "/?error=" +
      encodeURIComponent(
        "Page not found. Please use the form below to submit your face swap request."
      )
  );
});

/**
 * GET /submissions/:id - View single submission details
 */
router.get("/submissions/:id", submissionController.getSubmissionDetails);

// ===============================
// DOWNLOAD ROUTES
// ===============================

/**
 * GET /download/:id/:type - Download specific image
 */
router.get(
  "/download/:id/:type",
  rateLimit(20, 15 * 60 * 1000),
  submissionController.downloadImage
);

// ===============================
// ADMIN ROUTES
// ===============================

/**
 * DELETE /admin/submissions/:id - Delete submission
 */
router.delete(
  "/admin/submissions/:id",
  rateLimit(10, 15 * 60 * 1000),
  submissionController.deleteSubmission
);

/**
 * GET /admin/status - API status check
 */
router.get("/admin/status", submissionController.getAPIStatus);

// ===============================
// UTILITY ROUTES
// ===============================

/**
 * GET /health - Health check endpoint
 */
router.get("/health", submissionController.healthCheck);

/**
 * GET /api-test - Test API connectivity
 */
router.get("/api-test", async (req, res) => {
  try {
    const faceSwapAPI = (await import("../utils/faceSwapApi.js")).default;
    const isConfigured = faceSwapAPI.isConfigured();
    const isConnected = await faceSwapAPI.testConnection();

    res.json({
      configured: isConfigured,
      connected: isConnected,
      timestamp: new Date().toISOString(),
      message: isConfigured && isConnected ? "API is ready" : "API has issues",
    });
  } catch (error) {
    res.status(500).json({
      error: "API test failed",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ===============================
// ✅ REMOVED PROBLEMATIC CATCH-ALL ROUTE
// The /*catchall route was intercepting /submit requests
// 404 handling should be done in app.js instead
// ===============================

export default router;
