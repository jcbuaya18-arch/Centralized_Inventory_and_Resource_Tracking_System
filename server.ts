import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { db } from "./firebase";
import { collection, addDoc, getDocs, query, where, deleteDoc, doc } from "firebase/firestore";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directory exists
const uploadsBaseDir = path.join(process.cwd(), "uploads", "inventory");
if (!fs.existsSync(uploadsBaseDir)) {
  fs.mkdirSync(uploadsBaseDir, { recursive: true });
}

// Serve /uploads statically
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
  },
});

// Helper: check magic numbers to ensure the file is a valid image and not corrupted
function checkImageMagicNumbers(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // JPEG/JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
}

// API: Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API: Upload inventory images with strict validation
app.post("/api/upload-inventory-images", upload.array("images", 3), async (req, res): Promise<any> => {
  try {
    const files = req.files as Express.Multer.File[];
    const uploadedBy = req.body.uploadedBy || "Unknown User";
    const userRole = req.body.userRole || "STAFF";
    const userOffice = req.body.userOffice || "Unknown Office";
    const inventoryId = req.body.inventoryId || "NEW_ITEM";

    // Accounting permission check
    if (userRole === "ACCOUNTING") {
      return res.status(403).json({
        error: "Unauthorized: Accounting staff are restricted to view-only access and cannot perform uploads.",
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No image files provided." });
    }

    // 1. Strict Validation Check for all files first
    for (const file of files) {
      // Check maximum size (5 MB)
      if (file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          error: `File ${file.originalname} exceeds the maximum allowed size of 5 MB.`,
        });
      }

      // Check extension
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
      if (!allowedExts.includes(ext)) {
        return res.status(400).json({
          error: `File ${file.originalname} has an unsupported extension (${ext}). Allowed formats: JPG, JPEG, PNG, WEBP.`,
        });
      }

      // Check MIME type
      const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedMimes.includes(file.mimetype)) {
        return res.status(400).json({
          error: `File ${file.originalname} has an unsupported MIME type (${file.mimetype}). Allowed formats: JPG, JPEG, PNG, WEBP.`,
        });
      }

      // Corrupted / MIME spoofing check using magic numbers
      if (!checkImageMagicNumbers(file.buffer)) {
        return res.status(400).json({
          error: `File ${file.originalname} appears to be corrupted, malformed, or MIME-spoofed.`,
        });
      }
    }

    // 2. Setup Year/Month directories for storage
    const year = new Date().getFullYear().toString();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const targetDir = path.join(process.cwd(), "uploads", "inventory", year, month);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const savedMetadataList: any[] = [];

    // 3. Save images to disk and save metadata to Firestore
    for (const file of files) {
      const uniqueId = uuidv4();
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueFilename = `${uniqueId}${ext}`;
      const filePath = path.join(targetDir, uniqueFilename);
      const webPath = `/uploads/inventory/${year}/${month}/${uniqueFilename}`;

      // Write file to disk
      fs.writeFileSync(filePath, file.buffer);

      // Save metadata to Firestore
      const metadata = {
        image_path: webPath,
        image_filename: file.originalname,
        image_size: file.size,
        image_type: file.mimetype,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploadedBy,
      };

      let docId = "";
      if (db) {
        try {
          const docRef = await addDoc(collection(db, "image_metadata"), metadata);
          docId = docRef.id;

          // Write Audit Log
          await addDoc(collection(db, "system_logs"), {
            timestamp: new Date().toISOString(),
            user: uploadedBy,
            role: userRole,
            office: userOffice,
            action: `Uploaded Asset Image: ${file.originalname} (${webPath})`,
            module: "Inventory Module",
            relatedRecordId: inventoryId,
          });
        } catch (dbErr) {
          console.error("Failed to write image metadata to Firestore:", dbErr);
        }
      }

      savedMetadataList.push({
        id: docId,
        ...metadata,
      });
    }

    return res.json({
      success: true,
      images: savedMetadataList,
    });
  } catch (error: any) {
    console.error("Upload handler failed:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// API: Delete image file and metadata only if not referenced elsewhere
app.post("/api/delete-inventory-images", async (req, res): Promise<any> => {
  try {
    const { paths, user, userRole, userOffice, inventoryId } = req.body;

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: "No image paths provided for deletion." });
    }

    const deletedPaths: string[] = [];
    const skippedPaths: string[] = [];

    for (const imgPath of paths) {
      if (!imgPath || !imgPath.startsWith("/uploads/")) {
        skippedPaths.push(imgPath);
        continue;
      }

      // Check if image is referenced by any OTHER inventory item
      let isReferenced = false;
      if (db) {
        try {
          const q = query(
            collection(db, "inventory_items"),
            where("imageUrls", "array-contains", imgPath)
          );
          const snap = await getDocs(q);
          
          // Exclude reference of the current being-deleted/being-edited item
          const otherRefs = snap.docs.filter((doc) => doc.id !== inventoryId);
          if (otherRefs.length > 0) {
            isReferenced = true;
          }
        } catch (dbErr) {
          console.error("Error querying references for image path:", imgPath, dbErr);
        }
      }

      if (isReferenced) {
        console.log(`Skipped deleting physical file ${imgPath} - still referenced by another record.`);
        skippedPaths.push(imgPath);
        continue;
      }

      // Delete physical file
      const physicalPath = path.join(process.cwd(), imgPath);
      if (fs.existsSync(physicalPath)) {
        try {
          fs.unlinkSync(physicalPath);
        } catch (err) {
          console.error(`Failed to delete physical file: ${physicalPath}`, err);
        }
      }

      // Delete Firestore metadata and write Audit Log
      if (db) {
        try {
          const qMeta = query(
            collection(db, "image_metadata"),
            where("image_path", "==", imgPath)
          );
          const metaSnap = await getDocs(qMeta);
          for (const docObj of metaSnap.docs) {
            await deleteDoc(doc(db, "image_metadata", docObj.id));
          }

          await addDoc(collection(db, "system_logs"), {
            timestamp: new Date().toISOString(),
            user: user || "System",
            role: userRole || "STAFF",
            office: userOffice || "GSO",
            action: `Deleted Asset Image: ${path.basename(imgPath)}`,
            module: "Inventory Module",
            relatedRecordId: inventoryId || "N/A",
          });
        } catch (dbErr) {
          console.error("Error deleting metadata/logging audit:", dbErr);
        }
      }

      deletedPaths.push(imgPath);
    }

    return res.json({
      success: true,
      deletedPaths,
      skippedPaths,
    });
  } catch (error: any) {
    console.error("Delete handler failed:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// Serve frontend with Vite middleware in dev or static index.html in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} with Node ${process.version}`);
  });
}

startServer();
