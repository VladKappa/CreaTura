import { defaultShiftName, formatShiftRange12, isOvernight } from "../utils/schedule";

export default function ShiftEditor({
  shifts,
  onAdd,
  onRemove,
  onChange,
  errorMessage,
  disabled = false,
}) {
  return (
    <div className="shift-list">
      {shifts.length === 0 ? <p className="muted-line">No shifts.</p> : null}
      {shifts.map((shift, index) => (
        <div key={shift.id} className="shift-row">
          <div className="shift-main">
            <input
              type="text"
              value={shift.name || ""}
              placeholder={defaultShiftName(index)}
              disabled={disabled}
              onChange={(e) => onChange(shift.id, { name: e.target.value })}
            />
            <input
              type="time"
              value={shift.start}
              disabled={disabled}
              onChange={(e) => onChange(shift.id, { start: e.target.value })}
            />
            <span>to</span>
            <input
              type="time"
              value={shift.end}
              disabled={disabled}
              onChange={(e) => onChange(shift.id, { end: e.target.value })}
            />
          </div>
          <button
            type="button"
            className="quiet danger icon-btn"
            disabled={disabled}
            onClick={() => onRemove(shift.id)}
            aria-label="Remove shift"
          >
            x
          </button>
          <p className="time-readout">
            {shift.name?.trim() || defaultShiftName(index)}: {formatShiftRange12(shift)}
          </p>
          {isOvernight(shift) ? <em className="overnight-tag">overnight</em> : null}
        </div>
      ))}
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      <button type="button" className="quiet" disabled={disabled} onClick={onAdd}>
        + Add Shift
      </button>
    </div>
  );
}
