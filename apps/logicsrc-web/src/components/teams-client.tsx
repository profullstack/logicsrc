"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Team credential-sharing management UI. The browser holds NO private key, so it
 * never decrypts secrets — it manages membership, invites, and shows vault
 * metadata (names, secret counts, who has access). Actual secret values are only
 * ever decrypted in the `logicsrc` CLI on a device that holds the identity key.
 */

const API_BASE = (process.env.NEXT_PUBLIC_COMMANDBOARD_API_URL ?? "https://commandboard.run").replace(/\/$/, "");
const TOKEN_KEY = "logicsrc.credshare.token";
const EMAIL_KEY = "logicsrc.credshare.email";

interface Team {
  slug: string;
  name: string;
}
interface Member {
  email: string;
  role: string;
  status: string;
  hasPublicKey: boolean;
}
interface Vault {
  id: string;
  name: string;
  hasAccess: boolean;
  secretCount: number;
}

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", ...(init.headers as Record<string, string>) };
  if (init.body) headers["content-type"] = "application/json";
  if (init.token) headers["authorization"] = `Bearer ${init.token}`;
  const res = await fetch(`${API_BASE}/api/credshare${path}`, { ...init, headers });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error((parsed && parsed.error) || `${res.status} ${res.statusText}`);
  return parsed as T;
}

