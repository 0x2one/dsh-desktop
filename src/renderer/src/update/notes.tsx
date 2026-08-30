/**
 * Tiny, HTML-escaping changelog renderer for GitHub Release bodies.
 * Supports headings, lists, and paragraphs — no raw HTML.
 */
import type { ReactNode } from 'react'

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<strong key={key++}>{match[1]}</strong>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function headingLevel(line: string): 1 | 2 | 3 | null {
  if (line.startsWith('### ')) return 3
  if (line.startsWith('## ')) return 2
  if (line.startsWith('# ')) return 1
  return null
}

export function renderNotes(raw: string): ReactNode {
  const text = raw.trim()
  if (text === '') {
    return <p className="notes-empty">这一版没有更新说明。</p>
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  let key = 0

  const flushList = (): void => {
    if (list.length === 0) return
    blocks.push(
      <ul key={key++} className="notes-list">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    )
    list = []
  }

  const flushPara = (): void => {
    if (para.length === 0) return
    blocks.push(
      <p key={key++} className="notes-p">
        {inline(para.join(' '))}
      </p>
    )
    para = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const heading = headingLevel(trimmed)
    if (heading !== null) {
      flushList()
      flushPara()
      const body = trimmed.replace(/^#{1,3}\s+/u, '')
      const Tag = heading === 1 ? 'h2' : heading === 2 ? 'h3' : 'h4'
      blocks.push(
        <Tag key={key++} className={`notes-h notes-h${heading}`}>
          {inline(body)}
        </Tag>
      )
      continue
    }
    if (/^[-*]\s+/u.test(trimmed)) {
      flushPara()
      list.push(trimmed.replace(/^[-*]\s+/u, ''))
      continue
    }
    if (trimmed === '') {
      flushList()
      flushPara()
      continue
    }
    flushList()
    para.push(trimmed)
  }
  flushList()
  flushPara()
  return blocks
}
