import express from "express";
import * as dotenv from "dotenv";
import { connectDB } from "./config/db";
import authRoutes from "./routes/authRoutes";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/userRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import productRoutes from "./routes/productRoutes";
import orderRoutes from "./routes/orderRoutes";
import branchRoutes from "./routes/branchRoutes";
import reportRoutes from "./routes/reportRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import { errorHandler } from "./middleware/errorHandler";

dotenv.config();
connectDB();

const app = express();

app.use(express.json());
app.use(cookieParser());

// ✅ CORS setup for localhost + frontend
const allowedOrigins = [
  process.env.FRONTEND_URL, 
  process.env.LOCALHOST_URL
];

app.use(
  cors({
    origin: function(origin, callback) {
      if (!origin) return callback(null, true); // Postman or server-to-server
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // cookies allow
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check
app.get("/", (req, res) => res.send("API Running"));
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

// Error handler
app.use(errorHandler);

// ✅ Vercel export
export default function handler(req: any, res: any) {
  return app(req, res);
}