import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({
  path: "./.env",
});
class FaceSwapAPI {
  constructor() {
    this.LIGHTX_API_KEY = process.env.LIGHTX_API_KEY;
    this.LIGHTX_BASE_URL = "https://api.lightxeditor.com/external/api";
    this.MAX_RETRIES = 5;
    this.POLL_INTERVAL = 3000;
    this.TIMEOUT = 30000;
    this.MAX_FILE_SIZE = 5 * 1024 * 1024;
    this.SUPPORTED_FORMATS = ["image/jpeg", "image/jpg", "image/png"];
    this.stats = {
      totalRequests: 0,
      successfulSwaps: 0,
      failedSwaps: 0,
      averageProcessingTime: 0,
    };
    this._validateConfig();
  }

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
    console.log("🔧 FaceSwap API Configuration:");
    console.log(
      `   API Key: ${this.LIGHTX_API_KEY ? "✅ Loaded" : "❌ Missing"}`
    );
    console.log(`   Base URL: ${this.LIGHTX_BASE_URL || "Not configured"}`);
    console.log(`   Max Retries: ${this.MAX_RETRIES}`);
    console.log(`   Poll Interval: ${this.POLL_INTERVAL}ms`);
    console.log(`   Timeout: ${this.TIMEOUT}ms`);
  }

  _validateImageBuffer(imageBuffer, contentType) {
    const errors = [];
    if (imageBuffer.length > this.MAX_FILE_SIZE) {
      errors.push(
        `Image size ${imageBuffer.length} bytes exceeds maximum allowed size of ${this.MAX_FILE_SIZE} bytes (5MB)`
      );
    }
    if (imageBuffer.length < 1024) {
      errors.push(
        `Image size ${imageBuffer.length} bytes is too small. Minimum size is 1KB`
      );
    }
    if (!this.SUPPORTED_FORMATS.includes(contentType)) {
      errors.push(
        `Unsupported image format: ${contentType}. Supported formats: ${this.SUPPORTED_FORMATS.join(
          ", "
        )}`
      );
    }
    const isValidImage = this._isValidImageBuffer(imageBuffer, contentType);
    if (!isValidImage) {
      errors.push(`Invalid image file format or corrupted image data`);
    }
    return {
      isValid: errors.length === 0,
      errors: errors,
    };
  }

  _isValidImageBuffer(buffer, contentType) {
    if (buffer.length < 4) return false;
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
    return jpg1 || png;
  }

  async getUploadUrl(imageBuffer, contentType = "image/jpeg") {
    const startTime = Date.now();
    try {
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
      if (!response.ok) {
        const errorText = await response.text();
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
      if (
        data.statusCode === 2000 &&
        data.body?.uploadImage &&
        data.body?.imageUrl
      ) {
        const processingTime = Date.now() - startTime;
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
      if (error.name === "AbortError") {
        throw new Error(
          "Upload URL request timed out. Please check your internet connection and try again."
        );
      }
      throw error;
    }
  }

  async uploadImageToS3(uploadUrl, imageBuffer, contentType) {
    const startTime = Date.now();
    try {
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
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(
          "S3 upload timed out. Please try again with a smaller image or check your internet connection."
        );
      }
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
  }

  async processImage(imageSource, isUrl = false) {
    try {
      let imageBuffer;
      let contentType = "image/jpeg";
      if (isUrl) {
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
        imageBuffer = fs.readFileSync(imageSource);
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
      const uploadInfo = await this.getUploadUrl(imageBuffer, contentType);
      await this.uploadImageToS3(
        uploadInfo.uploadUrl,
        imageBuffer,
        contentType
      );
      return uploadInfo.imageUrl;
    } catch (error) {
      throw error;
    }
  }

  async requestFaceSwap(sourceImageUrl, targetImageUrl) {
    const startTime = Date.now();
    try {
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
      if (data.statusCode === 2000 && data.body?.orderId) {
        return data.body.orderId;
      } else {
        throw new Error(`Face swap failed: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      this.stats.failedSwaps++;
      if (error.name === "AbortError") {
        throw new Error("Face swap request timed out. Please try again.");
      }
      throw error;
    }
  }

  async pollFaceSwapStatus(orderId) {
    const startTime = Date.now();
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
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
          if (attempt === this.MAX_RETRIES) {
            throw new Error(
              `Status polling failed after ${this.MAX_RETRIES} attempts`
            );
          }
          const waitTime = Math.min(
            this.POLL_INTERVAL * Math.pow(1.5, attempt),
            10000
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
        const data = await response.json();
        if (data.statusCode === 2000) {
          const status = data.body?.status;
          if (status === "active" && data.body?.output) {
            const totalTime = Date.now() - startTime;
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
            if (attempt < this.MAX_RETRIES) {
              await new Promise((resolve) =>
                setTimeout(resolve, this.POLL_INTERVAL)
              );
            }
          } else {
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
        if (error.name === "AbortError") {
        }
        if (
          attempt === this.MAX_RETRIES ||
          error.message.includes("Face swap failed during processing")
        ) {
          throw error;
        }
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

  async performFaceSwap(
    sourceImage,
    targetImage,
    sourceIsUrl = false,
    targetIsUrl = false
  ) {
    const overallStart = Date.now();
    try {
      const [sourceImageUrl, targetImageUrl] = await Promise.all([
        this.processImage(sourceImage, sourceIsUrl),
        this.processImage(targetImage, targetIsUrl),
      ]);
      const orderId = await this.requestFaceSwap(
        sourceImageUrl,
        targetImageUrl
      );
      const resultUrl = await this.pollFaceSwapStatus(orderId);
      return resultUrl;
    } catch (error) {
      throw error;
    }
  }

  isConfigured() {
    const hasApiKey = !!this.LIGHTX_API_KEY;
    const hasBaseUrl = !!this.LIGHTX_BASE_URL;
    if (!hasApiKey) {
      return false;
    }
    if (!hasBaseUrl) {
      return false;
    }
    if (this.LIGHTX_API_KEY.length < 16) {
      return false;
    }
    return true;
  }

  async testConnection() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
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
      if (response.status === 200) {
        const data = await response.json();
        return true;
      } else if (response.status === 403) {
        const errorText = await response.text();
        return false;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

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

  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulSwaps: 0,
      failedSwaps: 0,
      averageProcessingTime: 0,
    };
  }

  async downloadResult(imageUrl, outputPath) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download image: ${response.status} - ${response.statusText}`
        );
      }
      const buffer = await response.buffer();
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
          recursive: true,
        });
      }
      fs.writeFileSync(outputPath, buffer);
      return outputPath;
    } catch (error) {
      throw error;
    }
  }
}

const faceSwapAPI = new FaceSwapAPI();
export default faceSwapAPI;
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
