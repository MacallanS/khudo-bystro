import type { WordCount } from './types'

export const SHEET_LAYOUT: Record<
  WordCount,
  { cols: number; rows: number; perPage: number }
> = {
  10: { cols: 2, rows: 5, perPage: 10 },
  15: { cols: 3, rows: 5, perPage: 15 },
  25: { cols: 5, rows: 5, perPage: 25 },
  30: { cols: 5, rows: 6, perPage: 30 },
  35: { cols: 5, rows: 7, perPage: 35 },
  40: { cols: 5, rows: 4, perPage: 20 },
}

export function sheetPageCount(count: WordCount): number {
  const { perPage } = SHEET_LAYOUT[count]
  return Math.ceil(count / perPage)
}

/** Word-compatible HTML (.doc) with numbered drawing cells. */
export function buildSheetDocHtml(count: WordCount): string {
  const { cols, perPage } = SHEET_LAYOUT[count]
  const pages = sheetPageCount(count)
  const cellHeight =
    count <= 10
      ? '140pt'
      : count <= 15
        ? '110pt'
        : count <= 25
          ? '95pt'
          : count <= 35
            ? '85pt'
            : '110pt'

  const pageHtml = Array.from({ length: pages }, (_, pageIndex) => {
    const start = pageIndex * perPage
    const end = Math.min(start + perPage, count)
    const cells = end - start
    const rows = Math.ceil(cells / cols)

    let rowsHtml = ''
    for (let r = 0; r < rows; r++) {
      let cellsHtml = ''
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (i >= cells) {
          cellsHtml += `<td style="border:none;width:${(100 / cols).toFixed(2)}%;"></td>`
          continue
        }
        const n = start + i + 1
        cellsHtml += `<td style="border:1px solid #000;width:${(100 / cols).toFixed(2)}%;height:${cellHeight};vertical-align:top;padding:6pt 8pt;"><span style="font-family:Arial,sans-serif;font-size:14pt;font-weight:bold;">${n}</span></td>`
      }
      rowsHtml += `<tr>${cellsHtml}</tr>`
    }

    const footer =
      pages > 1
        ? `ХудоБыстро · лист для викторины · ${pageIndex + 1}/${pages}`
        : 'ХудоБыстро · лист для викторины'

    const breakBefore =
      pageIndex > 0
        ? '<br clear="all" style="page-break-before:always;mso-break-type:section-break" />'
        : ''

    return `${breakBefore}<table style="width:100%;border-collapse:collapse;table-layout:fixed;border:0;">${rowsHtml}</table><p style="font-family:Arial,sans-serif;font-size:9pt;color:#333;text-align:center;margin:8pt 0 0;">${footer}</p>`
  }).join('')

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>ХудоБыстро — шаблон ${count}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { margin: 0; }
</style>
</head>
<body>
${pageHtml}
</body>
</html>`
}

export function downloadSheetDoc(count: WordCount): void {
  const html = buildSheetDocHtml(count)
  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `khudo-bystro-listy-${count}.doc`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
