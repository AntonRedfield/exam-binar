export default function QuestionCheckboxGrid({ question, value, onChange, disabled }) {
  const rows = question.grid_rows || []
  const columns = question.grid_columns || []
  // value = { rowIndex: [colIdx, colIdx, ...], ... }
  const gridValue = value || {}

  function handleToggle(rowIdx, colIdx) {
    if (disabled) return
    const rowSelections = gridValue[rowIdx] || []
    const updated = rowSelections.includes(colIdx)
      ? rowSelections.filter(c => c !== colIdx)
      : [...rowSelections, colIdx]
    onChange({ ...gridValue, [rowIdx]: updated })
  }

  return (
    <div className="grid-table-wrapper">
      <table className="grid-table">
        <thead>
          <tr>
            <th className="grid-table-header-label"></th>
            {columns.map((col, ci) => (
              <th key={ci} className="grid-table-header">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={(gridValue[ri] || []).length > 0 ? 'grid-row-answered' : ''}>
              <td className="grid-table-row-label">{row}</td>
              {columns.map((_, ci) => (
                <td key={ci} className="grid-table-cell">
                  <label className="grid-checkbox-label">
                    <input
                      type="checkbox"
                      checked={(gridValue[ri] || []).includes(ci)}
                      onChange={() => handleToggle(ri, ci)}
                      disabled={disabled}
                    />
                    <span className="grid-checkbox-custom"></span>
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
