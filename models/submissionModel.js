import database from "../config/db.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../config/cloudinary.js";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { ObjectId } from "mongodb";
import fs from "fs";
import path from "path";

class SubmissionModel {
  constructor() {
    this.collectionName = "submissions";
  }

  validateAndSanitizeInput(userData) {
    const errors = [];
    const sanitized = {};
    if (!userData.name || typeof userData.name !== "string") {
      errors.push("Name is required");
    } else {
      const sanitizedName = sanitizeHtml(userData.name.trim(), {
        allowedTags: [],
        allowedAttributes: {},
      });
      if (sanitizedName.length < 4 || sanitizedName.length > 30) {
        errors.push("Name must be between 4 and 30 characters");
      } else if (!/^[A-Za-z\s]+$/.test(sanitizedName)) {
        errors.push("Name must contain only alphabetic characters and spaces");
      } else {
        sanitized.name = sanitizedName;
      }
    }

    if (!userData.email || typeof userData.email !== "string") {
      errors.push("Email is required");
    } else {
      const sanitizedEmail = sanitizeHtml(userData.email.trim().toLowerCase(), {
        allowedTags: [],
        allowedAttributes: {},
      });
      if (!validator.isEmail(sanitizedEmail)) {
        errors.push("Please provide a valid email address");
      } else {
        sanitized.email = sanitizedEmail;
      }
    }

    if (!userData.phone || typeof userData.phone !== "string") {
      errors.push("Phone number is required");
    } else {
      const sanitizedPhone = sanitizeHtml(userData.phone.trim(), {
        allowedTags: [],
        allowedAttributes: {},
      });
      if (!/^\d{10}$/.test(sanitizedPhone)) {
        errors.push("Phone number must be exactly 10 digits");
      } else {
        sanitized.phone = sanitizedPhone;
      }
    }

    if (!userData.terms || userData.terms !== "on") {
      errors.push("You must accept the Terms & Conditions");
    } else {
      sanitized.terms = true;
    }

    return { isValid: errors.length === 0, errors, sanitized };
  }

  validateFiles(files) {
    const errors = [];
    if (!files || !files.source || !files.target) {
      errors.push("Both source and target images are required");
      return { isValid: false, errors };
    }

    const sourceFile = files.source[0];
    const targetFile = files.target[0];

    const maxSize = 2 * 1024 * 1024;
    if (sourceFile.size > maxSize) {
      errors.push("Source image must be less than 2MB");
    }
    if (targetFile.size > maxSize) {
      errors.push("Target image must be less than 2MB");
    }

    const allowedMimes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedMimes.includes(sourceFile.mimetype)) {
      errors.push("Source image must be JPEG, PNG, or JPG format");
    }
    if (!allowedMimes.includes(targetFile.mimetype)) {
      errors.push("Target image must be JPEG, PNG, or JPG format");
    }

    return { isValid: errors.length === 0, errors };
  }

  async uploadImages(files, submissionId) {
    try {
      const sourceFile = files.source[0];
      const targetFile = files.target[0];
      const sourceUpload = await uploadToCloudinary(
        sourceFile.path,
        "faceswap/source",
        `source_${submissionId}_${Date.now()}`
      );
      const targetUpload = await uploadToCloudinary(
        targetFile.path,
        "faceswap/target",
        `target_${submissionId}_${Date.now()}`
      );
      this.cleanupLocalFiles([sourceFile.path, targetFile.path]);
      return {
        source: sourceUpload,
        target: targetUpload,
      };
    } catch (error) {
      this.cleanupLocalFiles([files.source[0].path, files.target[0].path]);
      throw error;
    }
  }

  async uploadSwappedImage(imageUrl, submissionId) {
    try {
      const result = await uploadToCloudinary(
        imageUrl,
        "faceswap/results",
        `result_${submissionId}_${Date.now()}`
      );
      return result;
    } catch (error) {
      throw error;
    }
  }

  async createSubmission(userData, imageUploads, swappedImageUrl) {
    try {
      const collection = await database.getCollection(this.collectionName);
      const submission = {
        _id: new ObjectId(),
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        terms: userData.terms,
        sourceImage: {
          url: imageUploads.source.url,
          publicId: imageUploads.source.publicId,
          width: imageUploads.source.width,
          height: imageUploads.source.height,
          format: imageUploads.source.format,
          bytes: imageUploads.source.bytes,
        },
        targetImage: {
          url: imageUploads.target.url,
          publicId: imageUploads.target.publicId,
          width: imageUploads.target.width,
          height: imageUploads.target.height,
          format: imageUploads.target.format,
          bytes: imageUploads.target.bytes,
        },
        swappedImage: {
          url: swappedImageUrl.url,
          publicId: swappedImageUrl.publicId,
          width: swappedImageUrl.width,
          height: swappedImageUrl.height,
          format: swappedImageUrl.format,
          bytes: swappedImageUrl.bytes,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await collection.insertOne(submission);
      return { ...submission, _id: result.insertedId };
    } catch (error) {
      throw error;
    }
  }

  async getAllSubmissions(limit = 50, skip = 0) {
    try {
      const collection = await database.getCollection(this.collectionName);
      const submissions = await collection
        .find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      return submissions;
    } catch (error) {
      throw error;
    }
  }

  async getSubmissionById(id) {
    try {
      const collection = await database.getCollection(this.collectionName);
      const submission = await collection.findOne({ _id: new ObjectId(id) });
      if (!submission) {
        throw new Error("Submission not found");
      }
      return submission;
    } catch (error) {
      throw error;
    }
  }

  cleanupLocalFiles(filePaths) {
    filePaths.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  }

  async getStatistics() {
    try {
      const collection = await database.getCollection(this.collectionName);
      const totalSubmissions = await collection.countDocuments();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todaySubmissions = await collection.countDocuments({
        createdAt: { $gte: todayStart },
      });

      return {
        total: totalSubmissions,
        today: todaySubmissions,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }
}

export default new SubmissionModel();
