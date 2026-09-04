import { contextBridge, ipcRenderer } from 'electron'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('api', {
  getData: () => invoke('data:get'),
  saveContact: (contact: unknown) => invoke('contacts:save', contact),
  deleteContacts: (ids: string[]) => invoke('contacts:delete', ids),
  saveGroup: (group: unknown) => invoke('groups:save', group),
  deleteGroup: (id: string) => invoke('groups:delete', id),
  assignGroup: (ids: string[], groupId: string) => invoke('contacts:assignGroup', ids, groupId),
  removeGroup: (contactId: string, groupId: string) => invoke('contacts:removeGroup', contactId, groupId),
  saveSettings: (settings: unknown) => invoke('settings:save', settings),
  openCsv: () => invoke('dialog:openCsv'),
  openMedia: () => invoke('dialog:openMedia'),
  parseCsv: (text: string) => invoke('csv:parse', text),
  commitCsv: (rows: unknown, update: boolean) => invoke('csv:commit', rows, update),
  campaigns: () => invoke('history:campaigns'),
  messages: (id: string) => invoke('history:messages', id),
  connect: () => invoke('wa:connect'),
  logout: () => invoke('wa:logout'),
  waStatus: () => invoke('wa:status'),
  waGroups: () => invoke('wa:groups'),
  start: (ids: string[], message: string, lists: string[], mediaPaths?: string[], waGroups?: Array<{ id: string; name: string }>) => invoke('send:start', ids, message, lists, mediaPaths, waGroups),
  pause: () => invoke('send:pause'),
  resume: () => invoke('send:resume'),
  stop: () => invoke('send:stop'),
  reveal: () => invoke('data:reveal'),
  reset: () => invoke('data:reset'),
  focusWindow: () => ipcRenderer.send('window:focus'),
  on: (channel: string, listener: (value: any) => void) => {
    const handler = (_: unknown, value: any) => listener(value)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
})
