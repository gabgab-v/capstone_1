import React, { useEffect, useState } from 'react';
import axios from 'axios';

const resolveApiBaseUrl = () => {
  // Prefer explicit admin URL, then fall back to general backend URLs, then localhost.
  const raw =
    import.meta.env.VITE_ADMIN_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    '';

  if (typeof raw !== 'string' || raw.trim() === '') {
    return 'http://localhost:3000';
  }

  // Ensure we never end up with a trailing slash so axios concatenation remains predictable.
  return raw.replace(/\/+$/, '');
};

const API_URL = resolveApiBaseUrl();
const TOKEN_KEY = 'adminToken';

const adminApi = axios.create({ baseURL: API_URL });

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  // Stay in sync with storage updates (e.g. manual clear, other tabs)
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === TOKEN_KEY) {
        setToken(event.newValue);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return <div>{token ? <Dashboard setToken={setToken} /> : <Login setToken={setToken} />}</div>;
}

const Login = ({ setToken }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await adminApi.post('/api/admin/login', { email, password });
      const token = response.data?.token;

      if (!token) {
        setError('Login succeeded but the server did not return a token. Contact support.');
        return;
      }

      localStorage.setItem(TOKEN_KEY, token);
      setToken(token);
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.message || 'Login failed.');
      } else if (err.request) {
        setError('Network Error: Could not connect to the server.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: '50px',
        maxWidth: '400px',
        margin: 'auto',
        border: '1px solid #ccc',
        borderRadius: '8px',
        marginTop: '100px',
      }}
    >
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Admin Login</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px',
            marginBottom: '10px',
            borderRadius: '4px',
            border: '1px solid #ddd',
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px',
            marginBottom: '20px',
            borderRadius: '4px',
            border: '1px solid #ddd',
          }}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '10px',
            cursor: 'pointer',
            background: isSubmitting ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
          }}
        >
          {isSubmitting ? 'Signing in?' : 'Login'}
        </button>
        {error && <p style={{ color: 'red', marginTop: '15px', textAlign: 'center' }}>{error}</p>}
      </form>
    </div>
  );
};

