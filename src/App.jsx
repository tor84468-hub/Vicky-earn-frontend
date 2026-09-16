import { useEffect, useState } from "react";
import "./App.css";
import AdminDashboard from "./AdminDashboard";

const API_URL = import.meta.env.VITE_API_URL || "https://vicky-earn-backend.onrender.com";


async function loadVicBalance(address) {
  if (!address) return;
  setVicLoading(true);
  setVicError("");

  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || "/api"}/vickycoin/balance/${encodeURIComponent(address)}`
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Unable to load VIC balance");
    }

    setVicBalance(data);
  } catch (error) {
    setVicError(error.message);
  } finally {
    setVicLoading(false);
  }
}


function webauthnBase64ToBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function webauthnBytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function webauthnPrepareRegistrationOptions(options) {
  const publicKey = {
    ...options,
    challenge: webauthnBase64ToBytes(options.challenge),
    user: {
      ...options.user,
      id: webauthnBase64ToBytes(options.user.id),
    },
  };

  if (Array.isArray(options.excludeCredentials)) {
    publicKey.excludeCredentials = options.excludeCredentials.map(
      (item) => ({
        ...item,
        id: webauthnBase64ToBytes(item.id),
      })
    );
  }

  return publicKey;
}

function webauthnPrepareAuthenticationOptions(options) {
  const publicKey = {
    ...options,
    challenge: webauthnBase64ToBytes(options.challenge),
  };

  if (Array.isArray(options.allowCredentials)) {
    publicKey.allowCredentials = options.allowCredentials.map(
      (item) => ({
        ...item,
        id: webauthnBase64ToBytes(item.id),
      })
    );
  }

  return publicKey;
}

function webauthnRegistrationCredentialToJSON(credential) {
  return {
    id: credential.id,
    rawId: webauthnBytesToBase64(credential.rawId),
    response: {
      clientDataJSON: webauthnBytesToBase64(
        credential.response.clientDataJSON
      ),
      attestationObject: webauthnBytesToBase64(
        credential.response.attestationObject
      ),
    },
    type: credential.type,
  };
}

function webauthnAuthenticationCredentialToJSON(credential) {
  return {
    id: credential.id,
    rawId: webauthnBytesToBase64(credential.rawId),
    response: {
      authenticatorData: webauthnBytesToBase64(
        credential.response.authenticatorData
      ),
      clientDataJSON: webauthnBytesToBase64(
        credential.response.clientDataJSON
      ),
      signature: webauthnBytesToBase64(
        credential.response.signature
      ),
      userHandle: credential.response.userHandle
        ? webauthnBytesToBase64(credential.response.userHandle)
        : null,
    },
    type: credential.type,
  };
}

async function enableFingerprintLogin(sessionToken) {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error(
      "Fingerprint/passkey login is not supported on this browser."
    );
  }

  const optionsResponse = await fetch(
    `${API_URL}/api/auth/webauthn/register/options`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    }
  );

  const options = await optionsResponse.json();

  if (!optionsResponse.ok) {
    throw new Error(
      options.error || "Unable to start fingerprint registration."
    );
  }

  const credential = await navigator.credentials.create({
    publicKey: webauthnPrepareRegistrationOptions(options),
  });

  if (!credential) {
    throw new Error("Fingerprint registration was cancelled.");
  }

  const verifyResponse = await fetch(
    `${API_URL}/api/auth/webauthn/register/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(
        webauthnRegistrationCredentialToJSON(credential)
      ),
    }
  );

  const result = await verifyResponse.json();

  if (!verifyResponse.ok) {
    throw new Error(
      result.error || "Fingerprint registration failed."
    );
  }

  return result;
}

