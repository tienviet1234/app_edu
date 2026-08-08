import type { CSSProperties } from 'react'
import { C } from '@/constants/colors'

export const inputCls = 'w-full rounded-xl px-4 py-3 text-sm transition placeholder:text-gray-400'

export const inputStyle = (hasError?: boolean): CSSProperties => ({
  border: `1.5px solid ${hasError ? C.red : C.line}`,
  background: '#fff',
  color: C.ink,
  outline: 'none',
})
