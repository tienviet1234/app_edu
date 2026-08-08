import { Schema, model, type Document, type Types } from 'mongoose'
import bcrypt from 'bcryptjs'

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent'

export interface IUser extends Document {
  _id: Types.ObjectId
  name: string
  email: string
  passwordHash: string
  role: UserRole
  avatar?: string
  phone?: string
  centerId?: Types.ObjectId
  branchId?: Types.ObjectId
  childIds: Types.ObjectId[]
  isActive: boolean
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
  // Methods
  comparePassword(plain: string): Promise<boolean>
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String, required: true, unique: true,
      lowercase: true, trim: true, maxlength: 200,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student', 'parent'] as UserRole[],
      default: 'teacher',
    },
    avatar: { type: String },
    phone: { type: String, trim: true, maxlength: 20 },
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    childIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next()
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12)
  next()
})

userSchema.methods.comparePassword = function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.passwordHash)
}

// Never return passwordHash in JSON
userSchema.set('toJSON', {
  transform(_, ret) {
    const json = ret as Partial<IUser>
    delete json.passwordHash
    return ret
  },
})

export const User = model<IUser>('User', userSchema)
