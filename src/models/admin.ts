import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
  name: string;
  email: string;
  password: string;
  countryCode: string;
  dialCode: string;
  flag: string;
  phone: string;
  role: "Admin";
  permissions: string[];
  refreshToken?: string;
  resetToken?: string;
  resetTokenExpire?: Date;
}

const adminSchema: Schema<IAdmin> = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    countryCode: { type: String, required: true },
    dialCode: { type: String, required: true },
    flag: { type: String, required: true },
    phone: { type: String, required: true },
    role: { type: String, enum: ["Admin"], default: "Admin", required: true },
    permissions: [{
      type: String,
      enum: [
        "admin:full_access",
        "products:read", "products:create", "products:update", "products:delete",
        "categories:read", "categories:create", "categories:update", "categories:delete",
        "orders:read", "orders:create", "orders:update", "orders:delete",
        "users:read", "users:create", "users:update", "users:delete",
        "branches:read", "branches:create", "branches:update", "branches:delete",
        "reports:read", "reports:create", "reports:update", "reports:delete"
      ],
      default: "admin:full_access"
    }],
    refreshToken: String,
    resetToken: String,
    resetTokenExpire: Date,
  },
  { timestamps: true }
);

export const Admin = mongoose.model<IAdmin>("Admin", adminSchema);