import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Papa from 'papaparse'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { getData, loadData, readCampaigns, readMessages, resetData, scheduleSave } from './store'
import { WhatsAppService } from './whatsapp'
import { SendQueue } from './queue'
import type { Contact, Group, Settings } from './types'

let win: BrowserWindow | undefined
const wa = new WhatsAppService(), queue = new SendQueue()
const send = (channel: string, value: unknown) => win?.webContents.send(channel, value)
wa.on('status', value => send('wa:status', value)); wa.on('qr', value => send('wa:qr', value)); queue.on('progress', value => send('send:progress', value))
function createWindow() { win = new BrowserWindow({ width: 1280, height: 800, minWidth: 980, minHeight: 650, webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false } }); win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL); else win.loadFile(join(__dirname, '../renderer/index.html')) }
const asContact = (input: Partial<Contact>, country?: string): Contact => { const rawPhone = String(input.rawPhone || input.phone || '').trim(); const parsed = parsePhoneNumberFromString(rawPhone, country as never); return { id: input.id || randomUUID(), name: String(input.name || '').trim(), phone: parsed?.isValid() ? parsed.number.replace(/^\+/, '') : '', rawPhone, groupIds: input.groupIds || [], notes: input.notes, createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() } }
function registerIpc() {
  ipcMain.handle('data:get', () => getData())
  ipcMain.handle('contacts:save', (_, input: Partial<Contact>) => { const contact = asContact(input); if (!contact.name || !contact.phone) throw new Error('Enter a name and a valid phone number with its country prefix (for example +91…).'); const all = getData().contacts; const i = all.findIndex(c => c.id === contact.id); if (i < 0 && all.some(c => c.phone === contact.phone)) throw new Error('This phone number is already in your contacts.'); i < 0 ? all.push(contact) : all[i] = contact; scheduleSave(); return contact })
  ipcMain.handle('contacts:delete', (_, ids: string[]) => { getData().contacts = getData().contacts.filter(c => !ids.includes(c.id)); scheduleSave() })
  ipcMain.handle('groups:save', (_, group: Partial<Group>) => { const item: Group = { id: group.id || randomUUID(), name: String(group.name || '').trim(), createdAt: group.createdAt || new Date().toISOString() }; if (!item.name) throw new Error('Group name is required'); const all = getData().groups, i = all.findIndex(g => g.id === item.id); i < 0 ? all.push(item) : all[i] = item; scheduleSave(); return item })
  ipcMain.handle('groups:delete', (_, groupId: string) => { const list = getData().groups.find(g => g.id === groupId); if (!list) throw new Error('List was not found.'); getData().groups = getData().groups.filter(g => g.id !== groupId); getData().contacts.forEach(c => { c.groupIds = c.groupIds.filter(id => id !== groupId) }); scheduleSave(); return list.name })
  ipcMain.handle('contacts:assignGroup', (_, ids: string[], groupId: string) => { getData().contacts.forEach(c => { if (ids.includes(c.id) && !c.groupIds.includes(groupId)) c.groupIds.push(groupId) }); scheduleSave() })
  ipcMain.handle('contacts:removeGroup', (_, contactId: string, groupId: string) => { const contact = getData().contacts.find(c => c.id === contactId); if (!contact) throw new Error('Contact was not found.'); contact.groupIds = contact.groupIds.filter(id => id !== groupId); contact.updatedAt = new Date().toISOString(); scheduleSave() })
  ipcMain.handle('settings:save', (_, patch: Partial<Settings>) => { getData().settings = { ...getData().settings, ...patch }; scheduleSave(); return getData().settings })
  ipcMain.handle('csv:parse', (_, text: string) => {
    const rows = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: h => h.toLowerCase().trim() }).data
    const data = getData()
    // Google Contacts exports use "Phone 1 - Value" / "Phone 2 - Value" rather than a single phone column.
    // Infer a sensible fallback country from international numbers in the file so local-format rows import too.
    const countryCounts = new Map<string, number>()
    for (const row of rows) for (const [key, value] of Object.entries(row)) if (/^phone\s*\d+\s*-\s*value$/.test(key) || ['phone', 'phone number', 'mobile', 'number'].includes(key)) { const country = parsePhoneNumberFromString(value || '')?.country; if (country) countryCounts.set(country, (countryCounts.get(country) || 0) + 1) }
    const inferredCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || data.settings.defaultCountry
    const output: Array<{ index: number; name: string; rawPhone: string; phone: string; group: string; valid: boolean; duplicate: boolean; error?: string }> = []
    rows.forEach((row, index) => {
      const name = (row.name || row['full name'] || [row['first name'], row['middle name'], row['last name']].filter(Boolean).join(' ') || '').trim()
      const group = row.list || row.group || row.tag || ''
      const phones = Object.entries(row).filter(([key, value]) => value?.trim() && (/^phone\s*\d+\s*-\s*value$/.test(key) || ['phone', 'phone number', 'mobile', 'number'].includes(key))).map(([, value]) => value.trim())
      if (!phones.length) phones.push('')
      for (const rawPhone of phones) {
        const parsed = parsePhoneNumberFromString(rawPhone, inferredCountry as never)
        const phone = parsed?.isValid() ? parsed.number.replace(/^\+/, '') : ''
        const duplicate = Boolean(phone && (data.contacts.some(c => c.phone === phone) || output.some(c => c.phone === phone)))
        output.push({ index: index + 2, name, rawPhone, phone, group, valid: Boolean(name && phone), duplicate, error: !name ? 'Missing name' : !phone ? `Invalid phone number (using ${inferredCountry})` : undefined })
      }
    })
    return output
  })
  ipcMain.handle('csv:commit', (_, rows: Array<{ name: string; rawPhone: string; phone: string; group: string; valid: boolean; duplicate: boolean }>, update: boolean) => { const data = getData(); let added = 0; for (const row of rows.filter(r => r.valid)) { let groupId: string | undefined; if (row.group.trim()) { let group = data.groups.find(g => g.name.toLowerCase() === row.group.trim().toLowerCase()); if (!group) { group = { id: randomUUID(), name: row.group.trim(), createdAt: new Date().toISOString() }; data.groups.push(group) }; groupId = group.id }; const old = data.contacts.find(c => c.phone === row.phone); if (old) { if (update) { old.name = row.name; old.rawPhone = row.rawPhone; if (groupId && !old.groupIds.includes(groupId)) old.groupIds.push(groupId); old.updatedAt = new Date().toISOString() } } else { data.contacts.push(asContact({ name: row.name, rawPhone: row.rawPhone, phone: row.phone, groupIds: groupId ? [groupId] : [] }, data.settings.defaultCountry)); added++ } }; scheduleSave(); return { added } })
  ipcMain.handle('history:campaigns', readCampaigns); ipcMain.handle('history:messages', (_, id: string) => readMessages(id))
  ipcMain.handle('wa:connect', () => wa.connect(getData().settings.chromePath)); ipcMain.handle('wa:logout', () => wa.logout()); ipcMain.handle('wa:status', () => wa.status)
  ipcMain.handle('wa:groups', () => wa.getGroups())
  ipcMain.handle('send:start', (_, ids: string[], message: string, listNames: string[], mediaPaths: string[] = [], waGroups: Array<{ id: string; name: string }> = []) => { if (queue.state.running) throw new Error('A process is already running'); if (!message.trim() && !mediaPaths.length) throw new Error('Add a message or a media file.'); if (mediaPaths.length > 10) throw new Error('You can attach up to 10 files.'); const hasPdf = mediaPaths.some(path => path.toLowerCase().endsWith('.pdf')); const hasNonPdf = mediaPaths.some(path => !path.toLowerCase().endsWith('.pdf')); if (hasPdf && hasNonPdf) throw new Error('PDFs cannot be mixed with photos or videos in the same message.'); if (wa.status.state !== 'ready') throw new Error('Connect WhatsApp before sending a message.'); const contacts = getData().contacts.filter(c => ids.includes(c.id)); const targets = [...contacts, ...waGroups.map(group => ({ id: `wa-group:${group.id}`, name: group.name, chatId: group.id }))]; void queue.start(targets, message, [...listNames, ...waGroups.map(group => `WhatsApp: ${group.name}`)], getData().settings, wa, mediaPaths); return { started: true } }); ipcMain.handle('send:pause', () => queue.pause()); ipcMain.handle('send:resume', () => queue.resumeJob()); ipcMain.handle('send:stop', () => queue.stop())
  ipcMain.handle('dialog:openCsv', async () => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'CSV files', extensions: ['csv'] }] }); return result.canceled ? null : (await import('node:fs/promises')).readFile(result.filePaths[0], 'utf8') })
  ipcMain.handle('dialog:openMedia', async () => { const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images, videos, and PDF files', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'avi', 'mkv', 'pdf'] }] }); return result.canceled ? [] : result.filePaths })
  ipcMain.handle('data:reveal', () => shell.openPath(app.getPath('userData'))); ipcMain.handle('data:reset', resetData)
}
app.whenReady().then(async () => { await loadData(); registerIpc(); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() }) }); app.on('before-quit', () => { void wa.disconnect() }); app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
