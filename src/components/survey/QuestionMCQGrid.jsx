export default function QuestionMCQGrid({ question, value, onChange, disabled }) {
  const rows = question.grid_rows || []
  const columns = question.grid_columns || []
  // value = { rowIndex: selectedColumn, ... }
  const gridValue = value || {}

  function handleSelect(rowIdx, colIdx) {
    if (disabled) return
    const updated = { ...gridValue, [rowIdx]: colIdx }
    onChange(updated)
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
            <tr key={ri} className={gridValue[ri] !== undefined ? 'grid-row-answered' : ''}>
              <td className="grid-table-row-label">{row}</td>
              {columns.map((_, ci) => (
                <td key={ci} className="grid-table-cell">
                  <label className="grid-radio-label">
                    <input
                      type="radio"
                      name={`grid_${question.id || question.number}_row_${ri}`}
                      checked={gridValue[ri] === ci}
                      onChange={() => handleSelect(ri, ci)}
                      disabled={disabled}
                    />
                    <span className="grid-radio-custom"></span>
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
