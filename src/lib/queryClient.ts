import { QueryClient } from '@tanstack/react-query'

/** Instance dùng chung toàn app — tách riêng file này (thay vì khai báo
 *  thẳng trong main.tsx) để authStore.ts gọi được queryClient.clear() khi
 *  đăng xuất mà không tạo import vòng (main.tsx → AppRouter → ... → authStore). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})
