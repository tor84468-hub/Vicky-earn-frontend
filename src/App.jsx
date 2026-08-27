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
  const [showWelcome, setShowWelcome] = useState(false);

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
      setPage("dashboard");

      if (authMode === "register") {
        setShowWelcome(true);

        setAuth({
          name: "",
          email: "",
          password: "",
        });
      } else {
        setMessage(data.message || "Welcome back!");
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
      <div className="auth-screen">
        <div className="auth-glow glow-one"></div>
        <div className="auth-glow glow-two"></div>

        <div className="auth-card">
          <div className="brand-mark">V</div>

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
              Create account
            </button>
          </div>

          {error && <div className="alert error">{error}</div>}
          {message && <div className="alert success">{message}</div>}

          <form onSubmit={handleAuth}>
            {authMode === "register" && (
              <div className="input-wrap">
                <span>👤</span>
                <input
                  placeholder="Full name"
                  value={auth.name}
                  onChange={(e) =>
                    setAuth({ ...auth, name: e.target.value })
                  }
                  required
                />
              </div>
            )}

            <div className="input-wrap">
              <span>✉️</span>
              <input
                type="email"
                placeholder="Email address"
                value={auth.email}
                onChange={(e) =>
                  setAuth({ ...auth, email: e.target.value })
                }
                required
              />
            </div>

            <div className="input-wrap">
              <span>🔒</span>
              <input
                type="password"
                placeholder="Password"
                value={auth.password}
                onChange={(e) =>
                  setAuth({ ...auth, password: e.target.value })
                }
                required
              />
            </div>

            <button className="primary auth-submit" disabled={loading}>
              {loading
                ? "Please wait..."
                : authMode === "login"
                ? "Login to Vicky Earn"
                : "Create my account"}
            </button>
          </form>

          <div className="auth-footer">
            <span>🔐 Secure account</span>
            <span>⚡ Fast earning</span>
          </div>
        </div>
      </div>
    );
  }

  const balance = wallet?.balance ?? user.balance ?? 0;
  const currentCurrency = wallet?.currency || currency || "NGN";

  const quickActions = [
    {
      icon: "✨",
      title: "Earn",
      text: "Complete tasks",
      page: "earn",
    },
    {
      icon: "💸",
      title: "Transfer",
      text: "Send money",
      page: "transfer",
    },
    {
      icon: "🏦",
      title: "Withdraw",
      text: "Cash out",
      page: "withdraw",
    },
    {
      icon: "📋",
      title: "History",
      text: "Transactions",
      page: "transactions",
    },
  ];

  return (
    <div className="app">
      {showWelcome && (
        <div className="welcome-overlay">
          <div className="sparkle sparkle-one">✦</div>
          <div className="sparkle sparkle-two">✧</div>
          <div className="sparkle sparkle-three">✦</div>
          <div className="sparkle sparkle-four">✧</div>

          <div className="welcome-card">
            <div className="welcome-icon">✨</div>

            <div className="welcome-badge">ACCOUNT CREATED</div>

            <h1>Welcome to<br />Vicky Earn!</h1>

            <p>
              Hey <strong>{user.name}</strong> 👋
              <br />
              Your earning journey starts here.
            </p>

            <div className="welcome-features">
              <span>💰 Earn</span>
              <span>💸 Transfer</span>
              <span>🏦 Withdraw</span>
            </div>

            <button
              className="primary welcome-button"
              onClick={() => setShowWelcome(false)}
            >
              Let's Get Started 🚀
            </button>
          </div>
        </div>
      )}

      <header className="topbar">
        <div className="topbar-inner">
          <div className="top-brand">
            <div className="mini-logo">V</div>
            <div>
              <strong>Vicky Earn</strong>
              <span>Smart earning wallet</span>
            </div>
          </div>

          <div className="user-area">
            <div className="user-avatar">
              {(user.name || "U").charAt(0).toUpperCase()}
            </div>

            <div className="user-name">
              <strong>{user.name}</strong>
              <span>Member</span>
            </div>

            <button className="logout-button" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        {page === "dashboard" && (
          <>
            <section className="hero-heading">
              <div>
                <span className="eyebrow">GOOD TO SEE YOU ✨</span>
                <h1>Welcome, {user.name} 👋</h1>
                <p>Here’s your Vicky Earn overview.</p>
              </div>
            </section>

            <section className="balance-card">
              <div className="balance-top">
                <span>Available balance</span>
                <span className="balance-status">● Active</span>
              </div>

              <div className="balance-amount">
                {Number(balance).toLocaleString()}
                <small>{currentCurrency}</small>
              </div>

              <div className="balance-bottom">
                <span>Wallet account</span>
                <strong>
                  {wallet?.account_id ||
                    user?.account_id ||
                    "Not available"}
                </strong>
              </div>
            </section>

            <section className="quick-actions">
              {quickActions.map((action) => (
                <button
                  className="action-card"
                  key={action.page}
                  onClick={() => setPage(action.page)}
                >
                  <div className="action-icon">{action.icon}</div>
                  <div>
                    <strong>{action.title}</strong>
                    <span>{action.text}</span>
                  </div>
                  <b>›</b>
                </button>
              ))}
            </section>

            <section className="dashboard-grid">
              <div className="card featured-card">
                <div className="card-heading">
                  <div>
                    <span className="card-label">DAILY REWARD</span>
                    <h2>Claim your bonus ✨</h2>
                  </div>
                  <div className="card-icon">🎁</div>
                </div>

                <p>
                  Keep your earning streak going and claim your daily
                  reward.
                </p>

                <button
                  className="primary"
                  onClick={claimDailyBonus}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Claim 10 " + currentCurrency}
                </button>
              </div>

              <div className="card">
                <div className="card-heading">
                  <div>
                    <span className="card-label">RECENT ACTIVITY</span>
                    <h2>Latest transactions</h2>
                  </div>
                  <div className="card-icon">📊</div>
                </div>

                {transactions.length === 0 ? (
                  <div className="empty-state">
                    <span>📭</span>
                    <p>No transactions yet.</p>
                  </div>
                ) : (
                  transactions.slice(0, 5).map((item) => (
                    <div className="list-row" key={item.id}>
                      <div className="transaction-icon">💰</div>
                      <div className="transaction-info">
                        <strong>{item.description}</strong>
                        <span>{item.type}</span>
                      </div>
                      <strong className="transaction-amount">
                        {item.amount} {item.currency}
                      </strong>
                    </div>
                  ))
                )}

                {transactions.length > 0 && (
                  <button
                    className="text-button"
                    onClick={() => setPage("transactions")}
                  >
                    View all transactions →
                  </button>
                )}
              </div>
            </section>
          </>
        )}

        {page !== "dashboard" && (
          <section className="page-header">
            <button
              className="back-button"
              onClick={() => setPage("dashboard")}
            >
              ← Dashboard
            </button>
            <h1>
              {page === "earn" && "Earn Money ✨"}
              {page === "transfer" && "Send Money 💸"}
              {page === "withdraw" && "Withdraw 🏦"}
              {page === "transactions" && "Transaction History 📋"}
              {page === "notifications" && "Notifications 🔔"}
              {page === "profile" && "Your Profile 👤"}
            </h1>
          </section>
        )}

        {page === "earn" && (
          <section>
            <div className="card featured-card">
              <span className="card-label">EARNING CENTER</span>
              <h2>Make your money grow 🚀</h2>
              <p>Complete available tasks and collect rewards.</p>

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
                <div className="card task-card" key={task.id}>
                  <div className="task-icon">⚡</div>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>

                  <strong className="reward">
                    +{task.reward} {currentCurrency}
                  </strong>

                  <button
                    className="primary"
                    onClick={() => completeTask(task.id)}
                    disabled={loading}
                  >
                    Complete Task
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "transfer" && (
          <section className="card form-card">
            <span className="card-label">MONEY TRANSFER</span>
            <h2>Send money securely</h2>

            <form onSubmit={sendTransfer}>
              <label>Recipient Account ID</label>
              <input
                placeholder="Enter Vicky account ID"
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
                className="secondary"
                onClick={findRecipient}
                disabled={loading}
              >
                Find Recipient
              </button>

              {recipient && (
                <div className="recipient">
                  <div className="user-avatar">
                    {(recipient.name || "U").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <strong>{recipient.name}</strong>
                    <span>{recipient.account_id}</span>
                    <span>{recipient.currency}</span>
                  </div>
                </div>
              )}

              <label>Amount</label>
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
                {loading ? "Sending..." : "Send Money 💸"}
              </button>
            </form>
          </section>
        )}

        {page === "withdraw" && (
          <section className="card form-card">
            <span className="card-label">WITHDRAWAL</span>
            <h2>Withdraw your money</h2>

            <form onSubmit={withdraw}>
              <label>Amount</label>
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

              <label>Withdrawal method</label>
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

              <label>Account / phone number</label>
              <input
                placeholder="Enter account or phone number"
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
                {loading ? "Submitting..." : "Submit Withdrawal"}
              </button>
            </form>
          </section>
        )}

        {page === "transactions" && (
          <section className="card">
            {transactions.length === 0 ? (
              <div className="empty-state large">
                <span>📭</span>
                <h3>No transactions yet</h3>
                <p>Your activity will appear here.</p>
              </div>
            ) : (
              transactions.map((item) => (
                <div className="transaction" key={item.id}>
                  <div className="transaction-icon">💰</div>
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
            {notifications.length === 0 ? (
              <div className="empty-state large">
                <span>🔔</span>
                <h3>You're all caught up</h3>
                <p>No notifications right now.</p>
              </div>
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
                      className="secondary"
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
          <section className="card form-card">
            <span className="card-label">ACCOUNT</span>
            <h2>Personal information</h2>

            <form onSubmit={updateProfile}>
              <label>Name</label>
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

              <label>Email</label>
              <input value={profile.email || ""} disabled />

              <button className="primary" disabled={loading}>
                Save Profile
              </button>
            </form>

            <div className="divider"></div>

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

      <nav className="bottom-nav">
        <button
          className={page === "dashboard" ? "active" : ""}
          onClick={() => setPage("dashboard")}
        >
          <span>⌂</span>
          <small>Home</small>
        </button>

        <button
          className={page === "earn" ? "active" : ""}
          onClick={() => setPage("earn")}
        >
          <span>✨</span>
          <small>Earn</small>
        </button>

        <button
          className={page === "transfer" ? "active" : ""}
          onClick={() => setPage("transfer")}
        >
          <span>💸</span>
          <small>Transfer</small>
        </button>

        <button
          className={page === "transactions" ? "active" : ""}
          onClick={() => setPage("transactions")}
        >
          <span>📋</span>
          <small>History</small>
        </button>

        <button
          className={page === "profile" ? "active" : ""}
          onClick={() => setPage("profile")}
        >
          <span>👤</span>
          <small>Profile</small>
        </button>
      </nav>
    </div>
  );
}

export default App;