async function loginWithFingerprint() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error(
      "Fingerprint/passkey login is not supported on this browser."
    );
  }

  const optionsResponse = await fetch(
    `${API_URL}/api/auth/webauthn/login/options`,
    {
      method: "POST",
    }
  );

  const options = await optionsResponse.json();

  if (!optionsResponse.ok) {
    throw new Error(
      options.error || "Unable to start fingerprint login."
    );
  }

  const credential = await navigator.credentials.get({
    publicKey: webauthnPrepareAuthenticationOptions(options),
  });

  if (!credential) {
    throw new Error("Fingerprint login was cancelled.");
  }

  const verifyResponse = await fetch(
    `${API_URL}/api/auth/webauthn/login/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        webauthnAuthenticationCredentialToJSON(credential)
      ),
    }
  );

  const result = await verifyResponse.json();

  if (!verifyResponse.ok) {
    throw new Error(
      result.error || "Fingerprint login failed."
    );
  }

  return result;
}

function App() {
  if (window.location.pathname === "/admin") {
    return <AdminDashboard />;
  }

  const [user, setUser] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [appLocked, setAppLocked] = useState(
    !!localStorage.getItem("vicky_session_token")
  );
  const [unlockingApp, setUnlockingApp] = useState(false);

  const SESSION_KEY = "vicky_session_token";

  const [page, setPage] = useState("dashboard");
  const [authMode, setAuthMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [appInstalled, setAppInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleAppInstalled = () => {
      setAppInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    setAppInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;

    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }
  const [showWelcome, setShowWelcome] = useState(false);

  const [auth, setAuth] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [wallet, setWallet] = useState(null);
  const [vicBalance, setVicBalance] = useState(null);
  const [vicLoading, setVicLoading] = useState(false);
  const [vicError, setVicError] = useState("");

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

  function saveUser(nextUser, token) {
    setUser(nextUser);

    if (token) {
      localStorage.setItem(SESSION_KEY, token);
    }
  }

  async function logout() {
    const token = localStorage.getItem(SESSION_KEY);

    try {
      if (token) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Continue logout locally even if the server is unavailable.
    }

    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setWallet(null);
    setProfile(null);
    setTasks([]);
    setTransactions([]);
    setNotifications([]);
    setPage("dashboard");
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem(SESSION_KEY);

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
        ...(options.headers || {}),
      },
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

      const freshUser = profileResponse.user;

      if (!freshUser?.id) {
        throw new Error("Invalid user session");
      }

      const updatedUser = {
        ...user,
        ...freshUser,
      };

      saveUser(updatedUser);

      setWallet(walletResponse.wallet);
      setTasks(taskResponse.tasks || []);
      setTransactions(transactionResponse.transactions || []);
      setNotifications(notificationResponse.notifications || []);
      setProfile(freshUser);
      setCurrency(walletResponse.wallet?.currency || freshUser.currency || "NGN");
      setError("");
    } catch (err) {
      console.error("Failed to load user data:", err);

      if (
        err.message === "User not found" ||
        err.message === "Invalid user session"
      ) {
        localStorage.removeItem("vicky_user");
        setUser(null);
        setWallet(null);
        setProfile(null);
        setTransactions([]);
        setNotifications([]);
        setError("Your saved login session expired. Please log in again.");
      } else {
        setError(err.message);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = localStorage.getItem(SESSION_KEY);

      if (!token) {
        if (!cancelled) {
          setSessionReady(true);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/auth/session`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.success || !data?.user) {
          localStorage.removeItem(SESSION_KEY);

          if (!cancelled) {
            setUser(null);
          }

          return;
        }

        if (!cancelled) {
          setUser(data.user);
          setAppLocked(true);
        }
      } catch (err) {
        console.error("Session restore failed:", err);
      } finally {
        if (!cancelled) {
          setSessionReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionReady && user?.id) {
      loadUserData();
    }
  }, [sessionReady, user?.id]);

  async function handleAuth(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (authMode === "register") {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: auth.name,
            email: auth.email,
            password: auth.password,
          }),
        });

        if (!data?.user || !data?.session_token) {
          throw new Error("Account creation returned an invalid session.");
        }

        // Immediately bind this account to the phone's secure
        // biometric/device-PIN authenticator.
        const credentialData = await registerWebAuthn(data.session_token);

        if (!credentialData?.success) {
          throw new Error(
            credentialData?.error ||
            "Phone security registration was not completed."
          );
        }

        saveUser(data.user, data.session_token);
        setPage("dashboard");
        setShowWelcome(true);
        setAuth({
          name: "",
          email: "",
          password: "",
        });
        setMessage("Account created and phone security enabled.");
      } else {
        throw new Error(
          "Password login is disabled. Use fingerprint, face unlock, or your secure phone PIN."
        );
      }
    } catch (err) {
      setError(err?.message || "Authentication failed.");
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
      saveUser(data.user, data.session_token || data.token || "");
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

            {authMode === "register" ? (
              <button className="primary auth-submit" disabled={loading}>
                {loading
                  ? "Setting up phone security..."
                  : "Create account & secure phone"}
              </button>
            ) : (
              <button
                type="button"
                className="primary auth-submit"
                disabled={loading}
                onClick={async () => {
                  try {
                    setLoading(true);
                    setError("");
                    setMessage("");

                    const data = await loginWithFingerprint();

                    if (!data?.user || !data?.session_token) {
                      throw new Error(
                        "Phone security login returned an invalid session."
                      );
                    }

                    saveUser(data.user, data.session_token);
                    setPage("dashboard");
                    setMessage("Phone security login successful.");
                  } catch (err) {
                    setError(
                      err?.message ||
                      "Phone security login failed."
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading
                  ? "Verifying phone security..."
                  : "🔐 Unlock with fingerprint / phone security"}
              </button>
            )}
          </form>

          

<div className="auth-footer">
            <span>🔐 Secure account</span>
            <span>⚡ Fast earning</span>
          </div>
        </div>
      </div>
    );
  }

  async function unlockVickyEarn() {
    try {
      setUnlockingApp(true);
      setError("");

      const data = await loginWithFingerprint();

      if (!data?.user || !data?.session_token) {
        throw new Error("Fingerprint unlock returned an invalid session.");
      }

      saveUser(data.user, data.session_token);
      setAppLocked(false);
    } catch (err) {
      setError(
        err?.message ||
        "Fingerprint or phone security verification failed."
      );
    } finally {
      setUnlockingApp(false);
    }
  }

  async function handleEnableFingerprint() {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const token = localStorage.getItem(SESSION_KEY);

      if (!token) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const result = await enableFingerprintLogin(token);
    localStorage.setItem("vicky_fingerprint_lock", "enabled");
    setAppLocked(true);

      setMessage(
        result?.message || "Fingerprint login enabled successfully."
      );
    } catch (err) {
      setError(
        err?.message || "Could not enable fingerprint login."
      );
    } finally {
      setLoading(false);
    }
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

  if (appLocked) {
    return (
      <div
        className="app"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: "420px" }}>
          <div style={{ fontSize: "64px", marginBottom: "18px" }}>
            🔐
          </div>

          <h1>Vicky Earn is locked</h1>

          <p style={{ opacity: 0.75, marginBottom: "28px" }}>
            Verify your fingerprint or phone security to continue.
          </p>

          {error && (
            <div style={{ marginBottom: "18px" }}>
              {error}
            </div>
          )}

          <button
            type="button"
            className="primary auth-submit"
            onClick={unlockVickyEarn}
            disabled={unlockingApp}
          >
            {unlockingApp
              ? "Verifying..."
              : "🔐 Unlock Vicky Earn"}
          </button>

          <p style={{ marginTop: "18px", fontSize: "13px", opacity: 0.65 }}>
            Use your fingerprint or your phone's secure PIN/passcode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
<div style={{
  display: "flex",
  justifyContent: "flex-end",
  padding: "10px 16px"
}}>
  <button
    type="button"
    className="secondary"
    onClick={handleEnableFingerprint}
    disabled={loading}
  >
    {loading ? "Please wait..." : "🔐 Enable fingerprint login"}
  </button>
</div>


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
              {user?.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt="Profile"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: "50%"
                          }}
                        />
                      ) : (
                        (user.name || "U").charAt(0).toUpperCase()
                      )}
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
            {installPrompt && !appInstalled && (
              <button className="install-app-button" onClick={installApp}>
                📲 Install Vicky Earn
              </button>
            )}
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
                <select
                  className="balance-currency"
                  value={currentCurrency}
                  onChange={changeCurrency}
                  aria-label="Change currency"
                >
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="GHS">GHS</option>
                  <option value="XOF">XOF</option>
                  <option value="CAD">CAD</option>