export function TeamsClient({ initialToken }: { initialToken?: string }): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [me, setMe] = useState<{ email: string; publicKey: string | null } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    setEmail(window.localStorage.getItem(EMAIL_KEY) ?? "");
  }, []);

  const refreshTeams = useCallback(async (tok: string) => {
    const data = await api<{ user: { email: string; publicKey: string | null }; teams: Team[] }>("/me", { token: tok });
    setMe(data.user);
    setTeams(data.teams);
    setActive((cur) => cur ?? data.teams[0]?.slug ?? null);
  }, []);

  useEffect(() => {
    if (!token) return;
    refreshTeams(token).catch((e) => setError(String(e.message ?? e)));
  }, [token, refreshTeams]);

  const loadTeam = useCallback(
    async (slug: string, tok: string) => {
      const [m, v] = await Promise.all([
        api<{ members: Member[] }>(`/teams/${encodeURIComponent(slug)}/members`, { token: tok }),
        api<{ vaults: Vault[] }>(`/teams/${encodeURIComponent(slug)}/vaults`, { token: tok })
      ]);
      setMembers(m.members);
      setVaults(v.vaults);
    },
    []
  );

  useEffect(() => {
    if (token && active) loadTeam(active, token).catch((e) => setError(String(e.message ?? e)));
  }, [token, active, loadTeam]);

  // Auto-accept an invite passed via ?token= once the user is logged in.
  useEffect(() => {
    if (!initialToken || !token) return;
    (async () => {
      try {
        setBusy(true);
        const res = await api<{ team?: Team }>("/invites/accept", { method: "POST", token, body: JSON.stringify({ token: initialToken }) });
        setStatus(`Joined ${res.team?.slug ?? "the team"}. Grant + pull secrets from the CLI.`);
        await refreshTeams(token);
        if (res.team) setActive(res.team.slug);
      } catch (e) {
        setError(String((e as Error).message ?? e));
      } finally {
        setBusy(false);
      }
    })();
  }, [initialToken, token, refreshTeams]);

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ emailSent: boolean; devCode?: string }>("/auth/request", { method: "POST", body: JSON.stringify({ email }) });
      setCodeSent(true);
      window.localStorage.setItem(EMAIL_KEY, email);
      setStatus(res.emailSent ? `Code sent to ${email}.` : `Dev mode — your code is ${res.devCode}.`);
      if (res.devCode) setCode(res.devCode);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string }>("/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });
      window.localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setCodeSent(false);
      setCode("");
      setStatus("Logged in.");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function createTeam() {
    const slug = window.prompt("New team slug (lowercase, dashes):");
    if (!slug || !token) return;
    try {
      await api("/teams", { method: "POST", token, body: JSON.stringify({ slug }) });
      await refreshTeams(token);
      setActive(slug);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  async function invite() {
    if (!inviteEmail || !active || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ emailSent: boolean; token?: string }>(`/teams/${encodeURIComponent(active)}/invites`, { method: "POST", token, body: JSON.stringify({ email: inviteEmail }) });
      setStatus(res.emailSent ? `Invited ${inviteEmail}.` : `Invited ${inviteEmail}. Share this accept link: ${window.location.origin}/teams/accept?token=${res.token}`);
      setInviteEmail("");
      await loadTeam(active, token);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMe(null);
    setTeams([]);
    setActive(null);
    setStatus("Logged out.");
  }

  const notice = (
    <>
      {error && <p style={{ color: "#e5484d", margin: "0.5rem 0" }}>⚠ {error}</p>}
      {status && !error && <p style={{ color: "#30a46c", margin: "0.5rem 0" }}>{status}</p>}
    </>
  );

  if (!token) {
    return (
      <div className="band" style={{ maxWidth: "32rem" }}>
        <div className="section-head">
          <h2>Team credential sharing</h2>
          <p>Log in by email to manage teams and invites. Secrets stay end-to-end encrypted — decrypt them with the <code>logicsrc</code> CLI, never here.</p>
        </div>
        {notice}
        {!codeSent ? (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <button onClick={requestCode} disabled={busy || !email} style={buttonStyle}>Send code</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <input inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
            <button onClick={verifyCode} disabled={busy || !code} style={buttonStyle}>Verify</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="band" style={{ maxWidth: "48rem" }}>
      <div className="section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
        <h2>Your teams</h2>
        <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
          {me?.email} {me && !me.publicKey && "· ⚠ no CLI key yet (run logicsrc login)"} · <a onClick={logout} style={{ cursor: "pointer" }}>log out</a>
        </span>
      </div>
      {notice}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.75rem 0" }}>
        {teams.map((t) => (
          <button key={t.slug} onClick={() => setActive(t.slug)} style={{ ...chipStyle, ...(active === t.slug ? chipActive : {}) }}>
            {t.name || t.slug}
          </button>
        ))}
        <button onClick={createTeam} style={chipStyle}>+ new team</button>
      </div>

      {active && (
        <>
          <h3 style={{ marginTop: "1.5rem" }}>Members</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Email</th><th style={thStyle}>Role</th><th style={thStyle}>Status</th><th style={thStyle}>CLI key</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.email}>
                  <td style={tdStyle}>{m.email}</td><td style={tdStyle}>{m.role}</td>
                  <td style={tdStyle}>{m.status}</td><td style={tdStyle}>{m.hasPublicKey ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <input type="email" placeholder="teammate@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={inputStyle} />
            <button onClick={invite} disabled={busy || !inviteEmail} style={buttonStyle}>Invite</button>
          </div>

          <h3 style={{ marginTop: "1.5rem" }}>Vaults</h3>
          {vaults.length === 0 ? (
            <p style={{ opacity: 0.7 }}>No vaults yet. Create one from the CLI: <code>logicsrc teams push {active} prod</code></p>
          ) : (
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Vault</th><th style={thStyle}>Secrets</th><th style={thStyle}>Your access</th></tr></thead>
              <tbody>
                {vaults.map((v) => (
                  <tr key={v.id}>
                    <td style={tdStyle}><code>{v.name}</code></td><td style={tdStyle}>{v.secretCount}</td>
                    <td style={tdStyle}>{v.hasAccess ? "✓ granted" : "— ask a member to grant you"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ opacity: 0.7, marginTop: "1rem", fontSize: "0.9rem" }}>
            Pull secrets on your machine: <code>logicsrc teams pull {active} &lt;vault&gt;</code> — values are decrypted locally with your key. The server (and this page) only ever see ciphertext.
          </p>
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "0.6rem 0.8rem", borderRadius: "0.5rem", border: "1px solid var(--border, #333)", background: "transparent", color: "inherit", minWidth: "16rem", flex: 1 };
const buttonStyle: React.CSSProperties = { padding: "0.6rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--border, #333)", background: "var(--accent, #5b7cfa)", color: "#fff", cursor: "pointer" };
const chipStyle: React.CSSProperties = { padding: "0.4rem 0.8rem", borderRadius: "999px", border: "1px solid var(--border, #333)", background: "transparent", color: "inherit", cursor: "pointer" };
const chipActive: React.CSSProperties = { background: "var(--accent, #5b7cfa)", color: "#fff", borderColor: "transparent" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: "0.5rem", fontSize: "0.92rem" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--border, #333)", opacity: 0.7, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--border, #222)" };
