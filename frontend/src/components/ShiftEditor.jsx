import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { Alert, Box, Button, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import { defaultShiftName, formatShiftRange12, isOvernight } from "../utils/schedule";

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
              label={`${defaultShiftName(index)} name`}
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
