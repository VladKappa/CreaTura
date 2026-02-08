import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

export default function EmployeeSidebar({
  t,
  newName,
  newRole,
  onNameChange,
  onRoleChange,
  onAddEmployee,
  employees,
  selectedEmployeeId,
  onSelectEmployee,
  onRemoveEmployee,
  showTop = true,
}) {
  return (
    <Stack spacing={1.5}>
      {showTop ? (
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            CreaTura
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(
              "app.subtitle",
              {},
              "Employee scheduling workspace for shifts, assignments, and preferences."
            )}
          </Typography>
        </Box>
      ) : null}

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          {t("employee.newTitle", {}, "New Employee")}
        </Typography>
        <Box
          component="form"
          onSubmit={onAddEmployee}
          sx={{ display: "grid", gap: 1.2 }}
        >
          <TextField
            label={t("employee.name", {}, "Name")}
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t("employee.namePlaceholder", {}, "Employee name")}
            size="small"
            required
          />
          <TextField
            label={t("employee.role", {}, "Role")}
            value={newRole}
            onChange={(e) => onRoleChange(e.target.value)}
            placeholder={t("employee.rolePlaceholder", {}, "Optional role")}
            size="small"
          />
          <Button type="submit" variant="contained">
            {t("employee.add", {}, "Add Employee")}
          </Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t("employee.listTitle", {}, "Employees")}
          </Typography>
          <Chip size="small" label={employees.length} variant="outlined" />
        </Stack>

        <Stack spacing={1}>
          {employees.map((employee) => {
            const isActive = selectedEmployeeId === employee.id;
            return (
              <Paper
                key={employee.id}
                variant="outlined"
                sx={{
                  p: 1,
                  borderColor: isActive ? "primary.main" : "divider",
                  backgroundColor: isActive ? "action.selected" : "background.paper",
                  transition: "border-color .15s ease",
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button
                    variant="text"
                    color="inherit"
                    onClick={() => onSelectEmployee(employee.id)}
                    sx={{
                      flex: 1,
                      justifyContent: "flex-start",
                      minWidth: 0,
                      textTransform: "none",
                      px: 0.5,
                    }}
                  >
                    <Box sx={{ minWidth: 0, textAlign: "left" }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700 }}
                        noWrap
                        title={employee.name}
                      >
                        {employee.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        title={employee.role}
                      >
                        {employee.role}
                      </Typography>
                    </Box>
                  </Button>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => onRemoveEmployee(employee.id)}
                    aria-label={t("employee.remove", {}, "Remove")}
                  >
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}
