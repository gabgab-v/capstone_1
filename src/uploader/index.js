const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const UPLOAD_DIR = path.join(__dirname, "public", "uploads");

// ensure directory exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  // accept images only
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const app = express();
app.use(cors()); // allow connections from your app

// ✅ ADD THIS LINE to serve the files
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));


app.post("/upload", upload.single("image"), (req, res) => {
  // ... rest of your code is perfect
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  res.json({ imageUrl });

});

// Optional: health
app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.UPLOADER_PORT || 4001;
app.listen(PORT, () => console.log(`Uploader running on port ${PORT}`));
