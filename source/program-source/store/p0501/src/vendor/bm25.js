// Adapted from imkelt/DSH-RAG fa211a4913b6ab465e30d09aad0a29cea134a817.
// Copyright (c) 2026 kai232. MIT; see licenses/DSH-RAG-MIT.txt.
// Local changes: remove TypeScript-only types and host search wrapper.
                                                                                               

const WORD = /[\p{Script=Han}]|[\p{Letter}\p{Number}]+/gu

                                                   

export function tokenizeUnicode(value        )           {
  return [...value.toLocaleLowerCase().matchAll(WORD)].map(match => match[0] ?? '').filter(Boolean)
}

export function tokenize(value        )           {
  const base = tokenizeUnicode(value)
  const han = base.filter(token => /^\p{Script=Han}$/u.test(token))
  const bigrams = han.slice(0, -1).map((token, index) => `${token}${han[index + 1] ?? ''}`)
  return [...base, ...bigrams]
}

export function tokenizeTrigram(value        )           {
  const characters = [...value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim()]
  if (characters.length < 3) return []
  return characters.slice(0, -2).map((character, index) => `${character}${characters[index + 1] ?? ''}${characters[index + 2] ?? ''}`)
}

const wordSegmenter = new Intl.Segmenter(['zh', 'en'], { granularity: 'word' })

export function tokenizeSegmented(value        )           {
  return [...wordSegmenter.segment(value.normalize('NFKC').toLocaleLowerCase())]
    .filter(item => item.isWordLike)
    .map(item => item.segment)
}

export function tokenizeHybridSegmented(value        )           {
  return [...new Set([...tokenize(value), ...tokenizeSegmented(value)])]
}

export function selectTokenizer(query        )            {
  return /\p{Script=Han}/u.test(query) ? tokenizeHybridSegmented : tokenize
}

                           
                     
                       
 

                           
                     
                        
 

export function rankBm25(
  items                     ,
  query        ,
  limit = 5,
  tokenizer            = tokenize,
)             {
  const queryTerms = [...new Set(tokenizer(query))]
  if (queryTerms.length === 0 || limit <= 0 || items.length === 0) return []
  const rows = items.map(item => ({ item, terms: tokenizer(item.text) }))
  const avgLength = rows.reduce((sum, row) => sum + row.terms.length, 0) / rows.length
  const documentFrequency = new Map                ()
  for (const term of queryTerms) documentFrequency.set(term, rows.filter(row => row.terms.includes(term)).length)
  const k1 = 1.2
  const b = 0.75
  return rows.map(row => {
    let score = 0
    for (const term of queryTerms) {
      const frequency = row.terms.filter(token => token === term).length
      if (frequency === 0) continue
      const df = documentFrequency.get(term) ?? 0
      const idf = Math.log(1 + (rows.length - df + 0.5) / (df + 0.5))
      const lengthNorm = 1 - b + b * row.terms.length / Math.max(avgLength, 1)
      score += idf * frequency * (k1 + 1) / (frequency + k1 * lengthNorm)
    }
    return { id: row.item.id, score }
  }).filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map(item => ({ id: item.id, score: Number(item.score.toFixed(6)) }))
}

