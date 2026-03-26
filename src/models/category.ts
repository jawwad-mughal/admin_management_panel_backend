import mongoose, { Schema, Document, Model, Types } from "mongoose"

/* ✅ Interface inside model */

export interface ICategory extends Document {
  name: string
  description: string
  status: "Active" | "Inactive"
  branch: Types.ObjectId; // Branch this category belongs to
  admin: Types.ObjectId; // Admin who created this category
  createdAt: Date
  updatedAt: Date
}

/* ✅ Schema */

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true
    },
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
  },
  {
    timestamps: true,
  }
)

// Compound index to ensure unique category names within a branch
categorySchema.index({ name: 1, branch: 1 }, { unique: true });

/* ✅ Model */

const Category: Model<ICategory> = mongoose.model<ICategory>(
  "Category",
  categorySchema
)

export default Category