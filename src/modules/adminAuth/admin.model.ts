import mongoose, { type HydratedDocument, type Model, Schema } from "mongoose";

export interface Admin {
  email: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminDocument = HydratedDocument<Admin>;

const adminSchema = new Schema<Admin>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_document, serialized: Record<string, unknown>) => {
        delete serialized.passwordHash;
        return serialized;
      }
    }
  }
);

export const AdminModel: Model<Admin> =
  (mongoose.models.Admin as Model<Admin> | undefined) ?? mongoose.model<Admin>("Admin", adminSchema);
