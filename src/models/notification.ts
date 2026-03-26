import mongoose, { Schema, Document, Types } from "mongoose";

export interface INotification extends Document {
  title: string;
  message: string;
  type: string;
  recipientRoles: string[];
  branch?: Types.ObjectId;
  admin: Types.ObjectId; // Admin who created this notification
  data?: any;
  readBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, required: true },
    recipientRoles: {
      type: [String],
      default: ["Admin", "BranchManager", "Employee"],
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<INotification>("Notification", NotificationSchema);
