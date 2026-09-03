import { EventEmitter } from 'node:events'
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js'
import { app } from 'electron'
import { join } from 'node:path'
import type { WaStatus } from './types'
import { resolveBrowser } from './browser'

export class WhatsAppService extends EventEmitter {
  status: WaStatus = { state: 'idle' }; private client?: Client
  private set(status: WaStatus) { this.status = status; this.emit('status', status) }
  async connect(chromePath?: string) {
    if (this.client) return
    this.set({ state: 'launching', message: 'Opening WhatsApp Web…' })
    try {
      const executablePath = resolveBrowser(chromePath)
      this.client = new Client({ authStrategy: new LocalAuth({ clientId: 'primary', dataPath: join(app.getPath('userData'), 'sessions') }), puppeteer: { headless: true, executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] } })
      this.client.on('qr', qr => { this.set({ state: 'qr', message: 'Scan this QR code with WhatsApp' }); this.emit('qr', qr) })
      this.client.on('authenticated', () => this.set({ state: 'authenticated', message: 'Authenticated. Loading…' }))
      this.client.on('ready', () => { const info = this.client?.info; this.set({ state: 'ready', me: info ? { name: info.pushname || 'WhatsApp user', number: info.wid.user } : undefined }) })
      this.client.on('auth_failure', message => this.set({ state: 'auth_failure', message }))
      this.client.on('disconnected', reason => { this.client = undefined; this.set({ state: 'disconnected', message: String(reason) }) })
      await this.client.initialize()
    } catch (error) { try { await this.client?.destroy() } catch { /* launch did not complete */ }; this.client = undefined; this.set({ state: 'error', message: error instanceof Error ? error.message : String(error) }) }
  }
  async logout() { if (this.client) { try { await this.client.logout(); await this.client.destroy() } catch { /* already unavailable */ } }; this.client = undefined; this.set({ state: 'idle' }) }
  async disconnect() { if (this.client) { try { await this.client.destroy() } catch { /* browser already closed */ } }; this.client = undefined }
  async getGroups() {
    if (!this.client || this.status.state !== 'ready' || !this.client.pupPage) throw new Error('Connect WhatsApp before loading its groups.')
    try {
      // Avoid Client.getChats(): current WhatsApp Web sometimes fails while it serializes every
      // chat. We only read the small fields needed for group selection directly from its cache.
      return await this.client.pupPage.evaluate(() => {
        const page = globalThis as any
        const chats = page.require('WAWebCollections').Chat.getModelsArray()
        return chats.filter((chat: any) => typeof chat.id?.isGroup === 'function' && chat.id.isGroup()).map((chat: any) => ({ id: chat.id._serialized || chat.id.toString(), name: chat.name || chat.formattedTitle || 'Unnamed WhatsApp group' }))
      })
    } catch (error) { throw new Error(`WhatsApp could not load its groups. Try opening WhatsApp Web once, then retry. (${error instanceof Error ? error.message : String(error)})`) }
  }
  async send(phone: string, message: string, mediaPaths: string[] = []) { if (!this.client || this.status.state !== 'ready') throw new Error('WhatsApp is not connected'); const id = await this.client.getNumberId(phone); if (!id) throw new Error('This number is not registered on WhatsApp'); try { if (mediaPaths.length) { for (let i = 0; i < mediaPaths.length; i++) await this.client.sendMessage(id._serialized, MessageMedia.fromFilePath(mediaPaths[i]), { caption: i === 0 ? message || undefined : undefined }); } else await this.client.sendMessage(id._serialized, message) } catch (error) { const text = error instanceof Error ? error.message : String(error); if (text.includes('Promise was collected')) return; throw error } }
  async sendGroup(chatId: string, message: string, mediaPaths: string[] = []) { if (!this.client || this.status.state !== 'ready') throw new Error('WhatsApp is not connected'); try { if (mediaPaths.length) { for (let i = 0; i < mediaPaths.length; i++) await this.client.sendMessage(chatId, MessageMedia.fromFilePath(mediaPaths[i]), { caption: i === 0 ? message || undefined : undefined }); } else await this.client.sendMessage(chatId, message) } catch (error) { const text = error instanceof Error ? error.message : String(error); if (text.includes('Promise was collected')) return; throw error } }
}
