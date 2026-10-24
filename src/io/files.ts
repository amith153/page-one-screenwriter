/** Import and export: .pageone, Fountain, Final Draft, PDF, Word, RTF, text, HTML and CSV reports — to disk or Google Drive. */
import { uuid, type Script } from '../core/model'
import { scriptFromJson, scriptToJson } from '../core/codec'
import { parseFountain, writeFountain } from '../core/fountain'
import { parseFdx, writeFdx } from '../core/fdx'
import { Paginator } from '../core/paginator'
import { forcedBreaks, sceneLabels, sides } from '../core/production'
import { pickFile, saveFile, openPath, isTauri } from '../platform/fs'
import { createScript, saveScript } from '../state/library'
import { layoutFor, paginate } from '../state/doc'
import { useSettings } from '../state/settings'
import { buildPdf, buildReportPdf, unsupportedText, type PdfOptions, type ReportTable } from './pdf'
import { toast } from '../ui/kit'
import { writeDocx, writeHtml, writePlainText, writeRtf } from './formats'
import { upload } from './drive'
import { openLink } from '../state/media'

const safeName = (s: string) => (s.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').substring(0, 80)

export const IMPORT_FILTERS = [{ name: 'Screenplays', extensions: ['pageone', 'fountain', 'fdx', 'txt', 'spmd', 'json'] }]

/** Read a screenplay file into a new library script. Returns its id, or null if cancelled. */
export async function importFile(): Promise<string | null> {
  const f = await pickFile(IMPORT_FILTERS)
  if (!f) return null
  return importText(f.name, await f.read())
}

export async function importText(name: string, text: string): Promise<string> {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const base = name.replace(/\.[^.]+$/, '')
  if (ext === 'pageone' || ext === 'json') {
    // Keep the script's own ids so merges with the phone still line up; a fresh file id avoids clobbering.
    const s = scriptFromJson(text)
    const copy: Script = { ...s, id: uuid(), modifiedAt: Date.now() }
    await saveScript(copy, paginate(copy).pages.length)
    return copy.id
  }
  const parsed = ext === 'fdx' ? parseFdx(text) : parseFountain(text)
  const title = parsed.titlePage.title.trim() || base
  const s = await createScript(title, parsed.elements, { ...parsed.titlePage, title })
  return s.id
}

export async function exportPageOne(s: Script) {
  const path = await saveFile(`${safeName(s.title)}.pageone`, [{ name: 'Page One script', extensions: ['pageone'] }], scriptToJson(s), 'application/json')
  if (path) toast(`Saved ${shortName(path)}`, 'export')
}

export async function exportFountain(s: Script) {
  const path = await saveFile(`${safeName(s.title)}.fountain`, [{ name: 'Fountain', extensions: ['fountain'] }], writeFountain(s), 'text/plain')
  if (path) toast(`Saved ${shortName(path)}`, 'export')
}

export async function exportFdx(s: Script) {
  const path = await saveFile(`${safeName(s.title)}.fdx`, [{ name: 'Final Draft', extensions: ['fdx'] }], writeFdx(s, useSettings.getState().s), 'application/xml')
  if (path) toast(`Saved ${shortName(path)} — opens in Final Draft`, 'export')
}

export interface PdfRequest extends Omit<PdfOptions, 'sceneLabels' | 'paper'> { names?: Set<string> }

export async function pdfBytes(s: Script, req: PdfRequest): Promise<Uint8Array> {
  if (unsupportedText(s)) {
    toast('Some characters (Chinese, Japanese, Korean…) have no built-in font yet — use Print → Save as PDF to print them in your system fonts.', 'page')
  }
  const labels = sceneLabels(s.elements, s.extras.lock)
  const body = req.names ? sides(s, req.names) : s
  const p = new Paginator(layoutFor()).paginate(body.elements, req.names ? new Map() : forcedBreaks(body.elements, body.extras.lock))
  return buildPdf(body, p, { ...req, sceneLabels: labels, paper: useSettings.getState().s.paperSize })
}

/** The PDF watermark from Settings (used unless an export sets its own). */
export const settingsWatermark = () => {
  const st = useSettings.getState().s
  return st.watermarkOn ? st.watermark : ''
}

export async function exportPdf(s: Script, req: PdfRequest) {
  const bytes = await pdfBytes(s, { watermarkOpacity: useSettings.getState().s.watermarkOpacity, ...req })
  const suffix = req.names ? ` — sides (${[...req.names].join(', ')})` : req.revisedOnly ? ' — revised pages' : ''
  const path = await saveFile(`${safeName(s.title)}${suffix}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }], bytes, 'application/pdf')
  if (path) toast(`Saved ${shortName(path)}`, 'export', isTauri ? { label: 'Open', run: () => void openPath(path) } : undefined)
}

// ---------------------------------------------------------------- every format, to a file or to Google Drive

export type Format = 'pdf' | 'fdx' | 'fountain' | 'docx' | 'rtf' | 'txt' | 'html' | 'pageone'

export const FORMATS: { id: Format; label: string; ext: string; mime: string; desc: string }[] = [
  { id: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf', desc: 'For reading, printing and submissions' },
  { id: 'fdx', label: 'Final Draft', ext: 'fdx', mime: 'application/xml', desc: 'Final Draft, Fade In, WriterDuet, Highland, Celtx, Arc Studio' },
  { id: 'fountain', label: 'Fountain', ext: 'fountain', mime: 'text/plain', desc: 'Plain-text screenplay — Highland, Slugline, Beat' },
  { id: 'docx', label: 'Word', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', desc: 'Screenplay styles in Word, Pages, Google Docs' },
  { id: 'rtf', label: 'Rich Text', ext: 'rtf', mime: 'application/rtf', desc: 'Movie Magic Screenwriter, Word, TextEdit' },
  { id: 'txt', label: 'Plain text', ext: 'txt', mime: 'text/plain', desc: 'Paginated, exactly as it prints' },
  { id: 'html', label: 'Web page', ext: 'html', mime: 'text/html', desc: 'Opens in any browser' },
  { id: 'pageone', label: 'Page One', ext: 'pageone', mime: 'application/json', desc: 'Everything, for Page One on the phone' },
]

export interface ExportRequest extends PdfRequest { format: Format }

export async function buildExport(s: Script, req: ExportRequest): Promise<{ name: string; data: Uint8Array | string; mime: string }> {
  const f = FORMATS.find(x => x.id === req.format)!
  const st = useSettings.getState().s
  const o = { titlePage: req.titlePage, boldHeadings: req.boldHeadings, boldCharacters: req.boldCharacters, paper: st.paperSize, sceneLabels: sceneLabels(s.elements, s.extras.lock), sceneNumbers: req.sceneNumbers }
  const name = `${safeName(s.title)}${req.revisedOnly && req.format === 'pdf' ? ' — revised pages' : ''}.${f.ext}`
  switch (req.format) {
    case 'pdf': return { name, mime: f.mime, data: await pdfBytes(s, { watermarkOpacity: st.watermarkOpacity, ...req }) }
    case 'fdx': return { name, mime: f.mime, data: writeFdx(s, req) }
    case 'fountain': return { name, mime: f.mime, data: writeFountain(s) }
    case 'docx': return { name, mime: f.mime, data: writeDocx(s, o) }
    case 'rtf': return { name, mime: f.mime, data: writeRtf(s, o) }
    case 'txt': return { name, mime: f.mime, data: writePlainText(s, paginate(s), o) }
    case 'html': return { name, mime: f.mime, data: writeHtml(s, o) }
    case 'pageone': return { name, mime: f.mime, data: scriptToJson(s) }
  }
}

export async function exportTo(s: Script, req: ExportRequest, dest: 'file' | 'drive') {
  const out = await buildExport(s, req)
  if (dest === 'drive') {
    const f = await upload(out.name, out.data, out.mime)
    const link = f.webViewLink
    toast(`Saved to Google Drive › Page One › ${f.name}`, 'cloud', link ? { label: 'Open', run: () => openLink(link) } : undefined)
    return
  }
  const f = FORMATS.find(x => x.id === req.format)!
  const path = await saveFile(out.name, [{ name: f.label, extensions: [f.ext] }], out.data, out.mime)
  if (path) toast(`Saved ${shortName(path)}`, 'export', isTauri ? { label: 'Open', run: () => void openPath(path) } : undefined)
}

export async function exportCsv(name: string, csv: string) {
  const path = await saveFile(`${safeName(name)}.csv`, [{ name: 'CSV', extensions: ['csv'] }], '﻿' + csv, 'text/csv')
  if (path) toast(`Saved ${shortName(path)}`, 'export', isTauri ? { label: 'Open', run: () => void openPath(path) } : undefined)
}

/** Production reports as a PDF — one table or several. Empty columns are left out to give the rest room. */
export async function exportReportPdf(name: string, sub: string, tables: ReportTable[]) {
  const trimmed = tables.map(t => {
    const keep = t.headers.map((_, i) => i).filter(i => i < 2 || t.rows.some(r => (r[i] ?? '').trim()))
    return { ...t, headers: keep.map(i => t.headers[i]), rows: t.rows.map(r => keep.map(i => r[i] ?? '')) }
  })
  const bytes = await buildReportPdf(name, sub, trimmed, useSettings.getState().s.paperSize)
  const path = await saveFile(`${safeName(name)}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }], bytes, 'application/pdf')
  if (path) toast(`Saved ${shortName(path)}`, 'export', isTauri ? { label: 'Open', run: () => void openPath(path) } : undefined)
}

const shortName = (p: string) => p.split(/[\\/]/).pop() ?? p

/** Print through the system dialog (also "Save as PDF" with the writer's own fonts). */
export function printScript() {
  document.body.classList.add('printing')
  window.print()
  window.setTimeout(() => document.body.classList.remove('printing'), 500)
}
