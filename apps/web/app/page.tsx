
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

const API = 'http://localhost:4000/api/v1';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
};

type Workflow = {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  version: number;
};

type Step = {
  nodeId: string;
  nodeType: string;
  status: string;
  error?: string | null;
};

type Execution = {
  id: string;
  workflowId: string;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string | null;
  steps: Step[];
};

type ExecutionHistoryItem = {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: string;
  error: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  durationMs: number | null;
  stepCount: number;
};

type ApiError = {
  error?: {
    message?: string;
  };
};

const demoGraph = {
  nodes: [
    {
      id: 'trigger-1',
      type: 'manualTrigger',
      label: 'Manual Trigger',
      config: {},
    },
    {
      id: 'action-1',
      type: 'action',
      label: 'Set Result',
      config: {
        operation: 'set',
        key: 'result',
        value: 'Qorvexa workflow executed successfully',
      },
    },
    {
      id: 'end-1',
      type: 'end',
      label: 'End',
      config: {},
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'trigger-1',
      target: 'action-1',
    },
    {
      id: 'edge-2',
      source: 'action-1',
      target: 'end-1',
    },
  ],
};

export default function Home() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);

  const [mode, setMode] = useState<
    'login' | 'register' | 'forgot' | 'reset'
  >('register');

  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [latestExecution, setLatestExecution] =
    useState<Execution | null>(null);

  const [historyWorkflow, setHistoryWorkflow] =
    useState<Workflow | null>(null);

  const [executionHistory, setExecutionHistory] =
    useState<ExecutionHistoryItem[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');



  const apiFetch = useCallback(
    async <T,>(
      path: string,
      options: RequestInit = {},
      accessToken = token,
    ): Promise<T> => {
      const headers = new Headers(options.headers);
      headers.set('Content-Type', 'application/json');

      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }

      const response = await fetch(`${API}${path}`, {
        ...options,
        headers,
      });

      const body = await response.json().catch(() => ({}));

      // Clear a saved session when the authenticated API rejects it.
      if (response.status === 401 && accessToken) {
        localStorage.removeItem('qorvexa.accessToken');
        localStorage.removeItem('qorvexa.user');

        setToken('');
        setUser(null);
        setMode('login');

        const message = 'Your session has expired. Please sign in again.';
        setError(message);

        throw new Error(message);
      }

      if (!response.ok) {
        const apiError = body as ApiError;
        throw new Error(
          apiError.error?.message ?? `Request failed (${response.status})`,
        );
      }

      return body as T;
    },
    [token],
  );

  const loadWorkflows = useCallback(
    async (accessToken: string) => {
      const response = await apiFetch<{ data: Workflow[] }>(
        '/workflows',
        {},
        accessToken,
      );
      setWorkflows(response.data);
    },
    [apiFetch],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingToken = params.get('resetToken');

    if (incomingToken) {
      setResetToken(incomingToken);
      setMode('reset');
    }

    try {
      const savedToken = localStorage.getItem('qorvexa.accessToken');
      const savedUser = localStorage.getItem('qorvexa.user');

      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser) as User);
      }
    } catch {
      localStorage.removeItem('qorvexa.accessToken');
      localStorage.removeItem('qorvexa.user');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || !token) return;

    loadWorkflows(token).catch((err: Error) => {
      setError(err.message);
    });
  }, [ready, token, loadWorkflows]);

  async function requestPasswordReset(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setBusy('forgot');
    setError('');
    setNotice('');
    setResetUrl('');

    try {
      const result = await apiFetch<{
        message: string;
        resetUrl?: string;
      }>(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        },
        '',
      );

      setNotice(result.message);

      if (result.resetUrl) {
        const generatedUrl = new URL(result.resetUrl);
        const token = generatedUrl.searchParams.get('resetToken');

        if (token) {
          // Keep the current browser host, such as localhost or a LAN address.
          const localUrl = new URL(window.location.href);
          localUrl.search = '';
          localUrl.searchParams.set('resetToken', token);
          setResetUrl(localUrl.toString());
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not request password reset.',
      );
    } finally {
      setBusy('');
    }
  }

  async function submitNewPassword(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (newPassword.length < 12 || newPassword.length > 128) {
      setError('Your password must be between 12 and 128 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy('reset');

    try {
      const result = await apiFetch<{ message: string }>(
        '/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            token: resetToken,
            password: newPassword,
          }),
        },
        '',
      );

      localStorage.removeItem('qorvexa.accessToken');
      localStorage.removeItem('qorvexa.user');

      setToken('');
      setUser(null);
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setResetUrl('');
      setMode('login');
      setNotice(result.message);

      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not reset password.',
      );
    } finally {
      setBusy('');
    }
  }

  async function runWorkflow(workflowId: string) {
    setBusy(`run:${workflowId}`);
    setError('');
    setNotice('');

    try {
      const result = await apiFetch<{
        data: { id: string; status: string };
      }>(`/workflows/${workflowId}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          input: { initiatedFrom: 'Qorvexa dashboard' },
        }),
      });

      const executionId = result.data.id;

      setLatestExecution({
        id: executionId,
        workflowId,
        status: result.data.status,
        input: { initiatedFrom: 'Qorvexa dashboard' },
        steps: [],
      });

      let finalStatus = result.data.status;

      // Poll the persisted execution status for up to 10 seconds.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));

        const status = await apiFetch<{ data: Execution }>(
          `/workflows/${workflowId}/executions/${executionId}`,
        );

        setLatestExecution(status.data);
        finalStatus = status.data.status;

        if (finalStatus === 'completed' || finalStatus === 'failed') {
          break;
        }
      }

      if (finalStatus === 'completed') {
        setNotice('Execution completed. Results were retrieved from the API.');
      } else if (finalStatus === 'failed') {
        setError('Execution failed. Inspect the execution details below.');
      } else {
        setNotice('Execution is still processing. Check its status again shortly.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution request failed.');
    } finally {
      setBusy('');
    }
  }

  if (!ready) {
    return (
      <main className="shell">
        <p className="muted">Loading Qorvexa…</p>
      </main>
    );
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('auth');
    setError('');
    setNotice('');

    try {
      const endpoint =
        mode === 'register' ? '/auth/register' : '/auth/login';

      const payload =
        mode === 'register'
          ? { name, email, password, organizationName }
          : { email, password };

      const result = await apiFetch<{
        accessToken: string;
        user: User;
      }>(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        '',
      );

      localStorage.setItem('qorvexa.accessToken', result.accessToken);
      localStorage.setItem('qorvexa.user', JSON.stringify(result.user));

      setToken(result.accessToken);
      setUser(result.user);
      setNotice(`Welcome, ${result.user.name}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Authentication failed.',
      );
    } finally {
      setBusy('');
    }
  }

  function logout() {
    localStorage.removeItem('qorvexa.accessToken');
    localStorage.removeItem('qorvexa.user');

    setToken('');
    setUser(null);
    setWorkflows([]);
    setLatestExecution(null);
    setError('');
    setNotice('');
    setMode('login');
  }

  async function createWorkflow() {
    setBusy('create');
    setError('');
    setNotice('');

    try {
      await apiFetch('/workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Qorvexa Demo Workflow',
          description: 'A deterministic trigger-action-end workflow.',
          graph: demoGraph,
        }),
      });

      await loadWorkflows(token);
      setNotice('Workflow created as a draft. Publish it to enable execution.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create workflow.',
      );
    } finally {
      setBusy('');
    }
  }

  async function publishWorkflow(workflowId: string) {
    setBusy(`publish:${workflowId}`);
    setError('');
    setNotice('');

    try {
      await apiFetch(`/workflows/${workflowId}/publish`, {
        method: 'POST',
      });



      await loadWorkflows(token);
      setNotice('Workflow published and ready to execute.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not publish workflow.',
      );
    } finally {
      setBusy('');
    }
  }

  async function loadExecutionHistory(workflow: Workflow) {
    setHistoryWorkflow(workflow);
    setExecutionHistory([]);
    setHistoryLoading(true);
    setError('');
    setNotice('');

    try {
      const result = await apiFetch<{
        data: ExecutionHistoryItem[];
        pagination: {
          limit: number;
          hasMore: boolean;
        };
      }>(`/workflows/${workflow.id}/executions?limit=20`);

      setExecutionHistory(result.data);
      setNotice(`Loaded execution history for ${workflow.name}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load execution history.',
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function inspectExecution(
    workflowId: string,
    executionId: string,
  ) {
    setBusy(`inspect:${executionId}`);
    setError('');
    setNotice('');

    try {
      const result = await apiFetch<{ data: Execution }>(
        `/workflows/${workflowId}/executions/${executionId}`,
      );

      setLatestExecution(result.data);
      setNotice('Loaded persisted execution details.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load execution details.',
      );
    } finally {
      setBusy('');
    }
  }

  if (mode === 'reset') {
    return (
      <main className="shell auth-shell">
        <style jsx global>{styles}</style>

        <div className="brand">
          <span className="brand-mark">Q</span>
          <span>QORVEXA</span>
        </div>

        <section className="auth-card">
          <p className="eyebrow">ACCOUNT RECOVERY</p>
          <h1>Set a new password</h1>
          <p className="muted">
            Choose a new password to regain access to your workspace.
          </p>

          <form
            className="form"
            onSubmit={submitNewPassword}
          >
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
                placeholder="At least 12 characters"
              />
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
                placeholder="Enter the password again"
              />
            </label>

            {error && <p className="message error">{error}</p>}

            <button className="primary full" disabled={busy === 'reset'}>
              {busy === 'reset' ? 'Updating password…' : 'Reset password'}
            </button>
          </form>

          <button
            type="button"
            className="secondary full"
            style={{ marginTop: 12 }}
            onClick={() => {
              window.history.replaceState({}, '', window.location.pathname);
              setResetToken('');
              setError('');
              setMode('login');
            }}
          >
            Back to sign in
          </button>
        </section>
      </main>
    );
  }

  if (!token || !user) {
    return (
      <main className="shell auth-shell">
        <style jsx global>{styles}</style>

        <div className="brand">
          <span className="brand-mark">Q</span>
          <span>QORVEXA</span>
        </div>

        <section className="auth-card">
          <p className="eyebrow">WORKFLOW AUTOMATION PLATFORM</p>
          <h1>
            {mode === 'forgot'
              ? 'Reset your password'
              : mode === 'register'
                ? 'Create your workspace'
                : 'Welcome back'}
          </h1>
          <p className="muted">
            Manage workflows, run executions, and inspect results in one place.
          </p>
          {(mode === 'register' || mode === 'login') && (
            <div className="auth-tabs">
              <button
                className={mode === 'register' ? 'tab active' : 'tab'}
                onClick={() => {
                  setMode('register');
                  setError('');
                  setNotice('');
                }}
                type="button"
              >
                Create account
              </button>

              <button
                className={mode === 'login' ? 'tab active' : 'tab'}
                onClick={() => {
                  setMode('login');
                  setError('');
                  setNotice('');
                }}
                type="button"
              >
                Sign in
              </button>
            </div>
          )}

          <form
            onSubmit={mode === 'forgot' ? requestPasswordReset : submitAuth}
            className="form"
          >
            {mode === 'register' && (
              <>
                <label>
                  Your name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    required
                    placeholder="Your full name"
                  />
                </label>

                <label>
                  Organization name
                  <input
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    minLength={2}
                    required
                    placeholder="Your organization"
                  />
                </label>
              </>
            )}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="you@example.com"
              />
            </label>

            {mode !== 'forgot' && (
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={mode === 'register' ? 12 : 1}
                  maxLength={128}
                  required
                  autoComplete={
                    mode === 'register' ? 'new-password' : 'current-password'
                  }
                  placeholder={
                    mode === 'register'
                      ? 'At least 12 characters'
                      : 'Your password'
                  }
                />

                {mode === 'register' && (
                  <small className="muted">
                    Use at least 12 characters.
                  </small>
                )}
              </label>
            )}

            {mode === 'login' && (
              <button
                type="button"
                className="tab"
                style={{ alignSelf: 'flex-end', color: '#6554dc' }}
                onClick={() => {
                  setMode('forgot');
                  setError('');
                  setNotice('');
                  setResetUrl('');
                }}
              >
                Forgot password?
              </button>
            )}

            {error && <p className="message error">{error}</p>}

            <button
              className="primary full"
              disabled={busy === 'auth' || busy === 'forgot'}
            >
              {busy === 'auth' || busy === 'forgot'
                ? 'Please wait…'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : mode === 'register'
                    ? 'Create workspace'
                    : 'Sign in'}
            </button>
          </form>

          {notice && <p className="message success">{notice}</p>}

          {mode === 'forgot' && resetUrl && (
            <div className="message success">
              <p>Development reset link:</p>
              <a href={resetUrl}>Open password reset form</a>
            </div>
          )}

          {mode === 'forgot' && (
            <button
              type="button"
              className="secondary full"
              style={{ marginTop: 12 }}
              onClick={() => {
                setMode('login');
                setError('');
                setNotice('');
                setResetUrl('');
              }}
            >
              Back to sign in
            </button>
          )}

          <p className="footnote">
            Uses your authenticated Qorvexa API. No sample accounts or fake records.
          </p>
        </section>
      </main>
    );
  }

  const draftCount = workflows.filter((item) => item.status === 'draft').length;
  const publishedCount = workflows.filter((item) => item.status === 'published').length;

  return (
    <main className="shell">
      <style jsx global>{styles}</style>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Q</span>
          <span>QORVEXA</span>
        </div>

        <div className="account">
          <div>
            <strong>{user.name}</strong>
            <span className="muted">{user.role} · {user.email}</span>
          </div>
          <button className="secondary" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">WORKSPACE / OVERVIEW</p>
        <h1>Workflow control center</h1>
        <p className="muted">
          Create workflows, publish approved graphs, execute jobs, and inspect
          persisted results.
        </p>
      </section>

      {error && <div className="message error">{error}</div>}
      {notice && <div className="message success">{notice}</div>}

      <section className="stats" aria-label="Workflow summary">
        <article className="stat-card">
          <span className="muted">Total workflows</span>
          <strong>{workflows.length}</strong>
          <span>From your organization</span>
        </article>
        <article className="stat-card">
          <span className="muted">Published</span>
          <strong>{publishedCount}</strong>
          <span>Ready to execute</span>
        </article>
        <article className="stat-card">
          <span className="muted">Drafts</span>
          <strong>{draftCount}</strong>
          <span>Awaiting publication</span>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">AUTOMATION</p>
          <h2>Your workflows</h2>
        </div>
        <button
          className="primary"
          onClick={createWorkflow}
          disabled={busy !== ''}
        >
          {busy === 'create' ? 'Creating…' : '+ Create demo workflow'}
        </button>
      </section>

      {workflows.length === 0 ? (
        <section className="empty-card">
          <div className="empty-icon">↗</div>
          <h3>Your workspace is ready</h3>
          <p className="muted">
            Create a workflow to test the complete trigger → action → end execution
            path using the real API, queue, worker, and database.
          </p>
          <button
            className="primary"
            onClick={createWorkflow}
            disabled={busy !== ''}
          >
            Create your first workflow
          </button>
        </section>
      ) : (
        <section className="workflow-grid">
          {workflows.map((workflow) => (
            <article className="workflow-card" key={workflow.id}>
              <div className="workflow-card-top">
                <span className="workflow-icon">↗</span>
                <span className={`status ${workflow.status}`}>
                  {workflow.status}
                </span>
              </div>

              <h3>{workflow.name}</h3>
              <p className="muted">
                {workflow.description || 'No description provided.'}
              </p>

              <div className="workflow-meta">
                <span>Version {workflow.version}</span>
                <span>Organization scoped</span>
              </div>

              <div className="card-actions">
                <button
                  className="secondary"
                  onClick={() => loadExecutionHistory(workflow)}
                  disabled={busy !== '' || historyLoading}
                  style={{ marginRight: 8, marginBottom: 8 }}
                >
                  {historyLoading && historyWorkflow?.id === workflow.id
                    ? 'Loading…'
                    : 'View history'}
                </button>

                {workflow.status === 'draft' && (
                  <button
                    className="primary"
                    onClick={() => publishWorkflow(workflow.id)}
                    disabled={busy !== ''}
                  >
                    {busy === `publish:${workflow.id}` ? 'Publishing…' : 'Publish'}
                  </button>
                )}

                {/* Keep your existing published and archived conditions here. */}

                {workflow.status === 'published' && (
                  <button
                    className="primary"
                    onClick={() => runWorkflow(workflow.id)}
                    disabled={busy !== ''}
                  >
                    {busy === `run:${workflow.id}` ? 'Executing…' : '▶ Run workflow'}
                  </button>
                )}

                {workflow.status === 'archived' && (
                  <span className="muted">Archived workflows cannot run.</span>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {historyWorkflow && (
        <section className="execution-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RUN HISTORY</p>
              <h2>{historyWorkflow.name}</h2>
            </div>

            <button
              className="secondary"
              onClick={() => {
                setHistoryWorkflow(null);
                setExecutionHistory([]);
              }}
            >
              Close history
            </button>
          </div>

          {historyLoading ? (
            <p className="muted">Loading execution history…</p>
          ) : executionHistory.length === 0 ? (
            <p className="muted">
              No execution records found for this workflow yet.
            </p>
          ) : (
            <div className="history-list">
              {executionHistory.map((item) => (
                <article className="history-item" key={item.id}>
                  <div className="history-meta">
                    <strong>Run {item.id.slice(-8)}</strong>

                    <span className="muted">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>

                    <span className="muted">
                      Version {item.workflowVersion} · {item.stepCount} steps
                    </span>

                    <span className="muted">
                      Duration:{' '}
                      {item.durationMs === null
                        ? 'Not finished'
                        : `${(item.durationMs / 1000).toFixed(2)} s`}
                    </span>

                    {item.error && (
                      <span className="history-error">
                        Error: {item.error}
                      </span>
                    )}
                  </div>

                  <div className="history-controls">
                    <span className={`status ${item.status}`}>
                      {item.status}
                    </span>

                    <button
                      className="secondary"
                      onClick={() =>
                        inspectExecution(item.workflowId, item.id)
                      }
                      disabled={busy !== ''}
                    >
                      Inspect
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {latestExecution && (
        <section className="execution-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LATEST RUN</p>
              <h2>Execution details</h2>
            </div>
            <span className={`status ${latestExecution.status}`}>
              {latestExecution.status}
            </span>
          </div>

          <p className="muted execution-id">
            Execution ID: {latestExecution.id}
          </p>

          <div className="step-list">
            {(latestExecution.steps || []).map((step) => (
              <div className="step-row" key={step.nodeId}>
                <div>
                  <strong>{step.nodeId}</strong>
                  <span className="muted">{step.nodeType}</span>
                </div>
                <span className={`status ${step.status}`}>{step.status}</span>
              </div>
            ))}
            {latestExecution.steps?.length === 0 && (
              <p className="muted">Waiting for the worker to report step results…</p>
            )}
          </div>

          {latestExecution.error && (
            <p className="message error">{latestExecution.error}</p>
          )}

          {latestExecution.output && (
            <>
              <h3>Persisted output</h3>
              <pre className="output">
                {JSON.stringify(latestExecution.output, null, 2)}
              </pre>
            </>
          )}
        </section>
      )}

      <footer className="footer">
        Qorvexa · Authenticated workspace · API-backed workflow execution
      </footer>
    </main>
  );
}

const styles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f7f7fc;
    color: #191936;
    font-family: Arial, Helvetica, sans-serif;
  }
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .6; }
  .shell {
    max-width: 1440px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 28px clamp(18px, 4vw, 58px) 40px;
  }
  .auth-shell { display: flex; flex-direction: column; }
  .brand {
    display: flex; align-items: center; gap: 11px;
    color: #28234d; font-size: 14px; font-weight: 800; letter-spacing: 2px;
  }
  .brand-mark {
    display: grid; place-items: center; width: 36px; height: 36px;
    border-radius: 11px; color: white; background: #6554dc;
    font-size: 20px; letter-spacing: 0;
  }
  .topbar {
    display: flex; justify-content: space-between; align-items: center;
    gap: 20px; padding-bottom: 25px; border-bottom: 1px solid #e6e5f0;
  }
  .account { display: flex; align-items: center; gap: 18px; }
  .account > div { display: flex; flex-direction: column; gap: 4px; text-align: right; }
  .account strong { font-size: 13px; }
  .account span { font-size: 12px; }
  .hero { padding: 48px 0 28px; }
  .eyebrow {
    color: #6554dc; font-size: 11px; font-weight: 800;
    letter-spacing: 2px; margin: 0 0 12px;
  }
  h1 { margin: 0 0 13px; font-size: clamp(32px, 4vw, 48px); letter-spacing: -1.7px; }
  h2 { margin: 0; font-size: 24px; letter-spacing: -.5px; }
  h3 { margin: 14px 0 9px; font-size: 18px; }
  .muted { color: #77778e; line-height: 1.6; }
  .hero > p:last-child { max-width: 690px; margin-bottom: 0; font-size: 16px; }
  .primary, .secondary {
    border: 1px solid #6554dc; border-radius: 10px;
    padding: 11px 16px; font-size: 13px; font-weight: 700;
    transition: background .15s ease;
  }
  .primary { color: white; background: #6554dc; }
  .primary:hover { background: #5140c5; }
  .secondary { color: #5140c5; background: white; }
  .secondary:hover { background: #f0efff; }
  .full { width: 100%; margin-top: 4px; }
  .stats { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 17px; }
  .stat-card, .workflow-card, .empty-card, .execution-panel, .auth-card {
    border: 1px solid #e5e4ef; border-radius: 16px;
    background: white; box-shadow: 0 8px 28px rgba(29, 25, 71, .045);
  }
  .stat-card { padding: 22px; display: flex; flex-direction: column; gap: 6px; }
  .stat-card strong { font-size: 34px; letter-spacing: -1px; }
  .stat-card > span:last-child { font-size: 12px; color: #85849b; }
  .section-heading { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin: 42px 0 18px; }
  .section-heading .eyebrow { margin-bottom: 7px; }
  .workflow-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 17px; }
  .workflow-card { padding: 22px; display: flex; flex-direction: column; min-width: 0; }
  .workflow-card-top { display: flex; align-items: center; justify-content: space-between; }
  .workflow-icon, .empty-icon {
    display: grid; place-items: center; width: 39px; height: 39px;
    border-radius: 12px; background: #efedff; color: #6554dc; font-size: 21px;
  }
  .workflow-card > p { font-size: 13px; min-height: 42px; margin: 0; }
  .status {
    display: inline-flex; align-items: center; border-radius: 999px;
    padding: 5px 9px; font-size: 11px; font-weight: 800;
    background: #f0eff7; color: #696783; text-transform: capitalize;
  }
  .status.published, .status.completed { background: #e4f8ed; color: #147848; }
  .status.draft, .status.queued { background: #fff4d8; color: #966308; }
  .status.failed { background: #ffebeb; color: #b42318; }
  .status.running { background: #e8efff; color: #3158b7; }
  .workflow-meta {
    display: flex; flex-direction: column; gap: 5px; border-top: 1px solid #eeedf5;
    margin-top: 18px; padding-top: 14px; color: #85849b; font-size: 11px;
  }
  .card-actions { margin-top: 20px; }
  .empty-card { padding: 40px 24px; text-align: center; }
  .empty-icon { margin: 0 auto 16px; width: 48px; height: 48px; }
  .empty-card p { max-width: 560px; margin: 0 auto 22px; }
  .execution-panel { margin-top: 34px; padding: 25px; }
  .execution-panel .section-heading { margin: 0 0 8px; }
  .execution-id { overflow-wrap: anywhere; font-size: 12px; }
  .step-list { margin: 22px 0; border: 1px solid #eeedf5; border-radius: 12px; overflow: hidden; }
  .history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid #eeedf5;
  border-radius: 12px;
  background: #fff;
}

.history-meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.history-meta strong {
  font-size: 13px;
}

.history-meta .muted {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.history-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.history-error {
  color: #b42318;
  font-size: 12px;
  overflow-wrap: anywhere;
}

@media (max-width: 620px) {
  .history-item {
    align-items: flex-start;
    flex-direction: column;
  }
}
  .step-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 15px; border-bottom: 1px solid #eeedf5; }
  .step-row:last-child { border-bottom: 0; }
  .step-row > div { display: flex; align-items: center; gap: 12px; }
  .step-row strong { font-size: 12px; }
  .step-row .muted { font-size: 12px; }
  .output {
    white-space: pre-wrap; overflow-wrap: anywhere; padding: 16px;
    border-radius: 12px; color: #d9d5ff; background: #201e39;
    font-size: 12px; line-height: 1.7; overflow-x: auto;
  }
  .message { padding: 12px 14px; border-radius: 10px; margin: 15px 0; font-size: 13px; line-height: 1.5; }
  .error { background: #fff0f0; border: 1px solid #ffd7d7; color: #a61d24; }
  .success { background: #eaf9f0; border: 1px solid #ccefd9; color: #17683e; }
  .footer { border-top: 1px solid #e6e5f0; margin-top: 44px; padding-top: 20px; font-size: 11px; color: #85849b; }
  .auth-card { max-width: 470px; width: 100%; margin: 55px auto 20px; padding: 30px; }
  .auth-card h1 { font-size: 31px; letter-spacing: -1px; }
  .auth-card > .muted { font-size: 13px; }
  .auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 24px 0; padding: 5px; background: #f3f2fa; border-radius: 11px; }
  .tab { border: 0; border-radius: 8px; padding: 10px 7px; background: transparent; color: #77778e; font-size: 12px; font-weight: 700; }
  .tab.active { background: white; color: #5140c5; box-shadow: 0 1px 5px #0000000d; }
  .form { display: flex; flex-direction: column; gap: 16px; margin-top: 10px; }
  .form label { display: flex; flex-direction: column; gap: 7px; font-size: 12px; font-weight: 700; }
  .form input { width: 100%; border: 1px solid #dddbe9; border-radius: 9px; padding: 12px; background: white; color: #191936; outline: none; }
  .form input:focus { border-color: #6554dc; box-shadow: 0 0 0 3px #6554dc18; }
  .form small { font-weight: 400; font-size: 11px; }
  .footnote { margin: 21px 0 0; color: #85849b; text-align: center; font-size: 11px; line-height: 1.6; }
  @media (max-width: 900px) {
    .workflow-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  }
  @media (max-width: 620px) {
    .shell { padding: 18px 14px 30px; }
    .topbar { align-items: flex-start; }
    .account { align-items: flex-end; gap: 10px; }
    .account > div { max-width: 155px; }
    .account .muted { overflow-wrap: anywhere; }
    .stats { grid-template-columns: 1fr; gap: 10px; }
    .stat-card { padding: 16px; }
    .stat-card strong { font-size: 28px; }
    .workflow-grid { grid-template-columns: 1fr; }
    .section-heading { align-items: flex-start; flex-direction: column; }
    .section-heading > button { width: 100%; }
    .auth-card { margin-top: 35px; padding: 22px; }
    .step-row { align-items: flex-start; }
    .step-row > div { flex-direction: column; align-items: flex-start; gap: 3px; }
  }
`;
