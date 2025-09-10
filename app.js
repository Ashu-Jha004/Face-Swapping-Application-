import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import submissionRoutes from "./routes/submissionRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

app.use(express.static(path.join(process.cwd(), "public")));

app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(express.json());

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;
  if (method === "POST" && req.body) {
  }
  next();
});

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

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
    fileSize: 2 * 1024 * 1024,
  },
});

app.use((req, res, next) => {
  req.upload = upload;
  next();
});

app.use("/", submissionRoutes);

app.use((req, res, next) => {
  next();
});

app.use((error, req, res, next) => {
  const errorContext = {
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString(),
    userAgent: req.get("User-Agent"),
  };
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

app.listen(PORT, () => {});

export default app;
