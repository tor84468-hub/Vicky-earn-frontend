import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "https://vicky-earn-backend.onrender.com";

function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vicky_user")) || null;
    } catch {
      return null;
    }
  });

  const [page, setPage] = useState("dashboard");
  const [authMode, setAuthMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [auth, setAuth] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [wallet, setWallet] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState(null);

  const [withdrawForm, setWithdrawForm] = useState({
    amount: "",
    method: "bank",
    account: "",
  });

  const [transferForm, setTransferForm] = useState({
    recipient_account_id: "",
    amount: "",
  });

  const [recipient, setRecipient] = useState(null);

  const [currency, setCurrency] = useState("");

  function saveUser(nextUser) {
    setUser(nextUser);
    localStorage.setItem("vicky_user", JSON.stringify(nextUser));
  }

  function logout() {
    localStorage.removeItem("vicky_user");
    setUser(null);
    setWallet(null);
    setProfile(null);
    setPage("dashboard");
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await response.json().catch(() => ({
      success: false,
      message: "Invalid server response",
    }));

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  }

  async function loadUserData() {
    if (!user?.id) return;

    try {
      const [
        walletResponse,
        taskResponse,
        transactionResponse,
        notificationResponse,
        profileResponse,
      ] = await Promise.all([
        api(`/api/wallet/${user.id}`),
        api(`/api/earn/tasks`),
        api(`/api/transactions/${user.id}`),
        api(`/api/notifications/${user.id}`),
        api(`/api/profile/${user.id}`),
      ]);

      setWallet(walletResponse.wallet);
      setTasks(taskResponse.tasks || []);
      setTransactions(transactionResponse.transactions || []);
      setNotifications(notificationResponse.notifications || []);
      setProfile(profileResponse.user);
      setCurrency(walletResponse.wallet.currency);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (user?.id) {
      loadUserData();
    }
  }, [user?.id]);

  async function handleAuth(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const path =
        authMode === "login"
          ? "/api/auth/login"
          : "/api/auth/register";

      const body =
        authMode === "login"
          ? {
              email: auth.email,
              password: auth.password,
            }
          : auth;

      const data = await api(path, {
        method: "POST",
        body: JSON.stringify(body),
      });

      saveUser(data.user);
      setMessage(data.message || "Success");
      setPage("dashboard");

      if (authMode === "register") {
        setAuth({
          name: "",
          email: "",
          password: "",
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function claimDailyBonus() {
    if (!user?.id || loading) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/api/earn/daily-bonus", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
        }),
      });

      const nextBalance = Number(data.balance);

      setWallet((current) =>
        current
          ? {
              ...current,
              balance: nextBalance,
            }
          : current
      );

      saveUser({
        ...user,
        balance: nextBalance,
      });

      setMessage(
        `You earned ${data.amount} ${wallet?.currency || "NGN"}`
      );

      await loadUserData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function completeTask(taskId) {
    if (!user?.id) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/api/earn/tasks/complete", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          task_id: taskId,
        }),
      });

      setMessage(`You earned ${data.amount} ${wallet?.currency || ""}`);
      await loadUserData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function findRecipient() {
    setLoading(true);
    setError("");
    setMessage("");
    setRecipient(null);

    try {
      const data = await api("/api/transfer/recipient", {
        method: "POST",
        body: JSON.stringify({
          account_id: transferForm.recipient_account_id,
        }),
      });

      setRecipient(data.recipient);
      setMessage("Recipient found");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendTransfer(event) {
    event.preventDefault();

    if (!user?.id) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/api/transfer", {
        method: "POST",
        body: JSON.stringify({
          account_id: wallet?.account_id,
          recipient_account_id: transferForm.recipient_account_id,
          amount: Number(transferForm.amount),
        }),
      });

      setMessage(
        `Transfer successful. Sent ${data.sender.amount} ${data.sender.currency}.`
      );

      setTransferForm({
        recipient_account_id: "",
        amount: "",
      });

      setRecipient(null);
      await loadUserData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function withdraw(event) {
    event.preventDefault();

    if (!user?.id) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          amount: Number(withdrawForm.amount),
          method: withdrawForm.method,
          account: withdrawForm.account,
        }),
      });

      setMessage(
        `Withdrawal requested: ${data.amount} ${wallet?.currency || ""}`
      );

      setWithdrawForm({
        amount: "",
        method: "bank",
        account: "",
      });

      await loadUserData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeCurrency(event) {
    const nextCurrency = event.target.value;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/api/user/currency", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          currency: nextCurrency,
        }),
      });

      setCurrency(nextCurrency);
      saveUser(data.user);
      setMessage("Currency updated successfully");
      await loadUserData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile(event) {
    event.preventDefault();

    if (!profile?.name) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await api(`/api/profile/${user.id}`, {
        method: "POST",
        body: JSON.stringify({
          name: profile.name,
        }),
      });

      setProfile(data.user);
      saveUser({
        ...user,
        ...data.user,
      });

      setMessage("Profile updated successfully");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function markNotificationRead(id) {
    try {
      await api(`/api/notifications/${id}/read`, {
        method: "POST",
      });

      await loadUserData();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) {
    return (
      <div className="app auth-screen">
        <div className="auth-card">
          <div className="brand">
            <h1>Vicky Earn</h1>
            <p>Earn. Save. Transfer. Withdraw.</p>
          </div>

          <div className="auth-tabs">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>

            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>

          {error && <div className="alert error">{error}</div>}
          {message && <div className="alert success">{message}</div>}

          <form onSubmit={handleAuth}>
            {authMode === "register" && (
              <input
                placeholder="Full name"
                value={auth.name}
                onChange={(e) =>
                  setAuth({ ...auth, name: e.target.value })
                }
                required
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={auth.email}
              onChange={(e) =>
                setAuth({ ...auth, email: e.target.value })
              }
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={auth.password}
              onChange={(e) =>
                setAuth({ ...auth, password: e.target.value })
              }
              required
            />

            <button className="primary" disabled={loading}>
              {loading
                ? "Please wait..."
                : authMode === "login"
                ? "Login"
                : "Create account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const balance = wallet?.balance ?? user.balance ?? 0;
  const currentCurrency = wallet?.currency || currency || "NGN";

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Vicky Earn</h1>
          <span>Welcome, {user.name}</span>
        </div>

        <button onClick={logout}>Logout</button>
      </header>

      <main className="container">
        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        <section className="balance-card">
          <span>Available Balance</span>
          <strong>
            {Number(balance).toLocaleString()} {currentCurrency}
          </strong>

          <small>
            Account ID: {wallet?.account_id || user?.account_id || "Not available"}
          </small>
        </section>

        <nav className="nav">
          {[
            ["dashboard", "Dashboard"],
            ["earn", "Earn"],
            ["transfer", "Transfer"],
            ["withdraw", "Withdraw"],
            ["transactions", "Transactions"],
            ["notifications", "Notifications"],
            ["profile", "Profile"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={page === value ? "active" : ""}
              onClick={() => setPage(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        {page === "dashboard" && (
          <section className="grid">
            <div className="card">
              <h2>Daily Bonus</h2>
              <p>Claim your daily earning.</p>
              <button
                className="primary"
                onClick={claimDailyBonus}
                disabled={loading}
              >
                Claim 10
              </button>
            </div>

            <div className="card">
              <h2>Quick Transfer</h2>
              <p>Send money using a Vicky account ID.</p>
              <button
                className="primary"
                onClick={() => setPage("transfer")}
              >
                Send Money
              </button>
            </div>

            <div className="card">
              <h2>Withdraw</h2>
              <p>Request a withdrawal from your balance.</p>
              <button
                className="primary"
                onClick={() => setPage("withdraw")}
              >
                Withdraw
              </button>
            </div>

            <div className="card">
              <h2>Recent Activity</h2>
              {transactions.slice(0, 5).map((item) => (
                <div className="list-row" key={item.id}>
                  <span>{item.description}</span>
                  <strong>
                    {item.amount} {item.currency}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "earn" && (
          <section>
            <div className="card">
              <h2>Earn Money</h2>

              <button
                className="primary"
                onClick={claimDailyBonus}
                disabled={loading}
              >
                Claim Daily Bonus
              </button>
            </div>

            <div className="grid">
              {tasks.map((task) => (
                <div className="card" key={task.id}>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                  <strong>
                    +{task.reward} {currentCurrency}
                  </strong>

                  <button
                    className="primary"
                    onClick={() => completeTask(task.id)}
                    disabled={loading}
                  >
                    Complete
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "transfer" && (
          <section className="card">
            <h2>Send Money</h2>

            <form onSubmit={sendTransfer}>
              <input
                placeholder="Recipient Account ID"
                value={transferForm.recipient_account_id}
                onChange={(e) =>
                  setTransferForm({
                    ...transferForm,
                    recipient_account_id: e.target.value.toUpperCase(),
                  })
                }
                required
              />

              <button
                type="button"
                onClick={findRecipient}
                disabled={loading}
              >
                Find Recipient
              </button>

              {recipient && (
                <div className="recipient">
                  <strong>{recipient.name}</strong>
                  <span>{recipient.account_id}</span>
                  <span>{recipient.currency}</span>
                </div>
              )}

              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={`Amount in ${currentCurrency}`}
                value={transferForm.amount}
                onChange={(e) =>
                  setTransferForm({
                    ...transferForm,
                    amount: e.target.value,
                  })
                }
                required
              />

              <button
                className="primary"
                type="submit"
                disabled={loading || !recipient}
              >
                Send Money
              </button>
            </form>
          </section>
        )}

        {page === "withdraw" && (
          <section className="card">
            <h2>Withdraw Money</h2>

            <form onSubmit={withdraw}>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={`Amount in ${currentCurrency}`}
                value={withdrawForm.amount}
                onChange={(e) =>
                  setWithdrawForm({
                    ...withdrawForm,
                    amount: e.target.value,
                  })
                }
                required
              />

              <select
                value={withdrawForm.method}
                onChange={(e) =>
                  setWithdrawForm({
                    ...withdrawForm,
                    method: e.target.value,
                  })
                }
              >
                <option value="bank">Bank</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="other">Other</option>
              </select>

              <input
                placeholder="Account / phone number"
                value={withdrawForm.account}
                onChange={(e) =>
                  setWithdrawForm({
                    ...withdrawForm,
                    account: e.target.value,
                  })
                }
                required
              />

              <button className="primary" disabled={loading}>
                Submit Withdrawal
              </button>
            </form>
          </section>
        )}

        {page === "transactions" && (
          <section className="card">
            <h2>Transaction History</h2>

            {transactions.length === 0 ? (
              <p>No transactions yet.</p>
            ) : (
              transactions.map((item) => (
                <div className="transaction" key={item.id}>
                  <div>
                    <strong>{item.type}</strong>
                    <p>{item.description}</p>
                    <small>{item.created_at}</small>
                  </div>

                  <strong>
                    {item.amount > 0 ? "+" : ""}
                    {item.amount} {item.currency}
                  </strong>
                </div>
              ))
            )}
          </section>
        )}

        {page === "notifications" && (
          <section className="card">
            <h2>Notifications</h2>

            {notifications.length === 0 ? (
              <p>No notifications.</p>
            ) : (
              notifications.map((item) => (
                <div
                  className={`notification ${
                    item.read ? "read" : ""
                  }`}
                  key={item.id}
                >
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <small>{item.created_at}</small>

                  {!item.read && (
                    <button
                      onClick={() => markNotificationRead(item.id)}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              ))
            )}
          </section>
        )}

        {page === "profile" && profile && (
          <section className="card">
            <h2>Profile</h2>

            <form onSubmit={updateProfile}>
              <input
                value={profile.name || ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    name: e.target.value,
                  })
                }
                required
              />

              <input value={profile.email || ""} disabled />

              <button className="primary" disabled={loading}>
                Save Profile
              </button>
            </form>

            <hr />

            <label>Wallet Currency</label>

            <select value={currentCurrency} onChange={changeCurrency}>
              <option value="NGN">NGN — Nigerian Naira</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="GHS">GHS — Ghanaian Cedi</option>
              <option value="XOF">XOF — West African CFA Franc</option>
              <option value="CAD">CAD — Canadian Dollar</option>
            </select>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
