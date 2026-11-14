import type { CSSProperties } from 'react'
import { SHEET_LAYOUT, sheetPageCount } from '../game/sheetLayout'
import type { WordCount } from '../game/types'

type Props = {
  count: WordCount
}

export function SheetTemplate({ count }: Props) {
  const { cols, rows, perPage } = SHEET_LAYOUT[count]
  const pages = sheetPageCount(count)

  return (
    <div className="sheet-preview" data-cols={cols} data-rows={rows}>
      {Array.from({ length: pages }, (_, pageIndex) => {
        const start = pageIndex * perPage
        const end = Math.min(start + perPage, count)
        const cells = end - start

        return (
          <div
            key={pageIndex}
            className="sheet-page"
            style={
              {
                '--sheet-cols': cols,
                '--sheet-rows': rows,
              } as CSSProperties
            }
          >
            <div className="sheet-grid">
              {Array.from({ length: cells }, (_, i) => {
                const n = start + i + 1
                return (
                  <div key={n} className="sheet-cell">
                    <span className="sheet-num">{n}</span>
                  </div>
                )
              })}
            </div>
            <p className="sheet-footer">
              ХудоБыстро · лист для викторины
              {pages > 1 ? ` · ${pageIndex + 1}/${pages}` : ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}
