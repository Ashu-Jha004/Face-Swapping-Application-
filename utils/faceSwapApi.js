import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables with explicit path
dotenv.config({ path: "./.env" });

class FaceSwapAPI {
  constructor() {
    this.LIGHTX_API_KEY = process.env.LIGHTX_API_KEY;
    this.LIGHTX_BASE_URL = "https://api.lightxeditor.com/external/api";
    this.MAX_RETRIES = 5; // As per API docs
    this.POLL_INTERVAL = 3000; // 3 seconds as per docs
    this.TIMEOUT = 30000; // 30 seconds
    this.MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB as per LightX docs
    this.SUPPORTED_FORMATS = ["image/jpeg", "image/jpg", "image/png"];

    // Performance tracking
    this.stats = {
      totalRequests: 0,
      successfulSwaps: 0,
      failedSwaps: 0,
      averageProcessingTime: 0,
    };

    // Validate configuration on initialization
    this._validateConfig();
  }

  /**
   * Private method to validate configuration
   * @private
   */
  _validateConfig() {
    if (!this.LIGHTX_API_KEY) {
      console.error("❌ LIGHTX_API_KEY not found in environment variables");
      console.error(
        "💡 Please ensure your .env file contains: LIGHTX_API_KEY=your_api_key"
      );
    }

    if (!this.LIGHTX_BASE_URL) {
      console.error("❌ LIGHTX_BASE_URL not configured");
    }

    // Log configuration status (without exposing sensitive data)
    console.log("🔧 FaceSwap API Configuration:");
    console.log(
      `   API Key: ${this.LIGHTX_API_KEY ? "✅ Loaded" : "❌ Missing"}`
    );
    console.log(`   Base URL: ${this.LIGHTX_BASE_URL || "Not configured"}`);
    console.log(`   Max Retries: ${this.MAX_RETRIES}`);
    console.log(`   Poll Interval: ${this.POLL_INTERVAL}ms`);
    console.log(`   Timeout: ${this.TIMEOUT}ms`);
  }

  /**
   * Validate image buffer
   * @param {Buffer} imageBuffer - Image buffer to validate
   * @param {string} contentType - MIME type
   * @returns {Object} - Validation result
   * @private
   */
  _validateImageBuffer(imageBuffer, contentType) {
    const errors = [];

    // Size validation
    if (imageBuffer.length > this.MAX_FILE_SIZE) {
      errors.push(
        `Image size ${imageBuffer.length} bytes exceeds maximum allowed size of ${this.MAX_FILE_SIZE} bytes (5MB)`
      );
    }

    if (imageBuffer.length < 1024) {
      // Minimum 1KB
      errors.push(
        `Image size ${imageBuffer.length} bytes is too small. Minimum size is 1KB`
      );
    }

    // Format validation
    if (!this.SUPPORTED_FORMATS.includes(contentType)) {
      errors.push(
        `Unsupported image format: ${contentType}. Supported formats: ${this.SUPPORTED_FORMATS.join(
          ", "
        )}`
      );
    }

    // Basic image header validation
    const isValidImage = this._isValidImageBuffer(imageBuffer, contentType);
    if (!isValidImage) {
      errors.push(`Invalid image file format or corrupted image data`);
    }

    return {
      isValid: errors.length === 0,
      errors: errors,
    };
  }

  /**
   * Check if buffer contains valid image data
   * @param {Buffer} buffer - Image buffer
   * @param {string} contentType - Expected content type
   * @returns {boolean} - Whether buffer is valid image
   * @private
   */
  _isValidImageBuffer(buffer, contentType) {
    if (buffer.length < 4) return false;

    // Check magic numbers for different image formats
    const jpg1 = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const png =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;

    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      return jpg1;
    } else if (contentType.includes("png")) {
      return png;
    }

