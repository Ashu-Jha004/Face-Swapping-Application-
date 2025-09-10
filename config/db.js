import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

class Database {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    try {
      if (this.client) {
        return this.db;
      }

      this.client = new MongoClient(process.env.MONGODB_CONNECTION_STRING, {
        useUnifiedTopology: true,
      });

      await this.client.connect();
      this.db = this.client.db(process.env.DB_NAME || "faceswap_app");

      console.log("✅ Connected to MongoDB Atlas successfully");
      return this.db;
    } catch (error) {
      console.error("❌ MongoDB connection error:", error);
      throw error;
    }
  }

  async getDb() {
    if (!this.db) {
      await this.connect();
    }
    return this.db;
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log("📡 MongoDB connection closed");
    }
  }

  // Get collection helper method
  async getCollection(collectionName) {
    const db = await this.getDb();
    return db.collection(collectionName);
  }
}

// Create singleton instance
const database = new Database();

export default database;
