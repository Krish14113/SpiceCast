export type Contact = { id: string; name: string; phone: string; rawPhone: string; groupIds: string[]; notes?: string; createdAt: string; updatedAt: string }
export type Group = { id: string; name: string; createdAt: string }
export type Settings = { minDelaySec: number; maxDelaySec: number; defaultCountry: string; chromePath?: string; verifyNumbers: boolean }
export type Campaign = { id: string; startedAt: string; finishedAt?: string; senderName?: string; senderNumber?: string; messagePreview: string; hasMedia?: boolean; mediaName?: string; targetGroupNames: string[]; total: number; sent: number; failed: number; status: 'running' | 'completed' | 'stopped' }
export type MessageLog = { campaignId: string; at: string; contactId: string; name: string; phone: string; status: 'sent' | 'failed'; error?: string }
export type Data = { version: 1; contacts: Contact[]; groups: Group[]; settings: Settings }
export type WaStatus = { state: 'idle' | 'launching' | 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'auth_failure' | 'error'; message?: string; me?: { name: string; number: string } }
export const defaults: Data = { version: 1, contacts: [], groups: [], settings: { minDelaySec: 8, maxDelaySec: 20, defaultCountry: 'AE', verifyNumbers: true } }
