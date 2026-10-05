import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";

export interface AdminSession {
  adminId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export type AdminSessionDocument = HydratedDocument<AdminSession>;

const adminSessionSchema = new Schema<AdminSession>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdminSessionModel: Model<AdminSession> =
  (mongoose.models.AdminSession as Model<AdminSession> | undefined) ??
  mongoose.model<AdminSession>("AdminSession", adminSessionSchema);
