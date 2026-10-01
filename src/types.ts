export type Role = 'admin' | 'viewer';
export type Channel = 'retail' | 'wholesale';
export interface User { id: string; email: string; username?: string; name?: string; role: Role }
export type AccountStatus = 'pending' | 'active' | 'disabled';
export interface ManagedUser { id: string; username: string; name: string; email: string; role: Role | null; status: AccountStatus; createdAt: string | null; lastSignInAt: string | null }
export interface Category { code: string; name: string; parentCode: string; folder?: string; active?: boolean }
export interface Brand { code: string; name: string; aliases?: string[]; active?: boolean }
export interface Settings { schemaVersion: number; categories: Record<Channel, Category[]>; brands: Brand[]; folders: string[]; [key: string]: unknown }
export interface ImageValidation { status: 'unchecked' | 'checking' | 'valid' | 'error' | 'timeout'; url?: string; width?: number; height?: number; checkedAt?: string }
export interface DetailImage { id?: string; folder: string; filename: string; linkEnabled?: boolean; linkUrl?: string; validation?: ImageValidation; [key: string]: unknown }
export interface Generator { brand: string; product: string; folder: string; extension: string; count: number; brandManual?: boolean; productManual?: boolean }
export interface Automation { schemaVersion: number; categoryCodes: Record<Channel, string>; origin: string; detailImages: DetailImage[]; detailHtml?: string; generator: Generator; thumbnail?: { path?: string; url?: string; deletedAt?: string; originalName?: string; mimeType?: string; size?: number }; naverNameMode?: string; [key: string]: unknown }
export interface Product { id: string; list_id: string; seq: number; brand: string; name_own: string; name_naver: string; model: string; content: string; image_usage: string; need_retail: string; need_wholesale: string; need_naver: string; price_retail_regular: number | null; price_retail: number | null; price_wholesale: number | null; price_wholesale_master: number | null; price_naver: number | null; image_url: string; ref_link: string; note: string; automation: Automation; done: boolean; done_at: string | null; created_at?: string; updated_at?: string; [key: string]: unknown }
export interface ProductList { id: string; title: string; author: string; work_date: string; note?: string; created_at: string; updated_at?: string; total?: number; doneCount?: number; retailSuccess?: number; wholesaleSuccess?: number; retailTotal?: number; wholesaleTotal?: number; runningCount?: number; failedCount?: number }
export interface Registration { item_id: string; channel: Channel; status: 'pending' | 'running' | 'success' | 'failed'; goods_no?: string; error_message?: string; warnings?: string[]; attempted_at?: string }
export interface RunnerJob { id: string; listId: string; state: 'idle' | 'running' | 'waiting_login' | 'waiting_review' | 'stopping' | 'completed' | 'failed' | 'needs_review' | 'stopped'; current: number; total: number; logs: {time: string; message: string}[]; error?: string; message?: string; dryRun?: boolean; stopped?: boolean }
export interface RunnerStatus { connected: boolean; job?: RunnerJob; runnerVersion?: string; capabilities?: string[] }
