import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  phone?: string;
  countryCode?: string;
  dialCode?: string;
  flag?: string;
  role: "Admin" | "BranchManager" | "Employee" | "User";
  status: "Active" | "Inactive";
  branch?: Types.ObjectId;
  permissions: string[]; // Array of permission strings
  admin?: Types.ObjectId; // Admin who created this user
  createdBy?: Types.ObjectId; // Admin who created this user
  refreshToken?: string;
  resetToken?: string;
  resetTokenExpire?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    countryCode: { type: String },
    dialCode: { type: String },
    flag: { type: String },
    role: {
      type: String,
      enum: ["Admin", "BranchManager", "Employee", "User"],
      default: "User",
      required: true
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      required: true
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
    },
    permissions: [{
      type: String,
      enum: [
        // Product permissions
        "products:read", "products:create", "products:update", "products:delete",
        // Category permissions
        "categories:read", "categories:create", "categories:update", "categories:delete",
        // Order permissions
        "orders:read", "orders:create", "orders:update", "orders:delete",
        // User permissions
        "users:read", "users:create", "users:update", "users:delete",
        // Branch permissions
        "branches:read", "branches:create", "branches:update", "branches:delete",
        // Report permissions
        "reports:read", "reports:create", "reports:update", "reports:delete",
        // Admin permissions
        "admin:full_access"
      ]
    }],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    resetToken: {
      type: String,
      default: null,
    },
    resetTokenExpire: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Auto-assign permissions and admin for new Admin users
UserSchema.pre('save', function(next) {
  // Auto-assign permissions based on role
  if (this.isModified('role') || (this.permissions && this.permissions.length === 0)) {
    this.permissions = getPermissionsForRole(this.role);
  }
  
  // For Admin users without an admin field, set admin to self
  if (this.role === "Admin" && !this.admin) {
    this.admin = this._id;
  }
  
  next();
});

function getPermissionsForRole(role: string): string[] {
  switch (role) {
    case "Admin":
      return [
        "admin:full_access",
        "products:read", "products:create", "products:update", "products:delete",
        "categories:read", "categories:create", "categories:update", "categories:delete",
        "orders:read", "orders:create", "orders:update", "orders:delete",
        "users:read", "users:create", "users:update", "users:delete",
        "branches:read", "branches:create", "branches:update", "branches:delete",
        "reports:read", "reports:create", "reports:update", "reports:delete"
      ];

    case "BranchManager":
      return [
        "products:read", "products:create", "products:update", "products:delete",
        "categories:read", "categories:create", "categories:update", "categories:delete",
        "orders:read", "orders:create", "orders:update", "orders:delete",
        "users:read", "users:create", "users:update", "users:delete",
        "branches:read", "branches:update",
        "reports:read"
      ];

    case "Employee":
      return [
        "products:read",
        "categories:read",
        "orders:read", "orders:create", "orders:update",
        "reports:read"
      ];

    case "User":
    default:
      return [
        "products:read",
        "categories:read",
        "orders:read"
      ];
  }
}

export const User = mongoose.model<IUser>("User", UserSchema);