import ShiftEditor from "./ShiftEditor";

export default function TemplateGrid({
  week,
  employee,
  onAddShift,
  onRemoveShift,
  onUpdateShift,
  getErrorMessage,
  onCopyDay,
  onPasteDay,
  clipboardLabel,
  showTitle = true,
}) {
  return (
    <section className="panel">
      {showTitle ? <h2>Default Template (Mon-Sun)</h2> : null}
      {clipboardLabel ? <p className="subtle">Clipboard: {clipboardLabel}</p> : null}
      <div className="template-grid">
        {week.map((day) => {
          const shifts = employee.defaultShiftsByDay[day.dayIndex];
          return (
            <div key={day.label} className="day-template">
              <h3>{day.label}</h3>
              <div className="card-actions">
                <button type="button" className="quiet mini-btn" onClick={() => onCopyDay(day)}>
                  Copy
                </button>
                <button
                  type="button"
                  className="quiet mini-btn"
                  disabled={!clipboardLabel}
                  onClick={() => onPasteDay(day)}
                >
                  Paste
                </button>
              </div>
              <ShiftEditor
                shifts={shifts}
                onAdd={() => onAddShift(day)}
                onRemove={(shiftId) => onRemoveShift(day, shiftId)}
                onChange={(shiftId, patch) => onUpdateShift(day, shiftId, patch)}
                errorMessage={getErrorMessage(day)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
