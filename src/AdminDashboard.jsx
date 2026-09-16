import { useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://vicky-earn-backend.onrender.com";


function base64urlToBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const binary = atob(base64);

  return Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0)
  );
}

function bytesToBase64url(bytes) {
  const binary = Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join("");

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function prepareCreationOptions(options) {
  return {
    ...options,
    challenge: base64urlToBytes(options.challenge),
    user: {
      ...options.user,
      id: base64urlToBytes(options.user.id),
    },
    excludeCredentials: (
      options.excludeCredentials || []
    ).map((item) => ({
      ...item,
      id: base64urlToBytes(item.id),
    })),
  };
}

function prepareAuthenticationOptions(options) {
  return {
    ...options,
    challenge: base64urlToBytes(options.challenge),
    allowCredentials: (
      options.allowCredentials || []
    ).map((item) => ({
      ...item,
      id: base64urlToBytes(item.id),
    })),
  };
}

function credentialToJSON(credential) {
  const response = credential.response;

  const result = {
    id: credential.id,
    rawId: bytesToBase64url(
      new Uint8Array(credential.rawId)
    ),
    type: credential.type,
    response: {},
  };

  if (response.clientDataJSON) {
    result.response.clientDataJSON =
      bytesToBase64url(
        new Uint8Array(response.clientDataJSON)
      );
  }

  if (response.attestationObject) {
    result.response.attestationObject =
      bytesToBase64url(
        new Uint8Array(response.attestationObject)
      );
  }

  if (response.authenticatorData) {
    result.response.authenticatorData =
      bytesToBase64url(
        new Uint8Array(response.authenticatorData)
      );
  }

  if (response.signature) {
    result.response.signature =
      bytesToBase64url(
        new Uint8Array(response.signature)
      );
  }

  if (response.userHandle) {
    result.response.userHandle =
      bytesToBase64url(
        new Uint8Array(response.userHandle)
      );
  }

  return result;
}

async function registerAdminFingerprint(token) {
  if (
    !window.PublicKeyCredential ||
    !navigator.credentials
  ) {
    throw new Error(
      "Fingerprint/passkey authentication is not supported on this device."
    );
  }

  const response = await fetch(
    `${API_URL}/api/admin/webauthn/register/options`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const options = await response.json();

  if (!response.ok || options.success === false) {
    throw new Error(
      options.error ||
      options.message ||
      "Unable to start fingerprint registration."
    );
  }

  const credential =
    await navigator.credentials.create({
      publicKey: prepareCreationOptions(options),
    });

  if (!credential) {
    throw new Error(
      "Fingerprint registration was cancelled."
    );
  }

  const verifyResponse = await fetch(
    `${API_URL}/api/admin/webauthn/register/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(
        credentialToJSON(credential)
      ),
    }
  );

  const result = await verifyResponse.json();

  if (!verifyResponse.ok || result.success === false) {
    throw new Error(
      result.error ||
      result.message ||
      "Fingerprint registration failed."
    );
  }

  return result;
}

async function loginWithAdminFingerprint() {
  if (
    !window.PublicKeyCredential ||
    !navigator.credentials
  ) {
    throw new Error(
      "Fingerprint/passkey authentication is not supported on this device."
    );
  }

  const response = await fetch(
    `${API_URL}/api/admin/webauthn/login/options`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  const options = await response.json();

  if (!response.ok || options.success === false) {
    throw new Error(
      options.error ||
      options.message ||
      "Unable to start fingerprint login."
    );
  }

  const credential =
    await navigator.credentials.get({
      publicKey:
        prepareAuthenticationOptions(options),
    });

  if (!credential) {
    throw new Error(
      "Fingerprint login was cancelled."
    );
  }

  const verifyResponse = await fetch(
    `${API_URL}/api/admin/webauthn/login/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        credentialToJSON(credential)
      ),
    }
  );

  const result = await verifyResponse.json();

  if (!verifyResponse.ok || result.success === false) {
    throw new Error(
      result.error ||
      result.message ||
      "Admin fingerprint login failed."
    );
  }

  return result;
}

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

  const [adminAvatarUploading, setAdminAvatarUploading] = useState(false);

  const [adminLocked, setAdminLocked] = useState(false);

  const [adminFingerprintLoading, setAdminFingerprintLoading] =
    useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Invalid admin email or password"
        );
      }

      localStorage.setItem(
        "vicky_admin",
        JSON.stringify(result.admin)
      );

      localStorage.setItem(
        "vicky_admin_token",
        result.token
      );

      setAdmin(result.admin);
      setToken(result.token);
      setPassword("");
      setAdminLocked(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadAdminAvatar(file) {
    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      alert("Only JPG, PNG, and WebP images are allowed.");
      return;
    }

    try {
      setAdminAvatarUploading(true);

      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch(
        `${API_URL}/api/admin/profile/avatar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
          "Failed to update admin profile picture."
        );
      }

      const updatedAdmin = {
        ...admin,
        avatar_url: result.avatar_url,
      };

      setAdmin(updatedAdmin);

      localStorage.setItem(
        "vicky_admin",
        JSON.stringify(updatedAdmin)
      );

      alert("Admin profile picture updated successfully.");
    } catch (error) {
      alert(
        error?.message ||
        "Failed to update admin profile picture."
      );
    } finally {
      setAdminAvatarUploading(false);
    }
  }

  async function enableAdminFingerprint() {
    if (!token) return;

    try {
      setAdminFingerprintLoading(true);
      setError("");

      await registerAdminFingerprint(token);

      alert(
        "Fingerprint login enabled successfully."
      );
    } catch (err) {
      setError(
        err?.message ||
        "Failed to enable admin fingerprint login."
      );
    } finally {
      setAdminFingerprintLoading(false);
    }
  }

  async function unlockAdminDashboard() {
    try {
      setAdminFingerprintLoading(true);
      setError("");

      const result =
        await loginWithAdminFingerprint();

      if (!result?.admin || !result?.token) {
        throw new Error(
          "Fingerprint login returned an invalid admin session."
        );
      }

      localStorage.setItem(
        "vicky_admin",
        JSON.stringify(result.admin)
      );

      localStorage.setItem(
        "vicky_admin_token",
        result.token
      );

      setAdmin(result.admin);
      setToken(result.token);
      setAdminLocked(false);
    } catch (err) {
      setError(
        err?.message ||
        "Fingerprint or phone security verification failed."
      );
    } finally {
      setAdminFingerprintLoading(false);
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

      const msg = err.message.toLowerCase();

      if (
        msg.includes("authentication") ||
        msg.includes("expired") ||
        msg.includes("invalid")
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
    setAdminLocked(false);
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
          <div className="admin-login-logo">V</div>

          <div className="admin-login-brand">
            <strong>VICKY EARN</strong>
            <span>ADMINISTRATION</span>
          </div>

          <div className="admin-login-heading">
            <h1>Administrator Login</h1>
            <p>Sign in to manage your Vicky Earn platform.</p>
          </div>

          <form onSubmit={login}>
            <label>ADMIN EMAIL</label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter admin email"
              autoComplete="username"
              required
            />

            <label>ADMIN PASSWORD</label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoComplete="current-password"
              required
            />

            {error && (
              <div className="admin-error">
                {error}
              </div>
            )}

            <button
              className="admin-login-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "AUTHENTICATING..." : "SIGN IN"}
            </button>
          </form>

          <a href="/" className="admin-back">
            ← Return to Vicky Earn
          </a>

          <div className="admin-login-footer">
            Authorized administration only
          </div>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const users = data?.users || [];
  const transactions = data?.transactions || [];
  const withdrawals = data?.withdrawals || [];
  const revenue = data?.revenue || [];

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-mini-logo">V</div>

          <div>
            <h1>Vicky Earn</h1>
            <span>Administration Console</span>
          </div>
        </div>

        <div className="admin-header-right">
          <div className="admin-user">
            <label
              className="admin-user-icon"
              style={{
                cursor: adminAvatarUploading
                  ? "wait"
                  : "pointer",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative"
              }}
              title="Change admin profile picture"
            >
              {admin?.avatar_url ? (
                <img
                  src={admin.avatar_url}
                  alt="Admin Profile"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%"
                  }}
                />
              ) : (
                "A"
              )}

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                disabled={adminAvatarUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];

                  if (file) {
                    uploadAdminAvatar(file);
                  }

                  e.target.value = "";
                }}
              />
            </label>

            <div>
              <strong>{admin.name}</strong>
              <span>Administrator</span>
            </div>
          </div>

          <button
            className="admin-refresh"
            onClick={loadDashboard}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>

          <button
            type="button"
            onClick={enableAdminFingerprint}
            disabled={adminFingerprintLoading}
          >
            {adminFingerprintLoading
              ? "Setting up..."
              : "🔐 Enable Fingerprint Login"}
          </button>

          <button
            className="admin-logout"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="admin-content">
        <div className="admin-page-title">
          <div>
            <span className="admin-eyebrow">
              VICKY EARN / ADMIN
            </span>

            <h2>Dashboard Overview</h2>

            <p>
              Monitor users, transactions, withdrawals and
              platform revenue.
            </p>
          </div>

          <div className="admin-status">
            <span></span>
            SYSTEM OPERATIONAL
          </div>
        </div>

        {error && (
          <div className="admin-error admin-wide">
            {error}
          </div>
        )}

        <section className="admin-stat-grid">
          <div className="admin-stat-card">
            <span className="admin-stat-icon">01</span>
            <small>TOTAL USERS</small>
            <strong>{stats.total_users ?? 0}</strong>
            <em>Registered accounts</em>
          </div>

          <div className="admin-stat-card">
            <span className="admin-stat-icon">02</span>
            <small>NEW USERS TODAY</small>
            <strong>{stats.new_users_today ?? 0}</strong>
            <em>Created today</em>
          </div>

          <div className="admin-stat-card">
            <span className="admin-stat-icon">03</span>
            <small>USER BALANCES</small>
            <strong>
              {Number(
                stats.total_balance || 0
              ).toLocaleString()}
            </strong>
            <em>Combined wallet balance</em>
          </div>

          <div className="admin-stat-card admin-profit-card">
            <span className="admin-stat-icon">04</span>
            <small>ADMIN PROFIT</small>
            <strong>
              {Number(
                stats.platform_revenue || 0
              ).toLocaleString()}
            </strong>
            <em>Platform revenue</em>
          </div>

          <div className="admin-stat-card">
            <span className="admin-stat-icon">05</span>
            <small>TRANSACTIONS</small>
            <strong>
              {stats.total_transactions ?? 0}
            </strong>
            <em>Total transactions</em>
          </div>

          <div className="admin-stat-card">
            <span className="admin-stat-icon">06</span>
            <small>WITHDRAWALS</small>
            <strong>
              {stats.total_withdrawals ?? 0}
            </strong>
            <em>Total withdrawal requests</em>
          </div>

          <div className="admin-stat-card admin-warning-card">
            <span className="admin-stat-icon">07</span>
            <small>PENDING WITHDRAWALS</small>
            <strong>
              {stats.pending_withdrawals ?? 0}
            </strong>
            <em>Require attention</em>
          </div>
        </section>

        <AdminSection
          title="Registered Users"
          subtitle="Customer accounts currently registered"
          count={`${users.length} accounts`}
        >
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>NAME</th>
                  <th>EMAIL</th>
                  <th>ACCOUNT ID</th>
                  <th>BALANCE</th>
                  <th>CURRENCY</th>
                  <th>JOINED</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>#{user.id}</td>
                    <td className="admin-name-cell">
                      {user.name}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <span className="admin-account-id">
                        {user.account_id || "—"}
                      </span>
                    </td>
                    <td>
                      {Number(
                        user.balance || 0
                      ).toLocaleString()}
                    </td>
                    <td>{user.currency || "NGN"}</td>
                    <td>{user.created_at || "—"}</td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <EmptyRow
                    colSpan="7"
                    text="No registered users found."
                  />
                )}
              </tbody>
            </table>
          </div>
        </AdminSection>

        <AdminSection
          title="Recent Transactions"
          subtitle="Latest activity across user wallets"
          count={`${transactions.length} records`}
        >
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TYPE</th>
                  <th>USER</th>
                  <th>EMAIL</th>
                  <th>AMOUNT</th>
                  <th>CURRENCY</th>
                  <th>DESCRIPTION</th>
                  <th>DATE</th>
                </tr>
              </thead>

              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <span className="admin-badge">
                        {tx.type}
                      </span>
                    </td>
                    <td>{tx.name}</td>
                    <td>{tx.email}</td>
                    <td className="admin-money">
                      {Number(
                        tx.amount || 0
                      ).toLocaleString()}
                    </td>
                    <td>{tx.currency}</td>
                    <td>{tx.description || "—"}</td>
                    <td>{tx.created_at || "—"}</td>
                  </tr>
                ))}

                {transactions.length === 0 && (
                  <EmptyRow
                    colSpan="7"
                    text="No transactions recorded yet."
                  />
                )}
              </tbody>
            </table>
          </div>
        </AdminSection>

        <AdminSection
          title="Withdrawals"
          subtitle="Review customer cash-out requests"
          count={`${withdrawals.length} records`}
        >
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>USER</th>
                  <th>EMAIL</th>
                  <th>AMOUNT</th>
                  <th>CURRENCY</th>
                  <th>METHOD</th>
                  <th>ACCOUNT</th>
                  <th>STATUS</th>
                  <th>DATE</th>
                </tr>
              </thead>

              <tbody>
                {withdrawals.map((withdrawal) => (
                  <tr key={withdrawal.id}>
                    <td>#{withdrawal.id}</td>
                    <td>{withdrawal.name}</td>
                    <td>{withdrawal.email}</td>
                    <td className="admin-money">
                      {Number(
                        withdrawal.amount || 0
                      ).toLocaleString()}
                    </td>
                    <td>{withdrawal.currency}</td>
                    <td>{withdrawal.method}</td>
                    <td>{withdrawal.account}</td>
                    <td>
                      <span
                        className={`admin-status-badge ${
                          withdrawal.status === "pending"
                            ? "pending"
                            : withdrawal.status === "completed"
                            ? "completed"
                            : "other"
                        }`}
                      >
                        {withdrawal.status}
                      </span>
                    </td>
                    <td>{withdrawal.created_at || "—"}</td>
                  </tr>
                ))}

                {withdrawals.length === 0 && (
                  <EmptyRow
                    colSpan="9"
                    text="No withdrawals recorded yet."
                  />
                )}
              </tbody>
            </table>
          </div>
        </AdminSection>

        <AdminSection
          title="Platform Revenue"
          subtitle="Revenue generated by the platform"
          count={`${revenue.length} records`}
        >
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TYPE</th>
                  <th>AMOUNT</th>
                  <th>CURRENCY</th>
                  <th>DESCRIPTION</th>
                  <th>DATE</th>
                </tr>
              </thead>

              <tbody>
                {revenue.map((item) => (
                  <tr key={item.id}>
                    <td>{item.type}</td>
                    <td className="admin-money">
                      {Number(
                        item.amount || 0
                      ).toLocaleString()}
                    </td>
                    <td>{item.currency}</td>
                    <td>{item.description || "—"}</td>
                    <td>{item.created_at || "—"}</td>
                  </tr>
                ))}

                {revenue.length === 0 && (
                  <EmptyRow
                    colSpan="5"
                    text="No platform revenue recorded yet."
                  />
                )}
              </tbody>
            </table>
          </div>
        </AdminSection>

        <footer className="admin-footer">
          <span>VICKY EARN</span>
          <span>Administrative Console</span>
          <span>© {new Date().getFullYear()}</span>
        </footer>
      </main>
    </div>
  );
}

function AdminSection({ title, subtitle, count, children }) {
  return (
    <section className="admin-section">
      <div className="admin-section-title">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <span>{count}</span>
      </div>

      {children}
    </section>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="admin-empty">
        {text}
      </td>
    </tr>
  );
}
