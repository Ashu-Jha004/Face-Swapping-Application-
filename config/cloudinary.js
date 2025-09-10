import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary
 * @param {string} imagePath - Local file path
 * @param {string} folder - Cloudinary folder name
 * @param {string} publicId - Custom public ID (optional)
 * @returns {Promise<Object>} Upload result
 */
export async function uploadToCloudinary(
  imagePath,
  folder = "faceswap",
  publicId = null
) {
  try {
    const options = {
      folder: folder,
      resource_type: "image",
      format: "jpg", // Convert all to JPG for consistency
      quality: "auto:good",
    };

    if (publicId) {
      options.public_id = publicId;
    }

    console.log(`📤 Uploading to Cloudinary: ${imagePath}`);
    const result = await cloudinary.uploader.upload(imagePath, options);

    console.log(`✅ Uploaded successfully: ${result.secure_url}`);
    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Delete result
 */
export async function deleteFromCloudinary(publicId) {
  try {
    console.log(`🗑️ Deleting from Cloudinary: ${publicId}`);
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`✅ Deleted successfully: ${publicId}`);
    return result;
  } catch (error) {
    console.error("❌ Cloudinary delete error:", error);
    throw new Error(`Failed to delete from Cloudinary: ${error.message}`);
  }
}

export default cloudinary;