<option value="VIC">VIC — Vicky Coin</option>
                </select>
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
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "18px",
                    marginBottom: "24px"
                  }}>
                    <div style={{
                      width: "88px",
                      height: "88px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255,255,255,0.08)",
                      border: "2px solid rgba(255,255,255,0.12)",
                      flexShrink: 0
                    }}>
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt="Profile"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover"
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: "38px" }}>👤</span>
                      )}
                    </div>

                    <div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={loading}
                        onClick={() =>
                          document
                            .getElementById("profile-avatar-input")
                            ?.click()
                        }
                      >
                        {loading ? "Uploading..." : "📷 Change Profile Picture"}
                      </button>

                      <input
                        id="profile-avatar-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];

                          if (!file) return;

                          try {
                            setLoading(true);
                            setError("");
                            setMessage("");

                            const token = localStorage.getItem(SESSION_KEY);

                            if (!token) {
                              throw new Error(
                                "Your session has expired. Please log in again."
                              );
                            }

                            const formData = new FormData();
                            formData.append("avatar", file);

                            const response = await fetch(
                              `${API_URL}/api/profile/${user.id}/avatar`,
                              {
                                method: "POST",
                                headers: {
                                  Authorization: `Bearer ${token}`
                                },
                                body: formData
                              }
                            );

                            const data = await response.json().catch(() => null);

                            if (!response.ok || !data?.success) {
                              throw new Error(
                                data?.message ||
                                "Profile picture upload failed."
                              );
                            }

                            setProfile({
                              ...profile,
                              avatar_url: data.avatar_url
                            });

                            setUser({
                              ...user,
                              avatar_url: data.avatar_url
                            });

                            setMessage(
                              "Profile picture updated successfully."
                            );
                          } catch (err) {
                            setError(
                              err?.message ||
                              "Profile picture upload failed."
                            );
                          } finally {
                            setLoading(false);
                            e.target.value = "";
                          }
                        }}
                      />

                      <p style={{
                        marginTop: "8px",
                        fontSize: "12px",
                        opacity: 0.65
                      }}>
                        JPG, PNG or WebP
                      </p>
                    </div>
                  </div>

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
