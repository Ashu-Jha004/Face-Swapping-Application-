import submissionModel from "../models/submissionModel.js";
import faceSwapAPI from "../utils/faceSwapApi.js";
import path from "path";
import fs from "fs";
import { ObjectId } from "mongodb";

class SubmissionController {
  async renderForm(req, res) {
    try {
      const isAPIConfigured = faceSwapAPI.isConfigured();
      if (!isAPIConfigured) {
        console.warn("LightX API not properly configured");
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
      console.error("Error rendering form:", error);
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

  async handleSubmission(req, res) {
    let tempFiles = [];
    try {
      const inputValidation = submissionModel.validateAndSanitizeInput(
        req.body
      );
      if (!inputValidation.isValid) {
        return res.status(400).render("index", {
          error: inputValidation.errors.join(", "),
          swappedImage: null,
          oldInput: req.body,
          submissionId: null,
          apiStatus: faceSwapAPI.isConfigured(),
          currentPage: "home",
        });
      }

      const fileValidation = submissionModel.validateFiles(req.files);
      if (!fileValidation.isValid) {
        return res.status(400).render("index", {
          error: fileValidation.errors.join(", "),
          swappedImage: null,
          oldInput: req.body,
          submissionId: null,
          apiStatus: faceSwapAPI.isConfigured(),
          currentPage: "home",
        });
      }

      tempFiles = [req.files.source[0].path, req.files.target[0].path];
      if (!faceSwapAPI.isConfigured()) {
        throw new Error(
          "Face swap service is not properly configured. Please contact support."
        );
      }

      const submissionId = `sub_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const imageUploads = await submissionModel.uploadImages(
        req.files,
        submissionId
      );
      const swappedImageUrl = await faceSwapAPI.performFaceSwap(
        imageUploads.source.url,
        imageUploads.target.url,
        true,
        true
      );
      const swappedImageUpload = await submissionModel.uploadSwappedImage(
        swappedImageUrl,
        submissionId
      );
      const submission = await submissionModel.createSubmission(
        inputValidation.sanitized,
        imageUploads,
        swappedImageUpload
      );

      if (tempFiles && tempFiles.length > 0) {
        tempFiles.forEach((filePath) => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (cleanupError) {
            console.warn(
              `Failed to clean up temp file ${filePath}:`,
              cleanupError.message
            );
          }
        });
      }

      res.render("index", {
        error: null,
        swappedImage: swappedImageUpload.url,
        oldInput: null,
        submissionId: submission._id.toString(),
        apiStatus: true,
        currentPage: "home",
      });
    } catch (error) {
      console.error("Submission process failed:", error);
      this.cleanupTempFiles(tempFiles);
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

  async listSubmissions(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 20;
      const skip = (page - 1) * limit;

      const submissions = await submissionModel.getAllSubmissions(limit, skip);
      const stats = await submissionModel.getStatistics();

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
      console.error("Error fetching submissions:", error);
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

  async getSubmissionDetails(req, res) {
    try {
      const { id } = req.params;
      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).render("submissionDetails", {
          submission: null,
          error: "Invalid submission ID format.",
          currentPage: "details",
        });
      }

      const submission = await submissionModel.getSubmissionById(id);
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
      console.error("Error fetching submission details:", error);
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

  async downloadImage(req, res) {
    try {
      const { id, type } = req.params;
      if (!id || !type || !ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid request parameters" });
      }

      const validTypes = ["source", "target", "swapped"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          error: "Invalid image type. Use: source, target, or swapped",
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
        });
      }

      let downloadUrl = imageData.url;
      if (downloadUrl.includes("cloudinary.com")) {
        downloadUrl = imageData.url.replace(
          "/upload/",
          "/upload/fl_attachment/"
        );
      }

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      res.redirect(downloadUrl);
    } catch (error) {
      console.error("Error processing download request:", error);
      if (error.message.includes("not found")) {
        res.status(404).json({ error: "Submission not found" });
      } else {
        res
          .status(500)
          .json({ error: "Download failed. Please try again later." });
      }
    }
  }

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
      console.error("Error checking API status:", error);
      res.status(500).json({ error: "Unable to check API status" });
    }
  }

  cleanupTempFiles(filePaths) {
    if (!filePaths || !Array.isArray(filePaths)) {
      return;
    }
    filePaths.forEach((filePath) => {
      try {
        if (typeof filePath === "string" && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(
          `Failed to clean up temp file ${filePath}:`,
          error.message
        );
      }
    });
  }

  async healthCheck(req, res) {
    try {
      const health = {
        status: "healthy",
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
      };
      res.json(health);
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        error: error.message,
      });
    }
  }
}

export default new SubmissionController();