    return jpg1 || png; // Default fallback
  }

  /**
   * Step 1: Get upload URL from LightX API V2
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} contentType - MIME type (image/jpeg or image/png)
   * @returns {Promise<Object>} - Upload URLs
   */
  async getUploadUrl(imageBuffer, contentType = "image/jpeg") {
    const startTime = Date.now();

    try {
      console.log(
        `📤 Getting upload URL for ${contentType}, size: ${imageBuffer.length} bytes`
      );

      // Validate image before upload
      const validation = this._validateImageBuffer(imageBuffer, contentType);
      if (!validation.isValid) {
        throw new Error(
          `Image validation failed: ${validation.errors.join(", ")}`
        );
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const response = await fetch(
        `${this.LIGHTX_BASE_URL}/v2/uploadImageUrl`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.LIGHTX_API_KEY,
            "User-Agent": "FaceSwapAPI/1.0",
          },
          body: JSON.stringify({
            uploadType: "imageUrl",
            size: imageBuffer.length,
            contentType: contentType,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      console.log("📊 Response Status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("📊 Error Response:", errorText);

        // Enhanced error handling
        if (response.status === 403) {
          throw new Error(
            `API Authentication Failed (403). Please verify your LightX API key has Face Swap permissions and your account has sufficient credits. Response: ${errorText}`
          );
        } else if (response.status === 429) {
          throw new Error(
            `Rate limit exceeded (429). Please wait before making additional requests. Response: ${errorText}`
          );
        } else if (response.status === 402) {
          throw new Error(
            `Payment required (402). Please check your account balance and billing status. Response: ${errorText}`
          );
        }

        throw new Error(
          `Failed to get upload URL: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();
      console.log("📤 Upload URL response:", data);

      if (
        data.statusCode === 2000 &&
        data.body?.uploadImage &&
        data.body?.imageUrl
      ) {
        const processingTime = Date.now() - startTime;
        console.log(`⏱️ Upload URL generated in ${processingTime}ms`);

        return {
          uploadUrl: data.body.uploadImage,
          imageUrl: data.body.imageUrl,
          size: data.body.size,
          processingTime: processingTime,
        };
      } else {
        throw new Error(`Invalid upload URL response: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      console.error("❌ Get upload URL error:", error.message);

      if (error.name === "AbortError") {
        throw new Error(
          "Upload URL request timed out. Please check your internet connection and try again."
        );
      }

      throw error;
    }
  }

  /**
   * Step 2: Upload image to S3 using PUT request
   * @param {string} uploadUrl - S3 upload URL
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} contentType - MIME type
   * @returns {Promise<void>}
   */
  async uploadImageToS3(uploadUrl, imageBuffer, contentType) {
    const startTime = Date.now();

    try {
      console.log(
        `📤 Uploading image to S3, size: ${imageBuffer.length} bytes`
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": imageBuffer.length.toString(),
        },
        body: imageBuffer,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `S3 upload failed: ${response.status} - ${response.statusText}`
        );
      }

      const processingTime = Date.now() - startTime;
      console.log(
        `✅ Image uploaded to S3 successfully in ${processingTime}ms`
      );
    } catch (error) {
      console.error("❌ S3 upload error:", error.message);

      if (error.name === "AbortError") {
        throw new Error(
          "S3 upload timed out. Please try again with a smaller image or check your internet connection."
        );
      }

      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
  }

  /**
   * Process image from Cloudinary URL or local file
   * @param {string} imageSource - Cloudinary URL or file path
   * @param {boolean} isUrl - Whether source is URL
   * @returns {Promise<string>} - Final image URL for face swap
   */
  async processImage(imageSource, isUrl = false) {
    const startTime = Date.now();

    try {
      let imageBuffer;
      let contentType = "image/jpeg";

      if (isUrl) {
        console.log(`🔍 Fetching image from URL: ${imageSource}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

        const imageResponse = await fetch(imageSource, {
          signal: controller.signal,
          headers: {
            "User-Agent": "FaceSwapAPI/1.0",
          },
        });

        clearTimeout(timeoutId);

        if (!imageResponse.ok) {
          throw new Error(
            `Failed to fetch image from URL: ${imageResponse.status} - ${imageResponse.statusText}`
          );
        }

        imageBuffer = await imageResponse.buffer();
        contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      } else {
        if (!fs.existsSync(imageSource)) {
          throw new Error(`File not found: ${imageSource}`);
        }

        const stats = fs.statSync(imageSource);
        console.log(
          `📁 Reading local file: ${imageSource} (${stats.size} bytes)`
        );

        imageBuffer = fs.readFileSync(imageSource);

        // Determine content type from file extension
        const ext = path.extname(imageSource).toLowerCase();
        if (ext === ".png") {
          contentType = "image/png";
        } else if (ext === ".jpg" || ext === ".jpeg") {
          contentType = "image/jpeg";
        } else {
          throw new Error(
            `Unsupported file extension: ${ext}. Please use .jpg, .jpeg, or .png files.`
          );
        }
      }

      // Step 1: Get upload URL
      const uploadInfo = await this.getUploadUrl(imageBuffer, contentType);

      // Step 2: Upload to S3
      await this.uploadImageToS3(
        uploadInfo.uploadUrl,
        imageBuffer,
        contentType
      );

      const totalTime = Date.now() - startTime;
      console.log(`✅ Image processing completed in ${totalTime}ms`);

      // Return the final image URL
      return uploadInfo.imageUrl;
    } catch (error) {
      console.error("❌ Process image error:", error.message);
      throw error;
    }
  }

  /**
   * Request face swap using LightX API V1
   * @param {string} sourceImageUrl - Source image URL
   * @param {string} targetImageUrl - Target image URL
   * @returns {Promise<string>} - Order ID
   */
  async requestFaceSwap(sourceImageUrl, targetImageUrl) {
    const startTime = Date.now();

    try {
      console.log("🔄 Requesting face swap...");
      console.log("📍 Source URL:", sourceImageUrl);
      console.log("📍 Target URL:", targetImageUrl);

      this.stats.totalRequests++;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const response = await fetch(`${this.LIGHTX_BASE_URL}/v1/face-swap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.LIGHTX_API_KEY,
          "User-Agent": "FaceSwapAPI/1.0",
        },
        body: JSON.stringify({
          imageUrl: sourceImageUrl,
          styleImageUrl: targetImageUrl,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Face swap request error:", errorText);

        if (response.status === 403) {
          throw new Error(
            `Face Swap API access denied (403). Please check your subscription plan and ensure Face Swap API is enabled for your account. Response: ${errorText}`
          );
        } else if (response.status === 402) {
          throw new Error(
            `Insufficient credits (402). Please add credits to your LightX account. Response: ${errorText}`
          );
        } else if (response.status === 400) {
          throw new Error(
            `Invalid request (400). Please check that both images contain clear, visible faces. Response: ${errorText}`
          );
        }

        throw new Error(
          `Face swap request failed: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();
      console.log("🔄 Face swap response:", data);

      if (data.statusCode === 2000 && data.body?.orderId) {
        const processingTime = Date.now() - startTime;
        console.log(
          `✅ Face swap initiated in ${processingTime}ms, Order ID: ${data.body.orderId}`
        );
        return data.body.orderId;
      } else {
        throw new Error(`Face swap failed: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      console.error("❌ Face swap request error:", error.message);
      this.stats.failedSwaps++;

      if (error.name === "AbortError") {
        throw new Error("Face swap request timed out. Please try again.");
      }

      throw error;
    }
  }

  /**
   * Poll face swap status with exponential backoff
   * @param {string} orderId - Order ID from face swap request
   * @returns {Promise<string>} - Result image URL
   */
  async pollFaceSwapStatus(orderId) {
    const startTime = Date.now();
    console.log(`⏳ Polling face swap status for order: ${orderId}`);

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(
          `🔍 Status check attempt ${attempt}/${this.MAX_RETRIES}...`
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

        const response = await fetch(
          `${this.LIGHTX_BASE_URL}/v1/order-status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.LIGHTX_API_KEY,
              "User-Agent": "FaceSwapAPI/1.0",
            },
            body: JSON.stringify({
              orderId: orderId,
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(
            `⚠️ Status check failed: ${response.status} - ${errorText}`
          );

          if (attempt === this.MAX_RETRIES) {
            throw new Error(
              `Status polling failed after ${this.MAX_RETRIES} attempts`
            );
          }

          // Exponential backoff for failed requests
          const waitTime = Math.min(
            this.POLL_INTERVAL * Math.pow(1.5, attempt),
            10000
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        const data = await response.json();
        console.log(`📊 Status response (attempt ${attempt}):`, data);

        if (data.statusCode === 2000) {
          const status = data.body?.status;

          if (status === "active" && data.body?.output) {
            const totalTime = Date.now() - startTime;
            console.log(
              `🎉 Face swap completed successfully in ${totalTime}ms!`
            );
            console.log("📸 Result URL:", data.body.output);

            // Update stats
            this.stats.successfulSwaps++;
            this.stats.averageProcessingTime =
              (this.stats.averageProcessingTime *
                (this.stats.successfulSwaps - 1) +
                totalTime) /
              this.stats.successfulSwaps;

            return data.body.output;
          } else if (status === "failed") {
            this.stats.failedSwaps++;
            throw new Error(
              "Face swap failed during processing. This may be due to unclear faces or incompatible images."
            );
          } else if (status === "init") {
            console.log(`⏳ Status: ${status}, waiting...`);

            if (attempt < this.MAX_RETRIES) {
              console.log(
                `⏱️ Waiting ${this.POLL_INTERVAL}ms before next attempt...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, this.POLL_INTERVAL)
              );
            }
          } else {
            console.log(`❓ Unknown status: ${status}, continuing to poll...`);
            await new Promise((resolve) =>
              setTimeout(resolve, this.POLL_INTERVAL)
            );
          }
        } else {
          throw new Error(
            `Status check error: ${data.message || "Unknown error"}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Status check attempt ${attempt} failed:`,
          error.message
        );

        if (error.name === "AbortError") {
          console.warn(`⚠️ Request timeout on attempt ${attempt}`);
        }

        if (
          attempt === this.MAX_RETRIES ||
          error.message.includes("Face swap failed during processing")
        ) {
          throw error;
        }

        // Progressive backoff
        const waitTime = Math.min(
          this.POLL_INTERVAL * Math.pow(1.2, attempt),
          8000
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.stats.failedSwaps++;
    throw new Error(
      `Face swap did not complete within ${this.MAX_RETRIES} attempts (${
        (this.MAX_RETRIES * this.POLL_INTERVAL) / 1000
      } seconds)`
    );
  }

  /**
   * Complete face swap process
   * @param {string} sourceImage - Source image (file path or URL)
   * @param {string} targetImage - Target image (file path or URL)
   * @param {boolean} sourceIsUrl - Whether source is URL
   * @param {boolean} targetIsUrl - Whether target is URL
   * @returns {Promise<string>} - Final swapped image URL
   */
  async performFaceSwap(
    sourceImage,
    targetImage,
    sourceIsUrl = false,
    targetIsUrl = false
  ) {
    const overallStart = Date.now();

    try {
      console.log("🚀 Starting complete face swap process...");
      console.log(
        `📊 Current Stats - Total: ${this.stats.totalRequests}, Success: ${this.stats.successfulSwaps}, Failed: ${this.stats.failedSwaps}`
      );

      // Step 1: Process both images to get LightX URLs
      console.log("📤 Step 1: Processing images...");
      const [sourceImageUrl, targetImageUrl] = await Promise.all([
        this.processImage(sourceImage, sourceIsUrl),
        this.processImage(targetImage, targetIsUrl),
      ]);

      console.log("✅ Both images processed successfully");

      // Step 2: Request face swap
      console.log("🔄 Step 2: Requesting face swap...");
      const orderId = await this.requestFaceSwap(
        sourceImageUrl,
        targetImageUrl
      );

      // Step 3: Poll for completion
      console.log("⏳ Step 3: Waiting for face swap completion...");
      const resultUrl = await this.pollFaceSwapStatus(orderId);

      const totalTime = Date.now() - overallStart;
      console.log(
        `🎉 Face swap process completed successfully in ${totalTime}ms!`
      );

      return resultUrl;
    } catch (error) {
      const totalTime = Date.now() - overallStart;
      console.error(
        `❌ Face swap process failed after ${totalTime}ms:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Validate API configuration
   * @returns {boolean}
   */
  isConfigured() {
    const hasApiKey = !!this.LIGHTX_API_KEY;
    const hasBaseUrl = !!this.LIGHTX_BASE_URL;

    if (!hasApiKey) {
      console.error("❌ LIGHTX_API_KEY not found in environment variables");
      return false;
    }

    if (!hasBaseUrl) {
      console.error("❌ LIGHTX_BASE_URL not configured");
      return false;
    }

    // Additional API key format validation
    if (this.LIGHTX_API_KEY.length < 16) {
      console.error("❌ LIGHTX_API_KEY appears to be invalid (too short)");
      return false;
    }

    console.log("✅ LightX API configuration validated");
    return true;
  }

  /**
   * Test API connectivity with enhanced error reporting
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      console.log("🔗 Testing LightX API connectivity...");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for test

      const response = await fetch(
        `${this.LIGHTX_BASE_URL}/v2/uploadImageUrl`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.LIGHTX_API_KEY,
            "User-Agent": "FaceSwapAPI/1.0",
          },
          body: JSON.stringify({
            uploadType: "imageUrl",
            size: 1000,
            contentType: "image/jpeg",
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      console.log(`📊 API Test Status: ${response.status}`);

      if (response.status === 200) {
        console.log("✅ API is reachable and authentication successful!");
        const data = await response.json();
        console.log("📊 Test response received successfully");
        return true;
      } else if (response.status === 403) {
        console.error(
          "❌ API key authentication failed - check your subscription and API key"
        );
        const errorText = await response.text();
        console.error("Error details:", errorText);
        return false;
      } else {
        console.warn(`⚠️ Unexpected API response: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error("❌ API connectivity test failed:", error.message);

      if (error.message.includes("getaddrinfo ENOTFOUND")) {
        console.error(
          "🌐 DNS resolution issue - check your internet connection"
        );
      } else if (error.name === "AbortError") {
        console.error("⏰ Connection test timed out");
      }

      return false;
    }
  }

  /**
   * Get current API usage statistics
   * @returns {Object} - Usage statistics
   */
  getStats() {
    const successRate =
      this.stats.totalRequests > 0
        ? (
            (this.stats.successfulSwaps / this.stats.totalRequests) *
            100
          ).toFixed(2)
        : 0;

    return {
      ...this.stats,
      successRate: `${successRate}%`,
      averageProcessingTimeFormatted: `${Math.round(
        this.stats.averageProcessingTime
      )}ms`,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulSwaps: 0,
      failedSwaps: 0,
      averageProcessingTime: 0,
    };
    console.log("📊 Statistics reset");
  }

  /**
   * Download and save result image
   * @param {string} imageUrl - Result image URL
   * @param {string} outputPath - Local path to save image
   * @returns {Promise<string>} - Saved file path
   */
  async downloadResult(imageUrl, outputPath) {
    try {
      console.log(`📥 Downloading result image from: ${imageUrl}`);

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download image: ${response.status} - ${response.statusText}`
        );
      }

      const buffer = await response.buffer();

      // Ensure output directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, buffer);
      console.log(`✅ Result image saved to: ${outputPath}`);

      return outputPath;
    } catch (error) {
      console.error("❌ Download failed:", error.message);
      throw error;
    }
  }
}

// Export singleton instance
const faceSwapAPI = new FaceSwapAPI();
export default faceSwapAPI;

// Named exports for individual methods
export const {
  processImage,
  requestFaceSwap,
  pollFaceSwapStatus,
  performFaceSwap,
  isConfigured,
  testConnection,
  getStats,
  resetStats,
  downloadResult,
} = faceSwapAPI;
