import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "https://vicky-earn-backend.onrender.com";

export default function AdminDashboard() {
  const [admin, setAdmin] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vicky_admin")) || null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(
    () => localStorage.getItem("vicky_admin_token") || ""
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
        ...(options.headers || {}),
      },
      ...options,
    });

    const result = await response.json().catch(() => ({
      success: false,
      message: "Invalid server response",
    }));

    if (!response.ok || result.success === false) {
      throw new Error(result.message || "Request failed");
    }

    return result;
  }

  async function login(event) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const result = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const response = await result.json();

      if (!result.ok || !response.success) {
        throw new Error(
          response.message || "Invalid admin email or password"
        );
      }

      localStorage.setItem(
        "vicky_admin",
        JSON.stringify(response.admin)
      );

      localStorage.setItem(
        "vicky_admin_token",
        response.token
      );

      setAdmin(response.admin);
      setToken(response.token);
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    if (!token) return;

    setLoading(true);
    setError("");

    try {
      const result = await request("/api/admin/dashboard");
      setData(result);
    } catch (err) {
      setError(err.message);

      if (
        err.message.toLowerCase().includes("authentication") ||
        err.message.toLowerCase().includes("expired") ||
        err.message.toLowerCase().includes("invalid")
      ) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      if (token) {
        await fetch(`${API_URL}/api/admin/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {}

    localStorage.removeItem("vicky_admin");
    localStorage.removeItem("vicky_admin_token");

    setAdmin(null);
    setToken("");
    setData(null);
  }

  useEffect(() => {
    if (admin && token) {
      loadDashboard();
    }
  }, []);

  if (!admin || !token) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <div className="admin-logo">V</div>

          <h1>Vicky Earn Admin</h1>
          <p>Secure administration dashboard</p>

          <form onSubmit={login}>
            <label>Admin email</label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Admin email"
              required
            />

            <label>Admin password</label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              required
            />

            {error && (
              <div className="admin-error">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Login to Admin"}
            </button>
          </form>

          <a href="/" className="admin-back">
            ← Back to Vicky Earn
          </a>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <div className="admin-brand">
            <div className="admin-mini-logo">V</div>

            <div>
              <h1>Vicky Earn Admin</h1>
              <span>Administration & Monitoring</span>
            </div>
          </div>
        </div>

        <div className="admin-header-actions">
          <span>
            👤 {admin.name}
          </span>

          <button onClick={loadDashboard}>
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>

          <button onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="admin-content">
        {error && (
          <div className="admin-error admin-wide">
            {error}
          </div>
        )}

        <section className="admin-stat-grid">
          <div className="admin-stat">
            <span>👥 Total Users</span>
            <strong>{stats.total_users ?? 0}</strong>
          </div>

          <div className="admin-stat">
            <span>🆕 New Users Today</span>
            <strong>{stats.new_users_today ?? 0}</strong>
          </div>

          <div className="admin-stat">
            <span>💰 User Balances</span>
            <strong>
              {Number(stats.total_balance || 0).toLocaleString()}
            </strong>
          </div>

          <div className="admin-stat profit">
            <span>💵 Admin Profit</span>
            <strong>
              {Number(stats.platform_revenue || 0).toLocaleString()}
            </strong>
          </div>

          <div className="admin-stat">
            <span>🧾 Transactions</span>
            <strong>{stats.total_transactions ?? 0}</strong>
          </div>

          <div className="admin-stat">
            <span>🏦 Withdrawals</span>
            <strong>{stats.total_withdrawals ?? 0}</strong>
          </div>

          <div className="admin-stat warning">
            <span>⏳ Pending Withdrawals</span>
            <strong>{stats.pending_withdrawals ?? 0}</strong>
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <h2>Users</h2>
            <span>{data?.users?.length || 0} accounts</span>
          </div>

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Account ID</th>
                  <th>Balance</th>
                  <th>Currency</th>
                  <th>Joined</th>
                </tr>
              </thead>

              <tbody>
                {(data?.users || []).map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.account_id}</td>
                    <td>{Number(user.balance || 0).toLocaleString()}</td>
                    <td>{user.currency}</td>
                    <td>{user.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <h2>Recent Transactions</h2>
            <span>{data?.transactions?.length || 0}</span>
          </div>

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Amount</th>
                  <th>Currency</th>
                  <th>Description</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {(data?.transactions || []).map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <span className="admin-badge">
                        {tx.type}
                      </span>
                    </td>
                    <td>{tx.name}</td>
                    <td>{tx.email}</td>
                    <td>{Number(tx.amount || 0).toLocaleString()}</td>
                    <td>{tx.currency}</td>
                    <td>{tx.description}</td>
                    <td>{tx.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <h2>Withdrawals</h2>
            <span>{data?.withdrawals?.length || 0}</span>
          </div>

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Amount</th>
                  <th>Currency</th>
                  <th>Method</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {(data?.withdrawals || []).map((withdrawal) => (
                  <tr key={withdrawal.id}>
                    <td>{withdrawal.id}</td>
                    <td>{withdrawal.name}</td>
                    <td>{withdrawal.email}</td>
                    <td>
                      {Number(
                        withdrawal.amount || 0
                      ).toLocaleString()}
                    </td>
                    <td>{withdrawal.currency}</td>
                    <td>{withdrawal.method}</td>
                    <td>{withdrawal.account}</td>
                    <td>
                      <span
                        className={
                          withdrawal.status === "pending"
                            ? "admin-status pending"
                            : "admin-status"
                        }
                      >
                        {withdrawal.status}
                      </span>
                    </td>
                    <td>{withdrawal.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <h2>Platform Revenue</h2>
            <span>
              {data?.revenue?.length || 0} records
            </span>
          </div>

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Currency</th>
                  <th>Description</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {(data?.revenue || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.type}</td>
                    <td>
                      {Number(item.amount || 0).toLocaleString()}
                    </td>
                    <td>{item.currency}</td>
                    <td>{item.description}</td>
                    <td>{item.created_at}</td>
                  </tr>
                ))}

                {(!data?.revenue ||
                  data.revenue.length === 0) && (
                  <tr>
                    <td colSpan="5" className="admin-empty">
                      No platform revenue recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
