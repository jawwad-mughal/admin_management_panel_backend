import mongoose, { Schema, Document, Types } from "mongoose";

export interface IBranch extends Document {
  name: string;
  code: string;
  address?: string;
  city?: string;
  country?: string;
  phone: string;
  email?: string;
  manager?: Types.ObjectId;
  admin: Types.ObjectId; // Admin who created this branch
  status: "Active" | "Inactive";
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema = new Schema<IBranch>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    address: { type: String },
    city: String,
    country: String,
    phone: { type: String, required: true },
    email: String,
    manager: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// 🔥 IMPORTANT: unique only when isDeleted = false
BranchSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

export default mongoose.model<IBranch>("Branch", BranchSchema);