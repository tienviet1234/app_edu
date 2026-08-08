import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

const STORAGE_KEY = 'lms:data:v5'

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif', padding: '2rem', background: '#F8FAFC',
        }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '.5rem', color: '#0F172A' }}>
              Có lỗi xảy ra
            </div>
            <div style={{ color: '#64748B', fontSize: '.82rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              {this.state.error.message}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => { localStorage.removeItem(STORAGE_KEY); window.location.reload() }}
                style={{
                  padding: '8px 16px', background: '#EF4444', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '.82rem',
                }}
              >
                Xóa cache &amp; tải lại
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 16px', background: '#3B82F6', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '.82rem',
                }}
              >
                Tải lại
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
