import { EventEmitter } from 'node:events'
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js'
import { app } from 'electron'
import { join } from 'node:path'
import type { WaStatus } from './types'
import { resolveBrowser } from './browser'

export class WhatsAppService extends EventEmitter {
  status: WaStatus = { state: 'idle' }; private client?: Client; private connecting?: Promise<void>; private restarting?: Promise<void>; private chromePath?: string
  constructor(private readonly accountId = 'primary') { super() }
  private set(status: WaStatus) { this.status = status; this.emit('status', status) }
  async connect(chromePath?: string) {
    if (chromePath) this.chromePath = chromePath
    if (this.client) return
    if (this.connecting) return this.connecting
    this.connecting = this.createClient()
    try { await this.connecting } finally { this.connecting = undefined }
  }
  private async createClient() {
    this.set({ state: 'launching', message: 'Opening WhatsApp Web…' })
    let client: Client | undefined
    try {
      const executablePath = resolveBrowser(this.chromePath)
      client = new Client({ authStrategy: new LocalAuth({ clientId: this.accountId, dataPath: join(app.getPath('userData'), 'sessions') }), puppeteer: { headless: true, executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] } })
      this.client = client
      client.on('qr', qr => { if (this.client === client) { this.set({ state: 'qr', message: 'Scan this QR code with WhatsApp' }); this.emit('qr', qr) } })
      client.on('authenticated', () => { if (this.client === client) this.set({ state: 'authenticated', message: 'Authenticated. Loading…' }) })
      client.on('ready', () => { const activeClient = client; if (activeClient && this.client === activeClient) { const info = activeClient.info; this.set({ state: 'ready', me: info ? { name: info.pushname || 'WhatsApp user', number: info.wid.user } : undefined }) } })
      client.on('auth_failure', message => { if (this.client === client) this.set({ state: 'auth_failure', message }) })
      client.on('disconnected', reason => { if (this.client === client) { this.client = undefined; this.set({ state: 'disconnected', message: String(reason) }) } })
      await client.initialize()
    } catch (error) { try { await client?.destroy() } catch { /* launch did not complete */ }; if (this.client === client) this.client = undefined; this.set({ state: 'error', message: error instanceof Error ? error.message : String(error) }); throw error }
  }
  private async waitUntilReady(timeoutMs = 45000) {
    if (this.status.state === 'ready' && this.client) return
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('WhatsApp did not reconnect in time.')), timeoutMs)
      const onStatus = (status: WaStatus) => {
        if (status.state === 'ready') finish()
        if (status.state === 'qr') finish(new Error('WhatsApp needs to be linked again. Open Connect and scan the QR code.'))
        if (status.state === 'auth_failure' || status.state === 'error') finish(new Error(status.message || 'WhatsApp could not reconnect.'))
      }
      const finish = (error?: Error) => { clearTimeout(timeout); this.off('status', onStatus); error ? reject(error) : resolve() }
      this.on('status', onStatus)
    })
  }
  isStaleSessionError(error: unknown) { const text = error instanceof Error ? error.message : String(error); return /detached frame|target closed|session closed|execution context was destroyed|protocol error/i.test(text) }
  async recover() {
    if (this.restarting) return this.restarting
    this.restarting = (async () => {
      const oldClient = this.client
      this.client = undefined
      this.set({ state: 'launching', message: 'Reconnecting WhatsApp Web…' })
      try { await oldClient?.destroy() } catch { /* its browser frame is already unavailable */ }
      await this.connect(this.chromePath)
      await this.waitUntilReady()
    })()
    try { await this.restarting } finally { this.restarting = undefined }
  }
  async logout() { if (this.client) { try { await this.client.logout(); await this.client.destroy() } catch { /* already unavailable */ } }; this.client = undefined; this.set({ state: 'idle' }) }
  async disconnect() { if (this.client) { try { await this.client.destroy() } catch { /* browser already closed */ } }; this.client = undefined }
  private async readGroups() {
    if (!this.client || this.status.state !== 'ready' || !this.client.pupPage) throw new Error('Connect WhatsApp before loading its groups.')
    // Avoid Client.getChats(): current WhatsApp Web sometimes fails while it serializes every
    // chat. We only read the small fields needed for group selection directly from its cache.
    return this.client.pupPage.evaluate(() => {
      const page = globalThis as any
      const chats = page.require('WAWebCollections').Chat.getModelsArray()
      return chats.filter((chat: any) => typeof chat.id?.isGroup === 'function' && chat.id.isGroup()).map((chat: any) => ({ id: chat.id._serialized || chat.id.toString(), name: chat.name || chat.formattedTitle || 'Unnamed WhatsApp group' }))
    })
  }
  async getGroups() {
    try { return await this.readGroups() } catch (error) {
      if (this.isStaleSessionError(error)) { await this.recover(); return this.readGroups() }
      throw new Error(`WhatsApp could not load its groups. Try again after it reconnects. (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  async send(phone: string, message: string, mediaPaths: string[] = []) { if (!this.client || this.status.state !== 'ready') throw new Error('WhatsApp is not connected'); const id = await this.client.getNumberId(phone); if (!id) throw new Error('This number is not registered on WhatsApp'); try { if (mediaPaths.length) { for (let i = 0; i < mediaPaths.length; i++) await this.client.sendMessage(id._serialized, MessageMedia.fromFilePath(mediaPaths[i]), { caption: i === 0 ? message || undefined : undefined }); } else await this.client.sendMessage(id._serialized, message) } catch (error) { const text = error instanceof Error ? error.message : String(error); if (text.includes('Promise was collected')) return; throw error } }
  async sendGroup(chatId: string, message: string, mediaPaths: string[] = []) { if (!this.client || this.status.state !== 'ready') throw new Error('WhatsApp is not connected'); try { if (mediaPaths.length) { for (let i = 0; i < mediaPaths.length; i++) await this.client.sendMessage(chatId, MessageMedia.fromFilePath(mediaPaths[i]), { caption: i === 0 ? message || undefined : undefined }); } else await this.client.sendMessage(chatId, message) } catch (error) { const text = error instanceof Error ? error.message : String(error); if (text.includes('Promise was collected')) return; throw error } }
}
