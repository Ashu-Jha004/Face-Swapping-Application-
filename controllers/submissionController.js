import submissionModel from "../models/submissionModel.js";
import faceSwapAPI from "../utils/faceSwapApi.js";
import path from "path";
import fs from "fs";
import { ObjectId } from "mongodb"; // ✅ ADDED - For ObjectId validation

class SubmissionController {
  /**
   * Render the main form page
   */
  async renderForm(req, res) {
    try {
      const isAPIConfigured = faceSwapAPI.isConfigured();

      if (!isAPIConfigured) {
        console.warn("⚠️ LightX API not properly configured");
      }

      res.render("index", {
        error: null,
        swappedImage: null,
        oldInput: null,
        apiStatus: isAPIConfigured,
        submissionId: null,
        currentPage: "home",
      });
    } catch (error) {
      console.error("❌ Error rendering form:", error);
      res.status(500).render("index", {
        error: "Unable to load the form. Please try again later.",
        swappedImage: null,
        oldInput: null,
        apiStatus: false,
        submissionId: null,
        currentPage: "home",
      });
    }
  }

  /**
   * Handle form submission with face swap
   */
  async handleSubmission(req, res) {
    let tempFiles = [];

    try {
      console.log("🚀 Starting form submission process...");

      // Step 1: Validate and sanitize user input
      const inputValidation = submissionModel.validateAndSanitizeInput(
        req.body
      );

      if (!inputValidation.isValid) {
        console.log("❌ Input validation failed:", inputValidation.errors);
        return res.status(400).render("index", {
          error: inputValidation.errors.join(", "),
          swappedImage: null,
          oldInput: req.body,
          submissionId: null,
          apiStatus: faceSwapAPI.isConfigured(),
          currentPage: "home",
        });
      }

      // Step 2: Validate uploaded files
      const fileValidation = submissionModel.validateFiles(req.files);

      if (!fileValidation.isValid) {
        console.log("❌ File validation failed:", fileValidation.errors);
        return res.status(400).render("index", {
          error: fileValidation.errors.join(", "),
          swappedImage: null,
          oldInput: req.body,
          submissionId: null,
          apiStatus: faceSwapAPI.isConfigured(),
          currentPage: "home",
        });
      }

      // Store temp files for cleanup
      tempFiles = [req.files.source[0].path, req.files.target[0].path];

      // Step 3: Check API configuration
      if (!faceSwapAPI.isConfigured()) {
        throw new Error(
          "Face swap service is not properly configured. Please contact support."
        );
      }

      // Step 4: Upload images to Cloudinary
      console.log("📤 Uploading images to Cloudinary...");
      const submissionId = `sub_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const imageUploads = await submissionModel.uploadImages(
        req.files,
        submissionId
      );

      console.log("✅ Images uploaded to Cloudinary successfully");

      // Step 5: Perform face swap
      console.log("🔄 Performing face swap...");
      const swappedImageUrl = await faceSwapAPI.performFaceSwap(
        imageUploads.source.url,
        imageUploads.target.url,
        true,
        true
      );

      console.log("✅ Face swap completed successfully");

      // Step 6: Upload swapped result to Cloudinary
      console.log("📤 Uploading swapped result to Cloudinary...");
      const swappedImageUpload = await submissionModel.uploadSwappedImage(
        swappedImageUrl,
        submissionId
      );

      console.log("✅ Swapped image uploaded to Cloudinary");

      // Step 7: Save submission to database
      console.log("💾 Saving submission to database...");
      const submission = await submissionModel.createSubmission(
        inputValidation.sanitized,
        imageUploads,
        swappedImageUpload
      );

      console.log("✅ Submission saved successfully:", submission._id);

      // Step 8: Clean up local temp files
      if (tempFiles && tempFiles.length > 0) {
        tempFiles.forEach((filePath) => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`🗑️ Cleaned up temp file: ${filePath}`);
            }
          } catch (cleanupError) {
            console.warn(
              `⚠️ Failed to clean up temp file ${filePath}:`,
              cleanupError.message
            );
          }
        });
      }

      // Step 9: Render success response
      res.render("index", {
        error: null,
        swappedImage: swappedImageUpload.url,
        oldInput: null,
        submissionId: submission._id.toString(),
        apiStatus: true,
        currentPage: "home",
      });

      console.log("🎉 Complete submission process finished successfully!");
    } catch (error) {
      console.error("❌ Submission process failed:", error);

      // Clean up temp files on error
      this.cleanupTempFiles(tempFiles);

      // Determine appropriate error message
      let userErrorMessage = "An unexpected error occurred during processing.";

      if (error.message.includes("Face swap")) {
        userErrorMessage =
          "Face swap processing failed. Please try with different images.";
      } else if (error.message.includes("upload")) {
        userErrorMessage =
          "Image upload failed. Please check your images and try again.";
      } else if (error.message.includes("validation")) {
        userErrorMessage = error.message;
      } else if (error.message.includes("database")) {
        userErrorMessage = "Database error. Please try again later.";
      }

      res.status(500).render("index", {
        error: userErrorMessage,
        swappedImage: null,
        oldInput: req.body,
        submissionId: null,
        apiStatus: faceSwapAPI.isConfigured(),
        currentPage: "home",
      });
    }
  }

  /**
   * Display all submissions
   */
  async listSubmissions(req, res) {
    try {
      console.log("📋 Fetching all submissions...");

      // Get pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = 20;
      const skip = (page - 1) * limit;

      // Fetch submissions with pagination
      const submissions = await submissionModel.getAllSubmissions(limit, skip);

      // Get statistics
      const stats = await submissionModel.getStatistics();

      console.log(`✅ Retrieved ${submissions.length} submissions`);

      res.render("submissions", {
        submissions: submissions,
        stats: stats,
        currentPage: page,
        hasNextPage: submissions.length === limit,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
        error: null,
        pageContext: "submissions",
      });
    } catch (error) {
      console.error("❌ Error fetching submissions:", error);
      res.status(500).render("submissions", {
        submissions: [],
        stats: { total: 0, today: 0 },
        error: "Unable to load submissions. Please try again later.",
        currentPage: 1,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: 2,
        prevPage: 0,
        pageContext: "submissions",
      });
    }
  }

  /**
   * Display single submission details
   */
  async getSubmissionDetails(req, res) {
    try {
      const { id } = req.params;
      console.log(`🔍 Fetching submission details for ID: ${id}`);

      if (!id) {
        return res.status(400).render("submissionDetails", {
          submission: null,
          error: "Invalid submission ID provided.",
          currentPage: "details",
        });
      }

      // ✅ FIXED - Use MongoDB native ObjectId validation
      if (!ObjectId.isValid(id)) {
        return res.status(400).render("submissionDetails", {
          submission: null,
          error: "Invalid submission ID format.",
          currentPage: "details",
        });
      }

      const submission = await submissionModel.getSubmissionById(id);

      console.log("✅ Submission details retrieved successfully");

      res.render("submissionDetails", {
        submission: submission,
        error: null,
        currentPage: "details",
        breadcrumb: {
          home: "/",
          submissions: "/submissions",
          current: `Submission by ${submission.name}`,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching submission details:", error);

      let errorMessage = "Unable to load submission details.";
      let statusCode = 500;

      if (error.message.includes("not found")) {
        errorMessage = "Submission not found.";
        statusCode = 404;
      } else if (error.message.includes("Invalid")) {
        errorMessage = "Invalid submission ID format.";
        statusCode = 400;
      }

      res.status(statusCode).render("submissionDetails", {
        submission: null,
        error: errorMessage,
        currentPage: "details",
      });
    }
  }

  /**
   * Download image by submission ID and image type
   */
  async downloadImage(req, res) {
    try {
      const { id, type } = req.params;
      console.log(`📥 Download request for ${type} image of submission: ${id}`);

      if (!id || !type) {
        return res.status(400).json({
          error: "Missing submission ID or image type",
          timestamp: new Date().toISOString(),
        });
      }

      // ✅ FIXED - Use MongoDB native ObjectId validation
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          error: "Invalid submission ID format",
          timestamp: new Date().toISOString(),
        });
      }

      const validTypes = ["source", "target", "swapped"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          error: "Invalid image type. Use: source, target, or swapped",
          timestamp: new Date().toISOString(),
        });
      }

      const submission = await submissionModel.getSubmissionById(id);

      let imageData;
      let fileName;

      switch (type) {
        case "source":
          imageData = submission.sourceImage;
          fileName = `source_${submission.name.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}_${id}.jpg`;
          break;
        case "target":
          imageData = submission.targetImage;
          fileName = `target_${submission.name.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}_${id}.jpg`;
          break;
        case "swapped":
          imageData = submission.swappedImage;
          fileName = `swapped_${submission.name.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}_${id}.jpg`;
          break;
      }

      if (!imageData || !imageData.url) {
        return res.status(404).json({
          error: `${type} image not found for this submission`,
          timestamp: new Date().toISOString(),
        });
      }

      // Add Cloudinary download parameter if it's a Cloudinary URL
      let downloadUrl = imageData.url;
      if (downloadUrl.includes("cloudinary.com")) {
        downloadUrl = imageData.url.replace(
          "/upload/",
          "/upload/fl_attachment/"
        );
      }

      console.log(`✅ Redirecting to download URL for ${type} image`);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      res.redirect(downloadUrl);
    } catch (error) {
      console.error("❌ Error processing download request:", error);

      if (error.message.includes("not found")) {
        res.status(404).json({
          error: "Submission not found",
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(500).json({
          error: "Download failed. Please try again later.",
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Delete submission (admin functionality)
   */
  async deleteSubmission(req, res) {
    try {
      const { id } = req.params;
      console.log(`🗑️ Delete request for submission: ${id}`);

      if (!id) {
        return res.status(400).json({
          error: "Missing submission ID",
          timestamp: new Date().toISOString(),
        });
      }

      // ✅ FIXED - Use MongoDB native ObjectId validation
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          error: "Invalid submission ID format",
          timestamp: new Date().toISOString(),
        });
      }

      const deleted = await submissionModel.deleteSubmission(id);

      if (deleted) {
        console.log("✅ Submission deleted successfully");
        res.json({
          message: "Submission deleted successfully",
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          error: "Submission not found",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("❌ Error deleting submission:", error);
      res.status(500).json({
        error: "Delete failed. Please try again later.",
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get API status for admin dashboard
   */
  async getAPIStatus(req, res) {
    try {
      const isConfigured = faceSwapAPI.isConfigured();
      const isConnected = await faceSwapAPI.testConnection();

      res.json({
        lightx: {
          configured: isConfigured,
          connected: isConnected,
        },
        database: {
          connected: true,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Error checking API status:", error);
      res.status(500).json({
        error: "Unable to check API status",
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Clean up temporary uploaded files
   */
  cleanupTempFiles(filePaths) {
    if (!filePaths || !Array.isArray(filePaths)) {
      return;
    }

    filePaths.forEach((filePath) => {
      try {
        if (typeof filePath === "string" && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Cleaned up temp file: ${filePath}`);
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to clean up temp file ${filePath}:`,
          error.message
        );
      }
    });
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
      };

      res.json(health);
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// Export singleton instance
export default new SubmissionController();
