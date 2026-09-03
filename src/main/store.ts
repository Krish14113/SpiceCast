import { app } from 'electron'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Data, defaults, Campaign, MessageLog } from './types'

const dataPath = () => join(app.getPath('userData'), 'data.json')
const historyPath = (kind: 'campaigns' | 'messages') => join(app.getPath('userData'), 'history', `${kind}.jsonl`)
let data: Data = structuredClone(defaults)
let saveTimer: NodeJS.Timeout | undefined

export async function loadData() { try { data = { ...defaults, ...JSON.parse(await readFile(dataPath(), 'utf8')), settings: { ...defaults.settings, ...JSON.parse(await readFile(dataPath(), 'utf8')).settings } } } catch { data = structuredClone(defaults) }; return data }
export const getData = () => data
export function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => void saveNow(), 150) }
export async function saveNow() { const file = dataPath(); await mkdir(dirname(file), { recursive: true }); const temp = `${file}.tmp`; await writeFile(temp, JSON.stringify(data, null, 2)); await rename(temp, file) }
export async function appendCampaign(c: Campaign) { const file = historyPath('campaigns'); await mkdir(dirname(file), { recursive: true }); await appendFile(file, `${JSON.stringify(c)}\n`) }
export async function appendMessage(m: MessageLog) { const file = historyPath('messages'); await mkdir(dirname(file), { recursive: true }); await appendFile(file, `${JSON.stringify(m)}\n`) }
async function jsonl<T>(kind: 'campaigns' | 'messages') { try { return (await readFile(historyPath(kind), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as T).reverse() } catch { return [] } }
export const readCampaigns = () => jsonl<Campaign>('campaigns')
export const readMessages = (campaignId: string) => jsonl<MessageLog>('messages').then(rows => rows.filter(row => row.campaignId === campaignId))
export async function resetData() { data = structuredClone(defaults); await saveNow() }
