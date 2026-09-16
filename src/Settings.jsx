import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const SESSION_KEY = "vicky_session_token";

function authHeaders() {
  const token = localStorage.getItem(SESSION_KEY);
  return token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : {
        "Content-Type": "application/json",
      };
}

function base64urlToBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64url(bytes) {
  let binary = "";
  const array = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  array.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function publicKeyForCreate(options) {
  const publicKey = { ...options };

  if (publicKey.challenge) {
    publicKey.challenge = base64urlToBytes(publicKey.challenge);
  }

  if (publicKey.user?.id) {
    publicKey.user = {
      ...publicKey.user,
      id: base64urlToBytes(publicKey.user.id),
    };
  }

  if (Array.isArray(publicKey.excludeCredentials)) {
    publicKey.excludeCredentials = publicKey.excludeCredentials.map((item) => ({
      ...item,
      id: base64urlToBytes(item.id),
    }));
  }

  return publicKey;
}

function credentialToJSON(credential) {
  return {
    id: credential.id,
    rawId: bytesToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bytesToBase64url(
        credential.response.clientDataJSON
      ),
      attestationObject: bytesToBase64url(
        credential.response.attestationObject
      ),
    },
  };
}

export default function Settings({ user, setMessage, setError }) {
  const [settings, setSettings] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [prefs, setPrefs] = useState({
    security_alerts: true,
    earning_alerts: true,
    transaction_alerts: true,
    account_alerts: true,
    push_enabled: false,
  });

  async function loadSettings() {
    setLoading(true);

    try {
      const [settingsResponse, eventsResponse] = await Promise.all([
        fetch(`${API_URL}/settings`, {
          headers: authHeaders(),
        }),
        fetch(`${API_URL}/settings/security-events`, {
          headers: authHeaders(),
        }),
      ]);

      const settingsData = await settingsResponse.json().catch(() => ({}));
      const eventsData = await eventsResponse.json().catch(() => ({}));

      if (!settingsResponse.ok) {
        throw new Error(
          settingsData.message || "Could not load security settings."
        );
      }

      setSettings(settingsData);
      setPrefs({
        security_alerts: Boolean(
          settingsData.preferences?.security_alerts
        ),
        earning_alerts: Boolean(settingsData.preferences?.earning_alerts),
        transaction_alerts: Boolean(
          settingsData.preferences?.transaction_alerts
        ),
        account_alerts: Boolean(
          settingsData.preferences?.account_alerts
        ),
        push_enabled: Boolean(settingsData.preferences?.push_enabled),
      });

      if (eventsResponse.ok) {
        setEvents(eventsData.events || []);
      }
    } catch (error) {
      setError?.(error.message || "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function changePassword(event) {
    event.preventDefault();

    if (newPassword.length < 8) {
      setError?.("Your new password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError?.("The new passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/settings/password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Password change failed.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setMessage?.(data.message || "Password changed successfully.");
      await loadSettings();
    } catch (error) {
      setError?.(error.message || "Password change failed.");
    } finally {
      setSaving(false);
    }
  }

  async function savePreferences(nextPrefs = prefs) {
    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/settings/preferences`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(nextPrefs),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not save preferences.");
      }

      setPrefs(nextPrefs);
      setMessage?.("Notification preferences saved.");
    } catch (error) {
      setError?.(error.message || "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  async function enablePhoneNotifications() {
    if (!("Notification" in window)) {
      setError?.("This browser does not support phone notifications.");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError?.(
        "Push notifications are not supported by this browser."
      );
      return;
    }

    setSaving(true);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        throw new Error(
          "Notification permission was not granted."
        );
      }

      const registration = await navigator.serviceWorker.ready;

      const publicKeyResponse = await fetch(
        `${API_URL}/push/public-key`,
        {
          headers: authHeaders(),
        }
      );

      const publicKeyData = await publicKeyResponse.json().catch(() => ({}));

      if (!publicKeyResponse.ok || !publicKeyData.publicKey) {
        throw new Error(
          publicKeyData.message ||
            "Push notifications are not configured on the server yet."
        );
      }

      const applicationServerKey = base64urlToBytes(
        publicKeyData.publicKey
      );

      const subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

      const response = await fetch(
        `${API_URL}/settings/push/subscribe`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            subscription: subscription.toJSON(),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || "Could not enable phone notifications."
        );
      }

      const nextPrefs = {
        ...prefs,
        push_enabled: true,
      };

      setPrefs(nextPrefs);
      setMessage?.(
        "Phone notifications are now enabled."
      );
    } catch (error) {
      setError?.(
        error.message || "Could not enable phone notifications."
      );
    } finally {
      setSaving(false);
    }
  }

  async function disablePhoneNotifications() {
    setSaving(true);

    try {
      const registration =
        await navigator.serviceWorker.ready;

      const subscription =
        await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch(`${API_URL}/settings/push/subscribe`, {
          method: "DELETE",
          headers: authHeaders(),
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });

        await subscription.unsubscribe();
      }

      const nextPrefs = {
        ...prefs,
        push_enabled: false,
      };

      setPrefs(nextPrefs);

      await savePreferences(nextPrefs);

      setMessage?.("Phone notifications disabled.");
    } catch (error) {
      setError?.(
        error.message || "Could not disable phone notifications."
      );
    } finally {
      setSaving(false);
    }
  }

  async function registerNewPhoneSecurity() {
    setSaving(true);

    try {
      if (!window.PublicKeyCredential) {
        throw new Error(
          "This device does not support phone security."
        );
      }

      const optionsResponse = await fetch(
        `${API_URL}/auth/webauthn/register/options`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );

      const optionsData =
        await optionsResponse.json().catch(() => ({}));

      if (!optionsResponse.ok) {
        throw new Error(
          optionsData.message ||
            "Could not start phone security registration."
        );
      }

      const publicKey = publicKeyForCreate(
        optionsData.options || optionsData
      );

      const credential =
        await navigator.credentials.create({ publicKey });

      if (!credential) {
        throw new Error(
          "Phone security registration was cancelled."
        );
      }

      const verifyResponse = await fetch(
        `${API_URL}/auth/webauthn/register/verify`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            credential: credentialToJSON(credential),
            device_name:
              prompt(
                "Name this phone security device:",
                "My phone"
              ) || "My phone",
          }),
        }
      );

      const verifyData =
        await verifyResponse.json().catch(() => ({}));

      if (!verifyResponse.ok) {
        throw new Error(
          verifyData.message ||
            "Could not register phone security."
        );
      }

      setMessage?.(
        "New phone security credential registered."
      );

      await loadSettings();
    } catch (error) {
      setError?.(
        error.message ||
          "Could not register phone security."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeBiometric(id) {
    if (
      !confirm(
        "Remove this phone security credential from your account?"
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `${API_URL}/settings/biometrics/${id}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not remove phone security."
        );
      }

      setMessage?.(data.message);
      await loadSettings();
    } catch (error) {
      setError?.(
        error.message ||
          "Could not remove phone security."
      );
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(id) {
    if (!confirm("Sign out this device?")) return;

    setSaving(true);

    try {
      const response = await fetch(
        `${API_URL}/settings/sessions/${id}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || "Could not sign out device."
        );
      }

      setMessage?.(data.message);
      await loadSettings();
    } catch (error) {
      setError?.(
        error.message || "Could not sign out device."
      );
    } finally {
      setSaving(false);
    }
  }

  async function revokeOtherSessions() {
    if (
      !confirm(
        "Sign out Vicky Earn on every other device?"
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `${API_URL}/settings/sessions/revoke-others`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not sign out other devices."
        );
      }

      setMessage?.(data.message);
      await loadSettings();
    } catch (error) {
      setError?.(
        error.message ||
          "Could not sign out other devices."
      );
    } finally {
      setSaving(false);
    }
  }

  function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  if (loading) {
    return (
      <section className="settings-page">
        <div className="card">
          <h2>Security Settings</h2>
          <p>Loading your security information...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-page">
      <div className="hero-heading">
        <div>
          <span className="eyebrow">ACCOUNT CONTROL</span>
          <h1>Settings ⚙️</h1>
          <p>
            Manage your account, phone security, devices and
            notifications.
          </p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="card-label">ACCOUNT</span>
              <h2>{user?.name || "Your account"}</h2>
            </div>
            <div className="card-icon">👤</div>
          </div>

          <p>{user?.email}</p>

          <div className="settings-info">
            <span>Account ID</span>
            <strong>{user?.account_id || "—"}</strong>
          </div>
        </div>

        <div className="card">
          <div className="card-heading">
            <div>
              <span className="card-label">SECURITY</span>
              <h2>Phone security</h2>
            </div>
            <div className="card-icon">🔐</div>
          </div>

          <p>
            Your fingerprint, face unlock or device PIN is
            handled securely by your phone. Vicky Earn does not
            receive your biometric data.
          </p>

          <button
            className="primary"
            onClick={registerNewPhoneSecurity}
            disabled={saving}
          >
            ➕ Add phone security
          </button>

          <div className="settings-list">
            {(settings?.biometrics || []).map((item) => (
              <div className="settings-row" key={item.id}>
                <div>
                  <strong>
                    {item.device_name || "Phone security"}
                  </strong>
                  <small>
                    Added {formatDate(item.created_at)}
                  </small>
                  <small>
                    Last used {formatDate(item.last_used_at)}
                  </small>
                </div>

                <button
                  className="secondary"
                  onClick={() =>
                    removeBiometric(item.id)
                  }
                  disabled={saving}
                >
                  Remove
                </button>
              </div>
            ))}

            {(!settings?.biometrics ||
              settings.biometrics.length === 0) && (
              <p>No phone security credentials found.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-heading">
            <div>
              <span className="card-label">PASSWORD</span>
              <h2>Change password</h2>
            </div>
            <div className="card-icon">🔑</div>
          </div>

          <form onSubmit={changePassword}>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(event) =>
                setCurrentPassword(event.target.value)
              }
              autoComplete="current-password"
            />

            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(event) =>
                setNewPassword(event.target.value)
              }
              autoComplete="new-password"
            />

            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              autoComplete="new-password"
            />

            <button
              className="primary"
              type="submit"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save password"}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-heading">
            <div>
              <span className="card-label">NOTIFICATIONS</span>
              <h2>Phone alerts</h2>
            </div>
            <div className="card-icon">🔔</div>
          </div>

          <p>
            Receive important Vicky Earn activity even when
            the app is closed.
          </p>

          {!prefs.push_enabled ? (
            <button
              className="primary"
              onClick={enablePhoneNotifications}
              disabled={saving}
            >
              📲 Enable phone notifications
            </button>
          ) : (
            <button
              className="secondary"
              onClick={disablePhoneNotifications}
              disabled={saving}
            >
              🔕 Disable phone notifications
            </button>
          )}

          <div className="settings-list">
            {[
              ["security_alerts", "Security alerts"],
              ["earning_alerts", "Earning activity"],
              ["transaction_alerts", "Transfers & withdrawals"],
              ["account_alerts", "Account activity"],
            ].map(([key, label]) => (
              <label className="settings-toggle" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(prefs[key])}
                  onChange={(event) => {
                    const next = {
                      ...prefs,
                      [key]: event.target.checked,
                    };
                    setPrefs(next);
                    savePreferences(next);
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-heading">
            <div>
              <span className="card-label">DEVICES</span>
              <h2>Active sessions</h2>
            </div>
            <div className="card-icon">📱</div>
          </div>

          <button
            className="secondary"
            onClick={revokeOtherSessions}
            disabled={saving}
          >
            Sign out other devices
          </button>

          <div className="settings-list">
            {(settings?.sessions || []).map((session) => (
              <div className="settings-row" key={session.id}>
                <div>
                  <strong>
                    {session.device_name ||
                      "Vicky Earn device"}
                    {session.current ? " • This device" : ""}
                  </strong>

                  <small>
                    Last active{" "}
                    {formatDate(session.last_used_at)}
                  </small>

                  {session.user_agent && (
                    <small>
                      {session.user_agent.slice(0, 90)}
                    </small>
                  )}
                </div>

                {!session.current && (
                  <button
                    className="secondary"
                    onClick={() =>
                      revokeSession(session.id)
                    }
                    disabled={saving}
                  >
                    Sign out
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-heading">
            <div>
              <span className="card-label">SECURITY CENTER</span>
              <h2>Recent activity</h2>
            </div>
            <div className="card-icon">🛡️</div>
          </div>

          <div className="settings-list">
            {events.length === 0 ? (
              <p>No security activity yet.</p>
            ) : (
              events.map((event) => (
                <div
                  className="settings-row"
                  key={event.id}
                >
                  <div>
                    <strong>{event.title}</strong>
                    <small>{event.message}</small>
                    <small>
                      {formatDate(event.created_at)}
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
