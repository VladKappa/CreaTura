import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { Alert, Box, Button, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import { defaultShiftName, formatShiftRange12, isOvernight } from "../utils/schedule";

const MINUTES_IN_DAY = 24 * 60;

function parseTimeToMinutes(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export default function ShiftEditor({
  t,
  shifts,
  onAdd,
  onRemove,
  onChange,
  errorMessage,
  disabled = false,
  forceStacked = false,
}) {
  function handleTimeWheel(event, shiftId, key, currentValue) {
    if (disabled) return;

    const direction = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
    if (direction === 0) return;

    const currentMinutes = parseTimeToMinutes(currentValue);
    if (currentMinutes === null) return;

    const inputRect = event.currentTarget.getBoundingClientRect();
    const xInside = event.clientX - inputRect.left;
    const isHoursArea = xInside < inputRect.width * 0.5;
    const stepMinutes = isHoursArea ? 60 : 1;
    const nextValue = formatMinutesToTime(currentMinutes + direction * stepMinutes);

    event.preventDefault();
    event.stopPropagation();
    if (nextValue !== currentValue) {
      onChange(shiftId, { [key]: nextValue });
    }
  }

  return (
    <Stack spacing={1}>
      {shifts.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          {t("shift.noShifts", {}, "No shifts.")}
        </Typography>
      ) : null}

      {shifts.map((shift, index) => (
        <Paper key={shift.id} variant="outlined" sx={{ p: 1 }}>
          <Stack spacing={1}>
            <TextField
              label={t("shift.nameLabel", {}, "Shift Name")}
              value={shift.name || ""}
              placeholder={defaultShiftName(index)}
              disabled={disabled}
              size="small"
              fullWidth
              onChange={(e) => onChange(shift.id, { name: e.target.value })}
            />
            <Stack
              direction={forceStacked ? "column" : { xs: "column", md: "row" }}
              spacing={1}
              alignItems={forceStacked ? "stretch" : { xs: "stretch", md: "center" }}
            >
              <TextField
                type="time"
                value={shift.start}
                disabled={disabled}
                size="small"
                inputProps={{
                  onWheel: (event) => handleTimeWheel(event, shift.id, "start", shift.start),
                }}
                onChange={(e) => onChange(shift.id, { start: e.target.value })}
                fullWidth
                sx={{ minWidth: 0, maxWidth: forceStacked ? "100%" : { xs: "100%", md: 170 } }}
              />
              <Typography variant="caption" color="text.secondary">
                {t("shift.from", {}, "to")}
              </Typography>
              <TextField
                type="time"
                value={shift.end}
                disabled={disabled}
                size="small"
                inputProps={{
                  onWheel: (event) => handleTimeWheel(event, shift.id, "end", shift.end),
                }}
                onChange={(e) => onChange(shift.id, { end: e.target.value })}
                fullWidth
                sx={{ minWidth: 0, maxWidth: forceStacked ? "100%" : { xs: "100%", md: 170 } }}
              />
              <Box sx={{ flex: 1, display: forceStacked ? "none" : "block" }} />
              <IconButton
                color="error"
                size="small"
                disabled={disabled}
                onClick={() => onRemove(shift.id)}
                aria-label="Remove shift"
                sx={{
                  alignSelf: forceStacked ? "flex-end" : "center",
                }}
              >
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {(shift.name?.trim() || defaultShiftName(index)) + ": " + formatShiftRange12(shift)}
            </Typography>
            {isOvernight(shift) ? (
              <Typography variant="caption" color="warning.main">
                {t("shift.overnight", {}, "overnight")}
              </Typography>
            ) : null}
          </Stack>
        </Paper>
      ))}

      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

      <Button type="button" variant="outlined" disabled={disabled} onClick={onAdd}>
        {t("shift.add", {}, "+ Add Shift")}
      </Button>
    </Stack>
  );
}
