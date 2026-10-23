import { makeStorage } from '@/utils/storage'
import { quickHash } from '@/utils/clientSnapshot'
import { normalize } from '@/business/seed'
import { countUnsaved } from '@/business/sync'
import { backupsToDelete } from '@/business/backupRetention'

/** Bản sao lưu nằm NGAY TRÊN MÁY (IndexedDB — kho riêng của trình duyệt, tách
 *  khỏi localStorage nơi app giữ dữ liệu). Lớp an toàn khi KHÔNG lên được
 *  server: mất mạng, server lỗi, lưu bị từ chối — bản chụp gửi server (utils/
 *  clientSnapshot.ts) cũng cần mạng. Nếu sau đó dữ liệu chính trên máy bị ghi
 *  đè/xóa (tab cũ, xóa nhầm buổi, "Xóa toàn bộ", lỗi app...) vẫn còn bản ở
 *  đây để khôi phục.
 *
 *  CHỈ ĐỌC localStorage, không bao giờ ghi/sửa dữ liệu của app; lỗi (trình duyệt
 *  chặn, đầy bộ nhớ) im lặng bỏ qua — không chặn việc gì. Không chống được
 *  việc người dùng tự "xóa dữ liệu duyệt web" hay mất máy (kho này mất theo) —
 *  2 trường hợp đó do bản chụp gửi server lo. */

const DB_NAME = 'lms-local-backup'
const META = 'meta'
const BODY = 'body'
const CHECK_MS = 30_000
const MIN_GAP_MS = 60_000
const FIRST_DELAY_MS = 3_000

export interface LocalBackupMeta {
  id: number
  userId: string
  at: number
  reason: string
  hash: string
  size: number
  sessions: number
  unsaved: number
}
interface LocalBackupBody { id: number; gz: boolean; data: ArrayBuffer | string }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id', autoIncrement: true }).createIndex('userId', 'userId')
      if (!db.objectStoreNames.contains(BODY)) db.createObjectStore(BODY, { keyPath: 'id' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

const done = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
const committed = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error) })

// Nén gzip (dữ liệu JSON nhỏ đi ~10 lần); trình duyệt cũ không có thì lưu nguyên văn.
async function pack(raw: string): Promise<{ gz: boolean; data: ArrayBuffer | string }> {
  if (typeof CompressionStream === 'undefined') return { gz: false, data: raw }
  try {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))
    return { gz: true, data: await new Response(stream).arrayBuffer() }
  } catch {
    return { gz: false, data: raw }
  }
}
async function unpack(b: LocalBackupBody): Promise<string> {
  if (!b.gz) return b.data as string
  const stream = new Blob([b.data as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

async function metasOf(db: IDBDatabase, userId: string): Promise<LocalBackupMeta[]> {
  const tx = db.transaction(META, 'readonly')
  return done(tx.objectStore(META).index('userId').getAll(userId) as IDBRequest<LocalBackupMeta[]>)
}

/** Lưu 1 bản (bỏ qua nếu y hệt bản mới nhất của tài khoản này), rồi dọn bản cũ
 *  thưa dần (business/backupRetention.ts). */
export async function saveLocalBackup(userId: string, raw: string, reason: string): Promise<'saved' | 'same' | 'failed'> {
  try {
    const hash = quickHash(raw)
    const db = await openDb()
    try {
      const metas = await metasOf(db, userId)
      const newest = metas.reduce<LocalBackupMeta | null>((m, x) => (!m || x.at > m.at ? x : m), null)
      if (newest?.hash === hash) return 'same'
      let stats = { sessions: 0, unsaved: 0 }
      try { stats = countUnsaved(normalize(JSON.parse(raw))) } catch { /* vẫn lưu nguyên văn */ }
      const body = await pack(raw)
      const meta: Omit<LocalBackupMeta, 'id'> = { userId, at: Date.now(), reason, hash, size: raw.length, ...stats }
      // Mô tả + nội dung ghi trong CÙNG 1 lượt ghi, không chờ gì ở giữa (trình
      // duyệt cũ tự đóng lượt ghi khi gặp lệnh chờ → mất nửa sau).
      const tx = db.transaction([META, BODY], 'readwrite')
      const addReq = tx.objectStore(META).add(meta)
      let id = 0
      addReq.onsuccess = () => {
        id = addReq.result as number
        tx.objectStore(BODY).put({ id, ...body })
      }
      await committed(tx)
      const old = backupsToDelete([...metas, { ...meta, id }])
      if (old.length) {
        const del = db.transaction([META, BODY], 'readwrite')
        for (const o of old) { del.objectStore(META).delete(o.id); del.objectStore(BODY).delete(o.id) }
        await committed(del)
      }
      return 'saved'
    } finally {
      db.close()
    }
  } catch (err) {
    console.warn('Sao lưu trên máy chưa lưu được:', err)
    return 'failed'
  }
}

/** Danh sách bản sao lưu trên máy của 1 tài khoản, mới nhất trước. */
export async function listLocalBackups(userId: string): Promise<LocalBackupMeta[]> {
  const db = await openDb()
  try {
    return (await metasOf(db, userId)).sort((a, b) => b.at - a.at)
  } finally {
    db.close()
  }
}

/** Nội dung nguyên văn (chuỗi JSON đúng như trong localStorage lúc chụp). */
export async function readLocalBackup(id: number): Promise<string> {
  const db = await openDb()
  try {
    const b = await done(db.transaction(BODY, 'readonly').objectStore(BODY).get(id) as IDBRequest<LocalBackupBody | undefined>)
    if (!b) throw new Error('Không còn bản sao lưu này trên máy.')
    return unpack(b)
  } finally {
    db.close()
  }
}

/** Chụp NGAY bản hiện tại trước khi bị thay toàn bộ ("Xóa toàn bộ", "Nhập lại
 *  từ file") — chuỗi được đọc đồng bộ trước khi bị ghi đè, phần lưu chạy sau. */
export function backupBeforeReplace(userId: string | undefined, reason: string): void {
  if (!userId) return
  const raw = makeStorage(userId).get()
  if (raw) void saveLocalBackup(userId, raw, reason)
}

export function startLocalBackupLoop(userId: string): () => void {
  if (typeof indexedDB === 'undefined') return () => {}
  let lastHash = ''
  let lastAt = 0
  let busy = false
  let stopped = false

  const tick = async (now = false) => {
    if (stopped || busy) return
    if (!now && Date.now() - lastAt < MIN_GAP_MS) return
    const raw = makeStorage(userId).get()
    if (!raw) return
    const h = quickHash(raw)
    if (h === lastHash) return
    busy = true
    try {
      // Lỗi → giữ nguyên mốc, lượt sau (30 giây) thử lại.
      if (await saveLocalBackup(userId, raw, lastHash ? 'tự động' : 'mở app') !== 'failed') {
        lastHash = h
        lastAt = Date.now()
      }
    } finally {
      busy = false
    }
  }

  const first = setTimeout(() => void tick(true), FIRST_DELAY_MS)
  const timer = setInterval(() => void tick(), CHECK_MS)
  const onHide = () => { if (document.visibilityState === 'hidden') void tick(true) }
  document.addEventListener('visibilitychange', onHide)
  return () => {
    stopped = true
    clearTimeout(first)
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onHide)
  }
}
