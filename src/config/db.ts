import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI!;

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected ✅");
  } catch (err) {
    console.log("MongoDB Connection Failed ❌")
    console.error("MongoDB Connection Failed ❌", err);
    process.exit(1);
  }
};