import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import ShiftEditor from "./ShiftEditor";

export default function TemplateGrid({
  t,
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
    <Stack spacing={1.2}>
      {showTitle ? (
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t("template.title", {}, "Default Template (Mon-Sun)")}
        </Typography>
      ) : null}
      {clipboardLabel ? (
        <Typography variant="caption" color="text.secondary">
          {t("template.clipboard", { label: clipboardLabel }, `Clipboard: ${clipboardLabel}`)}
        </Typography>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 1.2,
        }}
      >
        {week.map((day) => {
          const shifts = employee.defaultShiftsByDay[day.dayIndex];
          return (
            <Paper key={day.label} variant="outlined" sx={{ p: 1.2 }}>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {day.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {day.dateText}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    onClick={() => onCopyDay(day)}
                  >
                    {t("common.copy", {}, "Copy")}
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    disabled={!clipboardLabel}
                    onClick={() => onPasteDay(day)}
                  >
                    {t("common.paste", {}, "Paste")}
                  </Button>
                </Stack>
                <ShiftEditor
                  t={t}
                  shifts={shifts}
                  onAdd={() => onAddShift(day)}
                  onRemove={(shiftId) => onRemoveShift(day, shiftId)}
                  onChange={(shiftId, patch) => onUpdateShift(day, shiftId, patch)}
                  errorMessage={getErrorMessage(day)}
                />
              </Stack>
            </Paper>
          );
        })}
      </Box>
    </Stack>
  );
}
