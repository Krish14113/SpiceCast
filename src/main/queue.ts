import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { appendCampaign, appendMessage } from './store'
import type { Campaign, Contact, Settings } from './types'
import { WhatsAppService } from './whatsapp'
export type SendTarget = Contact | { id: string; name: string; chatId: string }

export type JobState = { running: boolean; paused: boolean; campaign?: Campaign; current?: string; countdown?: number; etaSeconds?: number }
export class SendQueue extends EventEmitter {
  state: JobState = { running: false, paused: false }; private stopped = false; private resume?: () => void; private averageDelaySeconds = 0
  private publish() {
    const campaign = this.state.campaign
    if (this.state.running && campaign) {
      const remaining = Math.max(0, campaign.total - campaign.sent - campaign.failed)
      const nextDelay = this.state.countdown || 0
      const laterDelays = Math.max(0, remaining - (this.state.countdown ? 1 : 1)) * this.averageDelaySeconds
      this.state.etaSeconds = Math.max(0, Math.round(nextDelay + laterDelays))
    }
    this.emit('progress', this.state)
  }
  pause() { if (this.state.running) { this.state.paused = true; this.publish() } }
  resumeJob() { this.state.paused = false; this.resume?.(); this.resume = undefined; this.publish() }
  stop() { this.stopped = true; this.resumeJob() }
  private async wait() { if (!this.state.paused) return; await new Promise<void>(resolve => this.resume = resolve) }
  async start(contacts: SendTarget[], message: string, groups: string[], settings: Settings, wa: WhatsAppService, mediaPaths: string[] = []) {
    if (this.state.running) throw new Error('A process is already running')
    if (wa.status.state !== 'ready') throw new Error('Connect WhatsApp before sending.')
    this.stopped = false; this.averageDelaySeconds = Math.max(0, (settings.minDelaySec + settings.maxDelaySec) / 2); const campaign: Campaign = { id: randomUUID(), startedAt: new Date().toISOString(), messagePreview: message.slice(0, 140), message, hasMedia: Boolean(mediaPaths.length), mediaName: mediaPaths.map(path => path.split(/[\\/]/).pop()).join(', '), targetGroupNames: groups, total: contacts.length, sent: 0, failed: 0, status: 'running' }
    this.state = { running: true, paused: false, campaign }; this.publish()
    for (let i = 0; i < contacts.length && !this.stopped; i++) {
      await this.wait(); if (this.stopped) break
      const contact = contacts[i]; this.state.current = contact.name; this.state.countdown = undefined; this.publish()
      let status: 'sent' | 'failed' = 'sent', error: string | undefined
      const deliver = () => 'chatId' in contact ? wa.sendGroup(contact.chatId, message, mediaPaths) : wa.send(contact.phone, message, mediaPaths)
      try { await deliver() } catch (e) {
        if (wa.isStaleSessionError(e)) {
          try { this.state.current = 'Reconnecting WhatsApp…'; this.publish(); await wa.recover(); if (!this.stopped) { this.state.current = contact.name; this.publish(); await deliver() } } catch (retryError) { status = 'failed'; error = retryError instanceof Error ? retryError.message : String(retryError) }
        } else { status = 'failed'; error = e instanceof Error ? e.message : String(e) }
      }
      if (status === 'sent') campaign.sent++; else campaign.failed++
      await appendMessage({ campaignId: campaign.id, at: new Date().toISOString(), contactId: contact.id, name: contact.name, phone: 'chatId' in contact ? contact.chatId : contact.phone, status, error }); this.publish()
      if (i < contacts.length - 1 && !this.stopped) for (let remaining = Math.max(0, Math.round(settings.minDelaySec + Math.random() * Math.max(0, settings.maxDelaySec - settings.minDelaySec))); remaining > 0 && !this.stopped; remaining--) { await this.wait(); this.state.countdown = remaining; this.publish(); await new Promise(r => setTimeout(r, 1000)) }
    }
    campaign.status = this.stopped ? 'stopped' : 'completed'; campaign.finishedAt = new Date().toISOString(); await appendCampaign(campaign); this.state = { running: false, paused: false, campaign }; this.publish()
  }
}