const Dashboard = ({ setToken }) => {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await adminApi.get('/api/admin/users');
        setUsers(response.data?.users ?? response.data ?? []);
      } catch (err) {
        console.error('Fetch Users Error:', err);
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          handleLogout();
        } else if (err.response) {
          setError(`Failed to fetch user data: ${err.response.data?.message || err.response.statusText}`);
        } else if (err.request) {
          setError('Network Error: Could not connect to the server.');
        } else {
          setError('An unexpected error occurred while fetching users.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Admin Dashboard</h1>
        <button onClick={handleLogout} style={{ padding: '8px 12px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <OrganizerRequests onUnauthorized={handleLogout} />

      <div style={{ marginTop: '40px' }}>
        <h2>Application Users</h2>
        {isLoading ? (
          <p>Loading users...</p>
        ) : error ? (
          <p style={{ color: 'red' }}>{error}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f2f2f2' }}>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>ID</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Email</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{user.id}</td>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{user.name || 'N/A'}</td>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{user.email}</td>
                    <td
                      style={{
                        padding: '8px',
                        border: '1px solid #ddd',
                        color:
                          user.role === 'ADMIN'
                            ? 'red'
                            : user.role === 'ORGANIZER'
                            ? 'blue'
                            : 'black',
                      }}
                    >
                      {user.role}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const OrganizerRequests = ({ onUnauthorized }) => {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  const fetchRequests = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await adminApi.get('/api/admin/organizer-requests');
      setRequests(response.data?.requests ?? response.data ?? []);
    } catch (err) {
      console.error('Fetch Requests Error:', err);
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        onUnauthorized?.();
      } else if (err.response) {
        setError(`Failed to fetch requests: ${err.response.data?.message || err.response.statusText}`);
      } else if (err.request) {
        setError('Network Error: No response from server. Is it running?');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (userId) => {
    setMessage('');
    setError('');
    setApprovingId(userId);
    try {
      const response = await adminApi.post(`/api/admin/approve-organizer/${userId}`);
      setMessage(response.data?.message || 'Organizer approved successfully.');
      await fetchRequests();
    } catch (err) {
      console.error('Approve Request Error:', err);
      if (err.response) {
        setError(`Failed to approve: ${err.response.data?.message || err.response.statusText}`);
        if (err.response.status === 401 || err.response.status === 403) {
          onUnauthorized?.();
        }
      } else if (err.request) {
        setError('Network Error: No response from server.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setApprovingId(null);
    }
  };

  const toggleExpanded = (requestId) => {
    setExpandedId((prev) => (prev === requestId ? null : requestId));
  };

  const formatDateTime = (value) => {
    if (!value) {
      return 'Unknown submission time';
    }
    try {
      return new Date(value).toLocaleString();
    } catch (_err) {
      return String(value);
    }
  };

  const cardStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    background: '#ffffff',
    boxShadow: '0 2px 4px rgba(15, 23, 42, 0.05)',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
  };

  const detailGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    marginTop: '16px',
  };

  const labelStyle = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  const valueStyle = {
    fontSize: '14px',
    color: '#0f172a',
    marginTop: '4px',
    whiteSpace: 'pre-wrap',
  };

  const buttonGroupStyle = {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
  };

  const toggleButtonStyle = {
    background: '#e2e8f0',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 600,
    color: '#1f2937',
  };

  const approveButtonStyle = (disabled) => ({
    background: disabled ? '#9ca3af' : '#047857',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: '#ffffff',
    fontWeight: 700,
  });

  const documentGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px',
    marginTop: '12px',
  };

  const documentButtonStyle = {
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    background: 'transparent',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.15)',
  };

  const documentImageStyle = {
    width: '100%',
    height: '110px',
    objectFit: 'cover',
    display: 'block',
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <h2>Organizer Requests</h2>
      {isLoading ? (
        <p>Loading requests...</p>
      ) : (
        <>
          {error && (
            <p style={{ color: 'red', border: '1px solid red', padding: '10px', borderRadius: '4px' }}>{error}</p>
          )}
          {message && (
            <p style={{ color: 'green', border: '1px solid green', padding: '10px', borderRadius: '4px' }}>{message}</p>
          )}
          {requests.length === 0 ? (
            <p>No pending requests.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
              {requests.map((request) => {
                const { user = {} } = request;
                const isExpanded = expandedId === request.id;
                return (
                  <div key={request.id} style={cardStyle}>
                    <div style={headerStyle}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
                          {request.legalName || user.name || 'Unknown applicant'}
                        </h3>
                        <p style={{ margin: '4px 0', color: '#334155' }}>{user.email || 'No email on file'}</p>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                          Submitted {formatDateTime(request.submittedAt)}
                        </p>
                      </div>
                      <div style={buttonGroupStyle}>
                        <button style={toggleButtonStyle} onClick={() => toggleExpanded(request.id)}>
                          {isExpanded ? 'Hide details' : 'View details'}
                        </button>
                        <button
                          style={approveButtonStyle(approvingId === request.userId)}
                          onClick={() => handleApprove(request.userId)}
                          disabled={approvingId === request.userId}
                        >
                          {approvingId === request.userId ? 'Approving...' : 'Approve'}
                        </button>
                      </div>
                    </div>
                    {isExpanded ? (
                      <div style={{ marginTop: '16px' }}>
                        <div style={detailGridStyle}>
                          <div>
                            <span style={labelStyle}>Legal Name</span>
                            <p style={valueStyle}>{request.legalName || '—'}</p>
                          </div>
                          <div>
                            <span style={labelStyle}>Organization</span>
                            <p style={valueStyle}>{request.organizationName || '—'}</p>
                          </div>
                          <div>
                            <span style={labelStyle}>Experience (years)</span>
                            <p style={valueStyle}>
                              {request.experienceYears === null ||
                              request.experienceYears === undefined ||
                              request.experienceYears === ''
                                ? '—'
                                : request.experienceYears}
                            </p>
                          </div>
                          <div>
                            <span style={labelStyle}>Government ID</span>
                            <p style={valueStyle}>{request.governmentIdNumber || '—'}</p>
                          </div>
                          <div>
                            <span style={labelStyle}>Contact Number</span>
                            <p style={valueStyle}>{user.gcashNumber || '—'}</p>
                          </div>
                        </div>
                        {request.certifications ? (
                          <div style={{ marginTop: '16px' }}>
                            <span style={labelStyle}>Certifications</span>
                            <p style={valueStyle}>{request.certifications}</p>
                          </div>
                        ) : null}
                        {request.bio ? (
                          <div style={{ marginTop: '16px' }}>
                            <span style={labelStyle}>Bio</span>
                            <p style={valueStyle}>{request.bio}</p>
                          </div>
                        ) : null}
                        {request.additionalNotes ? (
                          <div style={{ marginTop: '16px' }}>
                            <span style={labelStyle}>Additional Notes</span>
                            <p style={valueStyle}>{request.additionalNotes}</p>
                          </div>
                        ) : null}
                        {request.documentUrls && request.documentUrls.length > 0 ? (
                          <div style={{ marginTop: '20px' }}>
                            <span style={labelStyle}>Submitted Documents</span>
                            <div style={documentGridStyle}>
                              {request.documentUrls.map((url, index) => (
                                <button
                                  key={`${request.id}-doc-${index}`}
                                  style={documentButtonStyle}
                                  onClick={() => {
                                    if (typeof window !== 'undefined') {
                                      window.open(url, '_blank', 'noopener');
                                    }
                                  }}
                                >
                                  <img src={url} alt={`Document ${index + 1}`} style={documentImageStyle} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
