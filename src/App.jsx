import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const savedUser = localStorage.getItem("vicky_user");

  const [user, setUser] = useState(
    savedUser ? JSON.parse(savedUser) : null
  );

  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusMessage, setBonusMessage] = useState("");
  const [activeTab, setActiveTab] = useState("home");
  const [currencies, setCurrencies] = useState({});
  const [currencyLoading, setCurrencyLoading] = useState(false);

  // Transfer state
  const [transferOpen, setTransferOpen] = useState(false);
  const [recipientAccountId, setRecipientAccountId] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferQuote, setTransferQuote] = useState(null);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const [transferError, setTransferError] = useState("");

  useEffect(() => {
    if (!user) return;

    localStorage.setItem("vicky_user", JSON.stringify(user));

    fetch(`${API_URL}/api/currencies`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCurrencies(data.currencies);
        }
      })
      .catch(() => {});
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    const endpoint =
      mode === "login"
        ? "/api/auth/login"
        : "/api/auth/register";

    const body =
      mode === "login"
        ? { email, password }
        : { name, email, password };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Something went wrong");
      }

      if (mode === "register") {
        setMessage("Account created successfully. Please login.");
        setMode("login");
        setName("");
        setPassword("");
      } else {
        setUser(data.user);
        setPassword("");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const changeCurrency = async (newCurrency) => {
    if (!newCurrency || newCurrency === user.currency) return;

    setCurrencyLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/user/currency`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.id,
            currency: newCurrency,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Currency update failed");
      }

      setUser(data.user);
      setBonusMessage(
        `Currency changed to ${newCurrency}`
      );
    } catch (error) {
      setBonusMessage(error.message);
    } finally {
      setCurrencyLoading(false);
    }
  };

  const getCurrency = () => {
    return (
      currencies[user.currency] || {
        symbol: user.currency === "USD" ? "$" : "₦",
        flag: "🌍",
        name: user.currency || "Currency",
      }
    );
  };

  const claimDailyBonus = async () => {
    setBonusLoading(true);
    setBonusMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/earn/daily-bonus`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to claim bonus");
      }

      setUser({
        ...user,
        balance: data.balance,
      });

      setBonusMessage(`+₦${data.amount} added to your wallet`);
    } catch (error) {
      setBonusMessage(error.message);
    } finally {
      setBonusLoading(false);
    }
  };

  const openTransfer = () => {
    setTransferOpen(true);
    setRecipientAccountId("");
    setRecipient(null);
    setTransferAmount("");
    setTransferQuote(null);
    setTransferMessage("");
    setTransferError("");
  };

  const closeTransfer = () => {
    if (transferLoading) return;

    setTransferOpen(false);
    setRecipientAccountId("");
    setRecipient(null);
    setTransferAmount("");
    setTransferQuote(null);
    setTransferMessage("");
    setTransferError("");
  };

  const findRecipient = async () => {
    const accountId = recipientAccountId.trim().toUpperCase();

    setTransferError("");
    setTransferMessage("");
    setRecipient(null);
    setTransferQuote(null);

    if (!accountId) {
      setTransferError("Enter the recipient's Account ID.");
      return;
    }

    if (accountId === String(user.account_id || "").toUpperCase()) {
      setTransferError("You cannot transfer money to yourself.");
      return;
    }

    setRecipientLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/transfer/recipient`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account_id: accountId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Recipient Account ID not found."
        );
      }

      setRecipient(data.recipient);
    } catch (error) {
      setTransferError(error.message);
    } finally {
      setRecipientLoading(false);
    }
  };

  const getTransferQuote = async () => {
    setTransferError("");
    setTransferMessage("");
    setTransferQuote(null);

    const amount = Number(transferAmount);

    if (!recipient) {
      setTransferError("Find the recipient first.");
      return;
    }

    if (!amount || amount <= 0) {
      setTransferError("Enter a valid amount.");
      return;
    }

    if (amount > Number(user.balance)) {
      setTransferError("Insufficient balance.");
      return;
    }

    setQuoteLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/transfer/quote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account_id: user.account_id,
            recipient_account_id: recipient.account_id,
            amount,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to calculate transfer."
        );
      }

      setTransferQuote(data.quote);
    } catch (error) {
      setTransferError(error.message);
    } finally {
      setQuoteLoading(false);
    }
  };

  const confirmTransfer = async () => {
    if (!transferQuote) {
      setTransferError("Calculate the transfer amount first.");
      return;
    }

    setTransferLoading(true);
    setTransferError("");
    setTransferMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/transfer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account_id: user.account_id,
            recipient_account_id: recipient.account_id,
            amount: Number(transferAmount),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Transfer failed."
        );
      }

      setUser({
        ...user,
        balance: data.sender.balance,
      });

      setTransferMessage(
        `Sent ${Number(data.sender.amount).toLocaleString()} ${data.sender.currency} to ${data.recipient.name}. They received ${Number(data.recipient.amount).toLocaleString(undefined, {
          maximumFractionDigits: 8,
        })} ${data.recipient.currency}.`
      );

      setTransferAmount("");
      setTransferQuote(null);

    } catch (error) {
      setTransferError(error.message);
    } finally {
      setTransferLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("vicky_user");
    setUser(null);
    setEmail("");
    setPassword("");
    setMessage("");
  };

  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-glow glow-one" />
        <div className="auth-glow glow-two" />

        <div className="auth-container">
          <div className="brand-mark">
            <span>V</span>
          </div>

          <div className="brand-name">Vicky Earn</div>

          <h1>
            {mode === "login"
              ? "Welcome back"
              : "Start earning today"}
          </h1>

          <p className="auth-description">
            {mode === "login"
              ? "Sign in to continue to your wallet."
              : "Create your account and start earning rewards."}
          </p>

          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <div className="field">
                <label>Full name</label>
                <input
                  type="text"
                  placeholder="Victor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="field">
              <label>Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength="6"
              />
            </div>

            <button
              className="primary-button"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          {message && (
            <div className="auth-message">
              {message}
            </div>
          )}

          <div className="auth-switch">
            {mode === "login" ? (
              <>
                New to Vicky Earn?
                <button
                  onClick={() => {
                    setMode("register");
                    setMessage("");
                  }}
                >
                  Create account
                </button>
              </>
            ) : (
              <>
                Already have an account?
                <button
                  onClick={() => {
                    setMode("login");
                    setMessage("");
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="mini-logo">V</div>

          <div>
            <strong>Vicky Earn</strong>
            <span>Earn more. Live better.</span>
          </div>
        </div>

        <button className="notification-button">
          <span>🔔</span>
          <i />
        </button>
      </header>

      <main className="dashboard">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            <h1>{user.name} 👋</h1>
          </div>

          <div className="profile-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>
        </section>

        <section className="wallet-card">
          <div className="wallet-top">
            <span>Available balance</span>

            <button className="eye-button">
              ◉
            </button>
          </div>

          <div className="wallet-balance">
            {getCurrency().symbol}
            {Number(user.balance).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>

          <div className="currency-selector">
            <span>{getCurrency().flag}</span>

            <select
              value={user.currency || "NGN"}
              onChange={(e) => changeCurrency(e.target.value)}
              disabled={currencyLoading}
            >
              {Object.entries(currencies).map(
                ([code, info]) => (
                  <option key={code} value={code}>
                    {code} — {info.name}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="wallet-footer">
            <span>Vicky Earn Wallet</span>
            <span>
              {user.account_id || `VKY-${String(user.id).padStart(6, "0")}`}
            </span>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">↗</div>
            <div>
              <span>Total earned</span>
              <strong>
                {getCurrency().symbol}
                {Number(user.balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">✓</div>
            <div>
              <span>Tasks completed</span>
              <strong>0</strong>
            </div>
          </div>
        </section>

        <section className="actions">
          <button onClick={claimDailyBonus}>
            <div className="action-icon">🎁</div>
            <span>Daily bonus</span>
          </button>

          <button
            onClick={() =>
              alert("Withdrawal system coming next.")
            }
          >
            <div className="action-icon">💸</div>
            <span>Withdraw</span>
          </button>

          <button onClick={openTransfer}>
            <div className="action-icon">↗</div>
            <span>Transfer</span>
          </button>

          <button
            onClick={() =>
              setActiveTab("history")
            }
          >
            <div className="action-icon">☷</div>
            <span>History</span>
          </button>
        </section>

        {bonusMessage && (
          <div className="bonus-alert">
            <span>✓</span>
            {bonusMessage}
          </div>
        )}

        {activeTab === "history" ? (
          <section className="content-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ACTIVITY</p>
                <h2>Recent transactions</h2>
              </div>
            </div>

            <div className="empty-state">
              <div>📊</div>
              <h3>No transactions yet</h3>
              <p>
                Your earning activity will appear here.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="content-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">EARN MORE</p>
                  <h2>Featured opportunities</h2>
                </div>

                <button>View all</button>
              </div>

              <div className="earning-card featured">
                <div className="earning-icon">🎁</div>

                <div className="earning-info">
                  <div className="tag">DAILY</div>
                  <h3>Daily Bonus</h3>
                  <p>
                    Claim your reward once every day.
                  </p>
                </div>

                <button
                  onClick={claimDailyBonus}
                  disabled={bonusLoading}
                  className="earn-button"
                >
                  {bonusLoading ? "..." : "+₦10"}
                </button>
              </div>

              <div className="earning-card">
                <div className="earning-icon purple">📱</div>

                <div className="earning-info">
                  <div className="tag">TASK</div>
                  <h3>Complete Tasks</h3>
                  <p>
                    Complete simple tasks and earn rewards.
                  </p>
                </div>

                <button
                  onClick={() =>
                    alert("Tasks are coming next.")
                  }
                  className="earn-button"
                >
                  Earn
                </button>
              </div>

              <div className="earning-card">
                <div className="earning-icon orange">👥</div>

                <div className="earning-info">
                  <div className="tag">REFER</div>
                  <h3>Invite Friends</h3>
                  <p>
                    Invite friends and earn referral rewards.
                  </p>
                </div>

                <button
                  onClick={() =>
                    alert("Referrals are coming next.")
                  }
                  className="earn-button"
                >
                  Invite
                </button>
              </div>
            </section>

            <section className="referral-banner">
              <div className="referral-icon">👥</div>

              <div>
                <span>REFER & EARN</span>
                <h3>Earn more with friends</h3>
                <p>
                  Invite friends to Vicky Earn.
                </p>
              </div>

              <button
                onClick={() =>
                  alert("Referral system coming next.")
                }
              >
                Invite
              </button>
            </section>
          </>
        )}

        <button className="logout-button" onClick={logout}>
          Log out
        </button>
      </main>

      {transferOpen && (
        <div className="transfer-overlay">
          <div className="transfer-modal">
            <div className="transfer-header">
              <div>
                <p className="eyebrow">SEND MONEY</p>
                <h2>Transfer</h2>
              </div>

              <button
                className="transfer-close"
                onClick={closeTransfer}
                disabled={transferLoading}
              >
                ×
              </button>
            </div>

            <div className="transfer-balance">
              Available:{" "}
              <strong>
                {getCurrency().symbol}
                {Number(user.balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>

            <div className="field">
              <label>Recipient Account ID</label>

              <div className="account-search">
                <input
                  type="text"
                  placeholder="VKY-XXXXXX"
                  value={recipientAccountId}
                  onChange={(e) => {
                    setRecipientAccountId(
                      e.target.value.toUpperCase()
                    );
                    setRecipient(null);
                    setTransferQuote(null);
                    setTransferError("");
                  }}
                />

                <button
                  onClick={findRecipient}
                  disabled={recipientLoading}
                >
                  {recipientLoading ? "..." : "Find"}
                </button>
              </div>
            </div>

            {recipient && (
              <div className="recipient-card">
                <div className="recipient-avatar">
                  {recipient.name.charAt(0).toUpperCase()}
                </div>

                <div>
                  <span>Sending to</span>
                  <strong>{recipient.name}</strong>
                  <small>
                    {recipient.account_id} · {recipient.currency}
                  </small>
                </div>

                <span className="recipient-check">✓</span>
              </div>
            )}

            {recipient && (
              <div className="field">
                <label>
                  Amount ({user.currency})
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => {
                    setTransferAmount(e.target.value);
                    setTransferQuote(null);
                    setTransferError("");
                  }}
                />

                <button
                  className="quote-button"
                  onClick={getTransferQuote}
                  disabled={quoteLoading}
                >
                  {quoteLoading
                    ? "Calculating..."
                    : "Calculate conversion"}
                </button>
              </div>
            )}

            {transferQuote && (
              <div className="transfer-quote">
                <div className="quote-title">
                  Transfer preview
                </div>

                <div className="quote-row">
                  <span>You send</span>
                  <strong>
                    {Number(
                      transferQuote.send_amount
                    ).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    {transferQuote.send_currency}
                  </strong>
                </div>

                <div className="quote-arrow">↓</div>

                <div className="quote-row received">
                  <span>{recipient.name} receives</span>
                  <strong>
                    {Number(
                      transferQuote.receive_amount
                    ).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 8,
                    })}{" "}
                    {transferQuote.receive_currency}
                  </strong>
                </div>

                <div className="quote-rate">
                  1 {transferQuote.send_currency} ≈{" "}
                  {Number(
                    transferQuote.rate
                  ).toLocaleString(undefined, {
                    maximumFractionDigits: 8,
                  })}{" "}
                  {transferQuote.receive_currency}
                </div>

                <button
                  className="primary-button transfer-confirm"
                  onClick={confirmTransfer}
                  disabled={transferLoading}
                >
                  {transferLoading
                    ? "Sending..."
                    : `Confirm transfer to ${recipient.name}`}
                </button>
              </div>
            )}

            {transferError && (
              <div className="transfer-error">
                {transferError}
              </div>
            )}

            {transferMessage && (
              <div className="transfer-success">
                ✓ {transferMessage}
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="bottom-navigation">
        <button
          className={activeTab === "home" ? "active" : ""}
          onClick={() => setActiveTab("home")}
        >
          <span>⌂</span>
          Home
        </button>

        <button
          className={activeTab === "earn" ? "active" : ""}
          onClick={() => setActiveTab("earn")}
        >
          <span>◈</span>
          Earn
        </button>

        <button
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
        >
          <span>▤</span>
          History
        </button>

        <button
          onClick={() =>
            alert("Profile section coming next.")
          }
        >
          <span>◎</span>
          Profile
        </button>
      </nav>
    </div>
  );
}

export default App;
