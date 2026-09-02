/**
 * Changelog renderer for GitHub Release bodies.
 * Accepts Markdown or the HTML GitHub stores on the Release; never injects
 * raw markup — allowed tags are mapped to React nodes.
 */
import type { ReactNode } from 'react'

function looksLikeHtml(text: string): boolean {
  return /<\/?(?:p|h[1-6]|ul|ol|li|div|br|strong|em|code)\b/i.test(text)
}

function inlineMarkdown(text: string): ReactNode[] {
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

function walkInline(el: Element): ReactNode[] {
  const out: ReactNode[] = []
  let key = 0
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent ?? '')
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const child = node as Element
    const tag = child.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'iframe') continue
    if (tag === 'strong' || tag === 'b') {
      out.push(<strong key={key++}>{walkInline(child)}</strong>)
      continue
    }
    if (tag === 'em' || tag === 'i') {
      out.push(<em key={key++}>{walkInline(child)}</em>)
      continue
    }
    if (tag === 'code') {
      out.push(
        <code key={key++} className="notes-code">
          {child.textContent ?? ''}
        </code>
      )
      continue
    }
    if (tag === 'br') {
      out.push(<br key={key++} />)
      continue
    }
    out.push(<span key={key++}>{walkInline(child)}</span>)
  }
  return out
}

function headingTag(tag: string): { Tag: 'h2' | 'h3' | 'h4'; cls: 1 | 2 | 3 } {
  if (tag === 'h1') return { Tag: 'h2', cls: 1 }
  if (tag === 'h2') return { Tag: 'h3', cls: 2 }
  return { Tag: 'h4', cls: 3 }
}

function walkBlocks(nodes: NodeListOf<ChildNode>, keys: { n: number }): ReactNode[] {
  const out: ReactNode[] = []
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').trim()
      if (text === '') continue
      out.push(
        <p key={keys.n++} className="notes-p">
          {text}
        </p>
      )
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'iframe') continue

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const { Tag, cls } = headingTag(tag)
      out.push(
        <Tag key={keys.n++} className={`notes-h notes-h${String(cls)}`}>
          {walkInline(el)}
        </Tag>
      )
      continue
    }
    if (tag === 'p') {
      out.push(
        <p key={keys.n++} className="notes-p">
          {walkInline(el)}
        </p>
      )
      continue
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = [...el.children]
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .map((li, i) => <li key={i}>{walkInline(li)}</li>)
      const List = tag === 'ol' ? 'ol' : 'ul'
      out.push(
        <List key={keys.n++} className="notes-list">
          {items}
        </List>
      )
      continue
    }
    if (tag === 'br') continue
    out.push(...walkBlocks(el.childNodes, keys))
  }
  return out
}

function renderHtml(html: string): ReactNode {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (root === null) return null
  const blocks = walkBlocks(root.childNodes, { n: 0 })
  return blocks.length === 0 ? null : blocks
}

function renderMarkdown(text: string): ReactNode {
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
          <li key={i}>{inlineMarkdown(item)}</li>
        ))}
      </ul>
    )
    list = []
  }

  const flushPara = (): void => {
    if (para.length === 0) return
    blocks.push(
      <p key={key++} className="notes-p">
        {inlineMarkdown(para.join(' '))}
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
        <Tag key={key++} className={`notes-h notes-h${String(heading)}`}>
          {inlineMarkdown(body)}
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

/** Parse GitHub Release HTML or Markdown into React nodes. Empty input is null. */
export function renderNotes(raw: string): ReactNode {
  const text = raw.trim()
  if (text === '') return null
  const rendered = looksLikeHtml(text) ? renderHtml(text) : renderMarkdown(text)
  if (rendered === null || (Array.isArray(rendered) && rendered.length === 0)) {
    return null
  }
  return rendered
}
