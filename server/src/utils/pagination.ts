import type { FilterQuery, Model, SortOrder } from 'mongoose'

export interface PaginationInput {
  page?: string | number
  limit?: string | number
  sort?: string
  order?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
}

export function parsePagination(input: PaginationInput) {
  const page = clampNumber(input.page, 1, 1, 10_000)
  const limit = clampNumber(input.limit, 20, 1, 100)
  const sortField = typeof input.sort === 'string' && input.sort.trim() ? input.sort.trim() : 'createdAt'
  const sortOrder: SortOrder = input.order === 'asc' ? 1 : -1

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sort: { [sortField]: sortOrder } as Record<string, SortOrder>,
  }
}

export async function paginate<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  input: PaginationInput,
): Promise<PaginatedResult<T>> {
  const { page, limit, skip, sort } = parsePagination(input)
  const [items, total] = await Promise.all([
    model.find(filter).sort(sort).skip(skip).limit(limit).lean<T[]>(),
    model.countDocuments(filter),
  ])

  return {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

function clampNumber(value: string | number | undefined, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}
