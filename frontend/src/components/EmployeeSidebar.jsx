export default function EmployeeSidebar({
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
    <aside className="sidebar">
      {showTop ? (
        <>
          <h1>Employee Scheduler</h1>
          <p className="subtle">Create employees and configure weekly shifts.</p>
        </>
      ) : null}

      <form onSubmit={onAddEmployee} className="panel">
        <h2>New Employee</h2>
        <label>
          Name
          <input
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Employee name"
            required
          />
        </label>
        <label>
          Role
          <input
            value={newRole}
            onChange={(e) => onRoleChange(e.target.value)}
            placeholder="Optional role"
          />
        </label>
        <button type="submit">Add Employee</button>
      </form>

      <section className="panel">
        <h2>Employees</h2>
        <div className="employee-list">
          {employees.map((employee) => {
            const active = selectedEmployeeId === employee.id;
            return (
              <article
                key={employee.id}
                className={`employee-card ${active ? "active" : ""}`}
                onClick={() => onSelectEmployee(employee.id)}
              >
                <div>
                  <strong>{employee.name}</strong>
                  <p>{employee.role}</p>
                </div>
                <button
                  type="button"
                  className="danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveEmployee(employee.id);
                  }}
                >
                  Remove
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
