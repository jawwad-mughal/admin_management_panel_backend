import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProduct extends Document {
  name: string;
  category: Types.ObjectId;
  price: number;
  stock: number;
  status: "Active" | "Inactive";
  image?: string;
  branch: Types.ObjectId; // Branch this product belongs to
  admin: Types.ObjectId; // Admin who created this product
  createdAt: Date;
  updatedAt: Date;
}

const productSchema: Schema<IProduct> = new Schema(
  {
    name: { type: String, required: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true
    },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    image: { type: String },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: false
    },
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>("Product", productSchema);