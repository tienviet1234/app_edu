import { Schema, model, type Document, type Types } from 'mongoose'
import { randomBytes } from 'crypto'

export type ClassStatus = 'upcoming' | 'active' | 'completed' | 'cancelled'

export interface IScheduleSlot {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  startTime: string
  endTime: string
  room?: string
}

export interface IClass extends Document {
  _id: Types.ObjectId
  centerId?: Types.ObjectId
  branchId?: Types.ObjectId
  courseId?: Types.ObjectId
  name: string
  academicYear?: string
  semester?: string
  teacherId?: Types.ObjectId
  // Tên giáo viên hiển thị dạng chữ tự do (VD "Cô Trà") — độc lập với
  // teacherId (liên kết tài khoản thật, do admin gán ở AdminClassesPage).
  // Giáo viên tự sửa tên hiển thị ở màn "Lớp học" dùng field này.
  teacherName?: string
  assistantTeacherIds: Types.ObjectId[]
  studentIds: Types.ObjectId[]
  schedule: IScheduleSlot[]
  startDate?: Date
  endDate?: Date
  maxStudents: number
  status: ClassStatus
  joinCode: string
  // Cấp phiếu chấm điểm — ĐỂ TRỐNG mặc định (tự nhận diện qua số trong TÊN
  // lớp, VD "Lớp 2" → primary, xem autoLevel() ở frontend constants/rubrics.ts)
  // — chỉ đặt giá trị ở đây khi admin CHỦ Ý chọn tay ở ô "Phiếu đánh giá"
  // (màn Lớp học), ghi đè cách tự nhận diện theo tên (hữu ích cho lớp tên
  // không có số, VD "Starters"). Có giá trị ở đây thì LUÔN ưu tiên hơn tên.
  level?: 'primary' | 'secondary'
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
  // Admin tùy chỉnh tiêu chí chấm điểm (RubricEditor) — lưu server-side để mọi
  // giáo viên/thiết bị đăng nhập vào lớp này đều nhận cùng 1 bộ tiêu chí, thay
  // vì chỉ tồn tại trong localStorage của trình duyệt admin đang thao tác.
  hiddenComps?: string[]
  extraComps?: unknown[]
  compOverrides?: Record<string, Record<string, number>>
  compLabelOverrides?: Record<string, Record<string, string>>
  // Admin THÊM mức/phần MỚI vào 1 tiêu chí gốc (giữ nguyên tiêu chí cũ + dữ
  // liệu đã chấm) — khác "Đổi kiểu" (thay hẳn tiêu chí khác). Xem
  // applyCompExtraItems ở frontend src/constants/rubrics.ts.
  compExtraItems?: Record<string, Array<{ id: string; label: string; value: number }>>
  // Câu nhận xét mẫu tự soạn riêng cho lớp này (khác với gợi ý tự sinh từ
  // điểm số) — admin/giáo viên tự thêm/sửa/xóa theo thói quen viết của họ,
  // mọi thay đổi được ghi vào AuditLog (action notePhrase.*) để admin theo
  // dõi lại được ai sửa gì (xem noteController/EntryScreen).
  customNotePhrases?: string[]
  // Đơn giá tính tiền — admin tự nhập theo TỪNG LỚP (không theo "cấp" chung),
  // vì mỗi lớp có thể có mức giá riêng. Học phí = đơn giá/buổi × số buổi học
  // sinh đã học trong tháng. Lương giáo viên có 2 cách tính, chọn theo từng
  // lớp qua teacherPayMode: 'fixed' = đơn giá/buổi cố định (không tính sĩ
  // số); 'perStudent' = đơn giá/học-sinh-có-mặt/buổi (buổi đông thì lương
  // cao hơn, buổi vắng nhiều thì thấp hơn). Xem
  // analyticsController.getBillingReport() — nơi duy nhất tính ra số tiền.
  tuitionPerSession?: number
  teacherPayPerSession?: number
  teacherPayMode?: 'fixed' | 'perStudent'
  teacherPayPerStudentSession?: number
}

const scheduleSlotSchema = new Schema<IScheduleSlot>(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    room: { type: String, trim: true, maxlength: 80 },
  },
  { _id: false },
)

const classSchema = new Schema<IClass>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    academicYear: { type: String, trim: true, maxlength: 20 },
    semester: { type: String, trim: true, maxlength: 40 },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    teacherName: { type: String, trim: true, maxlength: 160 },
    assistantTeacherIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    schedule: [scheduleSlotSchema],
    startDate: { type: Date },
    endDate: { type: Date },
    maxStudents: { type: Number, required: true, min: 1, max: 200, default: 30 },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed', 'cancelled'] as ClassStatus[],
      default: 'active',
      index: true,
    },
    level: { type: String, enum: ['primary', 'secondary'] },
    joinCode: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      default: () => randomBytes(3).toString('hex').toUpperCase(),
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hiddenComps: [{ type: String }],
    extraComps: [{ type: Schema.Types.Mixed }],
    compOverrides: { type: Schema.Types.Mixed },
    compLabelOverrides: { type: Schema.Types.Mixed },
    compExtraItems: { type: Schema.Types.Mixed },
    customNotePhrases: [{ type: String, trim: true, maxlength: 300 }],
    tuitionPerSession: { type: Number, min: 0 },
    teacherPayPerSession: { type: Number, min: 0 },
    teacherPayMode: { type: String, enum: ['fixed', 'perStudent'], default: 'fixed' },
    teacherPayPerStudentSession: { type: Number, min: 0 },
  },
  { timestamps: true },
)

classSchema.index({ centerId: 1, status: 1 })
classSchema.index({ centerId: 1, teacherId: 1 })
classSchema.index({ centerId: 1, studentIds: 1 })
classSchema.index({ name: 'text' })

export const Class = model<IClass>('Class', classSchema)
