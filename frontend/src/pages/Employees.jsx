import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Users,
  Calendar,
  Check,
  UserCheck,
  DollarSign,
} from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY_EMPLOYEE = {
  name: '',
  phone: '',
  role: 'Staff',
  salary: '',
  joinDate: new Date().toISOString().slice(0, 10),
};

const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Half-Day', 'Leave'];
const ATTENDANCE_COLORS = {
  Present: '#10b981',
  Absent: '#f43f5e',
  'Half-Day': '#f59e0b',
  Leave: '#94a3b8',
};

export default function Employees() {
  const [tab, setTab] = useState('employees'); // 'employees' | 'attendance'
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_EMPLOYEE);
  const [saving, setSaving] = useState(false);

  // Attendance state
  const today = new Date().toISOString().slice(0, 10);
  const [attDate, setAttDate] = useState(today);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [attSaving, setAttSaving] = useState(false);

  const loadEmployees = async () => {
    try {
      const { data } = await api.get('/employees');
      setEmployees(data.data);
      const initialMap = {};
      data.data.forEach((e) => {
        initialMap[e._id] = '';
      });
      setAttendanceMap(initialMap);
    } catch (err) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendance = async (date) => {
    try {
      const { data } = await api.get('/employees/attendance', {
        params: { date },
      });
      const map = {};
      employees.forEach((e) => {
        map[e._id] = '';
      });
      data.data.forEach((rec) => {
        const empId = rec.employee?._id || rec.employee;
        map[empId] = rec.status;
      });
      setAttendanceMap(map);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (tab === 'attendance' && employees.length > 0) {
      loadAttendance(attDate);
    }
  }, [tab, attDate, employees.length]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_EMPLOYEE);
    setModal(true);
  };

  const openEdit = (emp) => {
    setEditing(emp._id);
    setForm({
      ...emp,
      salary: emp.salary,
      joinDate: emp.joinDate ? emp.joinDate.slice(0, 10) : '',
    });
    setModal(true);
  };

  const onChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/employees/${editing}`, form);
        toast.success('Employee updated!');
      } else {
        await api.post('/employees', form);
        toast.success('Employee added to roster!');
      }
      setModal(false);
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving employee.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id, name) => {
    if (!window.confirm(`Deactivate employee "${name}"?`)) return;
    try {
      await api.delete(`/employees/${id}`);
      toast.success('Employee deactivated.');
      loadEmployees();
    } catch {
      toast.error('Could not deactivate employee.');
    }
  };

  const saveAttendance = async () => {
    setAttSaving(true);
    try {
      const records = Object.entries(attendanceMap)
        .filter(([, status]) => status !== '')
        .map(([employee, status]) => ({ employee, date: attDate, status }));

      if (records.length === 0) {
        toast.error('Please mark at least one employee status.');
        setAttSaving(false);
        return;
      }

      await api.post('/employees/attendance', { records });
      toast.success('Attendance records saved!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save attendance.');
    } finally {
      setAttSaving(false);
    }
  };

  const totalPayroll = employees.reduce((sum, e) => sum + (e.salary || 0), 0);

  return (
    <Layout
      title="Staff & Attendance"
      subtitle="Manage team members, roles, monthly payroll, and daily attendance logs"
      actions={
        tab === 'employees' ? (
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={14} /> Add Employee
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={saveAttendance}
            disabled={attSaving}
          >
            {attSaving ? <span className="spinner" /> : <><Check size={14} /> Save Attendance</>}
          </button>
        )
      }
    >
      {/* ── Tab Switcher ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          className={`btn btn-sm ${tab === 'employees' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('employees')}
          style={{ width: 'auto' }}
        >
          <Users size={14} /> Staff Roster ({employees.length})
        </button>
        <button
          className={`btn btn-sm ${tab === 'attendance' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('attendance')}
          style={{ width: 'auto' }}
        >
          <Calendar size={14} /> Attendance Ledger
        </button>
      </div>

      {/* ── Employee Roster Tab ───────────────────────────────────────────── */}
      {tab === 'employees' && (
        <>
          <div className="stats-grid-v2 fade-up" style={{ marginBottom: '20px' }}>
            <div className="stat-card-v2 stat-blue">
              <div className="stat-top">
                <div className="stat-icon-small bg-blue">
                  <Users size={18} />
                </div>
                <span className="badge badge-indigo">Active Staff</span>
              </div>
              <div className="stat-mid">
                <div className="stat-title">TOTAL EMPLOYEES</div>
                <div className="stat-value">{employees.length}</div>
              </div>
              <div className="stat-bot">
                <div className="stat-sub">Across all departments</div>
              </div>
            </div>

            <div className="stat-card-v2 stat-purple">
              <div className="stat-top">
                <div className="stat-icon-small bg-purple">
                  <DollarSign size={18} />
                </div>
                <span className="badge badge-purple">Monthly Base</span>
              </div>
              <div className="stat-mid">
                <div className="stat-title">TOTAL MONTHLY PAYROLL</div>
                <div className="stat-value">₹{totalPayroll.toLocaleString()}</div>
              </div>
              <div className="stat-bot">
                <div className="stat-sub">Estimated monthly wage cost</div>
              </div>
            </div>
          </div>

          <div className="card fade-up">
            <div className="table-wrap">
              {loading ? (
                <div className="empty-state">
                  <div className="spinner" />
                </div>
              ) : employees.length === 0 ? (
                <div className="empty-state">
                  <Users size={40} />
                  <p>No employees added yet.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Phone</th>
                      <th>Monthly Wage</th>
                      <th>Joined Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp._id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--indigo), var(--purple))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '13px',
                                flexShrink: 0,
                              }}
                            >
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                              {emp.name}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-indigo">{emp.role}</span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {emp.phone || '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: '#34d399' }}>
                          ₹{emp.salary?.toLocaleString()}/mo
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {emp.joinDate
                            ? new Date(emp.joinDate).toLocaleDateString('en-IN')
                            : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              title="Edit Employee"
                              onClick={() => openEdit(emp)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="btn btn-danger btn-icon btn-sm"
                              title="Deactivate"
                              onClick={() => onDelete(emp._id, emp.name)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Attendance Tab ───────────────────────────────────────────────── */}
      {tab === 'attendance' && (
        <div className="fade-up">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <Calendar size={16} color="var(--text-muted)" />
            <input
              type="date"
              className="form-input"
              style={{ width: '180px' }}
              value={attDate}
              onChange={(e) => setAttDate(e.target.value)}
              max={today}
            />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Mark staff presence and click "Save Attendance"
            </span>
          </div>

          {employees.length === 0 ? (
            <div className="empty-state">
              <p>Add employees first before logging daily attendance.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {employees.map((emp) => (
                <div
                  key={emp._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 20px',
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--indigo), var(--purple))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '14px',
                        flexShrink: 0,
                      }}
                    >
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {emp.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {emp.role} • {emp.phone || 'No phone'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      background: 'rgba(0,0,0,0.3)',
                      padding: '4px',
                      borderRadius: '30px',
                    }}
                  >
                    {ATTENDANCE_STATUSES.map((st) => {
                      const isActive = attendanceMap[emp._id] === st;
                      const clr = ATTENDANCE_COLORS[st];
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            setAttendanceMap((prev) => ({
                              ...prev,
                              [emp._id]: st,
                            }))
                          }
                          style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: `1px solid ${isActive ? clr : 'transparent'}`,
                            background: isActive ? `${clr}22` : 'transparent',
                            color: isActive ? clr : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Employee Form Modal ──────────────────────────────────────────── */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <div className="modal">
            <div className="modal-header">
              <h3>{editing ? 'Edit Employee Info' : 'Add New Staff Member'}</h3>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={onSave}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      name="name"
                      className="form-input"
                      value={form.name}
                      onChange={onChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      name="phone"
                      className="form-input"
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={onChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Designation / Role</label>
                    <input
                      name="role"
                      className="form-input"
                      placeholder="e.g. Cashier, Store Manager"
                      value={form.role}
                      onChange={onChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Monthly Salary (₹)</label>
                    <input
                      name="salary"
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.salary}
                      onChange={onChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Joining Date</label>
                  <input
                    name="joinDate"
                    type="date"
                    className="form-input"
                    value={form.joinDate}
                    onChange={onChange}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: 'auto' }}
                  disabled={saving}
                >
                  {saving ? (
                    <span className="spinner" />
                  ) : editing ? (
                    'Update Staff'
                  ) : (
                    'Add Employee'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
