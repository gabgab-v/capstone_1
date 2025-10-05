import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3000';
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
    try {
      const response = await adminApi.post(`/api/admin/approve-organizer/${userId}`);
      setMessage(response.data?.message || 'Organizer approved successfully.');
      fetchRequests();
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
    }
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
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
              <thead>
                <tr style={{ background: '#f2f2f2' }}>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{req.name}</td>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{req.email}</td>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                      <button
                        onClick={() => handleApprove(req.id)}
                        style={{
                          cursor: 'pointer',
                          background: 'green',
                          color: 'white',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '4px',
                        }}
                      >
                        Approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
};
