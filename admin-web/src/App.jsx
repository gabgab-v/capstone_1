import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './App.css';

const resolveApiBaseUrl = () => {
  const raw =
    import.meta.env.VITE_ADMIN_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    '';

  if (typeof raw !== 'string' || raw.trim() === '') {
    return 'http://localhost:3000';
  }

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

const defaultStats = Object.freeze({ total: 0, pending: 0, approved: 0, rejected: 0 });
const unknownValue = 'N/A';

const normaliseStatus = (value) => {
  if (!value) {
    return 'pending';
  }
  const status = String(value).toLowerCase();
  if (status.includes('approve')) {
    return 'approved';
  }
  if (status.includes('reject') || status.includes('declin')) {
    return 'rejected';
  }
  if (status.includes('pending') || status.includes('review') || status.includes('await')) {
    return 'pending';
  }
  return status;
};

const statusClassName = (value) => {
  const status = normaliseStatus(value);
  if (status === 'approved' || status === 'pending' || status === 'rejected') {
    return status;
  }
  return 'info';
};

const formatDateTime = (value, { includeTime = false } = {}) => {
  if (!value) {
    return unknownValue;
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const options = {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    };
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return date.toLocaleString(undefined, options);
  } catch {
    return String(value);
  }
};

const computeStatusCounts = (collection = []) =>
  collection.reduce(
    (acc, item) => {
      const status = normaliseStatus(item.status || item.reviewStatus || item.decision || item.state);
      acc.total += 1;
      if (status === 'approved') {
        acc.approved += 1;
      } else if (status === 'rejected') {
        acc.rejected += 1;
      } else {
        acc.pending += 1;
      }
      return acc;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 },
  );

const getInitials = (value) => {
  if (!value) {
    return 'AD';
  }
  const parts = String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'AD';
};

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === TOKEN_KEY) {
        setToken(event.newValue);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return token ? <Dashboard setToken={setToken} /> : <Login setToken={setToken} />;
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
        setError('Login succeeded but the server did not provide a token.');
        return;
      }

      localStorage.setItem(TOKEN_KEY, token);
      setToken(token);
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.message || 'Invalid credentials. Please try again.');
      } else if (err.request) {
        setError('Network error: unable to reach the server.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <h2>Pabukid Admin</h2>
        <form className="login-form" onSubmit={handleLogin}>
          <input
            className="form-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email address"
            autoComplete="username"
            required
          />
          <input
            className="form-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
          />
          <button className="form-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </div>
  );
};
const Dashboard = ({ setToken }) => {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [organizerStats, setOrganizerStats] = useState(defaultStats);
  const [expertStats, setExpertStats] = useState(defaultStats);
  const [organizerData, setOrganizerData] = useState([]);
  const [expertData, setExpertData] = useState([]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, [setToken]);

  useEffect(() => {
    let isMounted = true;

    const fetchUsers = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await adminApi.get('/api/admin/users');
        if (!isMounted) {
          return;
        }
        const payload = response.data?.users ?? response.data ?? [];
        setUsers(Array.isArray(payload) ? payload : []);
      } catch (err) {
        console.error('Fetch users error:', err);
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          handleLogout();
        } else if (err.response) {
          setError(err.response.data?.message || 'Unable to fetch users.');
        } else if (err.request) {
          setError('Network error: unable to reach the server.');
        } else {
          setError('Unexpected error encountered while fetching users.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, [handleLogout]);

  const submissions = useMemo(() => {
    const organizerEntries =
      organizerData?.map((request) => ({
        id: `organizer-${request.id ?? request.userId ?? Math.random().toString(36).slice(2)}`,
        applicant: request.legalName || request.user?.name || 'Organizer applicant',
        email: request.user?.email || request.email || '',
        submittedAt: request.submittedAt || request.createdAt || request.updatedAt,
        status: request.status || request.reviewStatus || request.decision || 'Pending',
        type: 'Organizer',
      })) ?? [];

    const expertEntries =
      expertData?.map((request) => ({
        id: `expert-${request.id ?? request.userId ?? Math.random().toString(36).slice(2)}`,
        applicant: request.user?.name || request.summitName || 'Expert applicant',
        email: request.user?.email || request.email || '',
        submittedAt: request.submittedAt || request.createdAt || request.updatedAt,
        status: request.status || request.reviewStatus || request.decision || 'Pending',
        type: 'Expert',
      })) ?? [];

    if (organizerEntries.length || expertEntries.length) {
      return [...organizerEntries, ...expertEntries];
    }

    return (users || []).map((user) => ({
      id: `user-${user.id}`,
      applicant: user.name || 'Pabukid user',
      email: user.email || '',
      submittedAt: user.createdAt || user.updatedAt,
      status: user.status || user.role || 'Active',
      type: user.role || 'User',
    }));
  }, [expertData, organizerData, users]);

  const statusOptions = useMemo(() => {
    const values = new Set();
    submissions.forEach((item) => values.add(normaliseStatus(item.status)));
    return ['all', ...Array.from(values)];
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const status = statusFilter === 'all' ? null : statusFilter;

    return submissions.filter((item) => {
      const matchesTerm =
        term.length === 0 ||
        item.applicant.toLowerCase().includes(term) ||
        (item.email && item.email.toLowerCase().includes(term));
      const currentStatus = normaliseStatus(item.status);
      const matchesStatus = !status || currentStatus === status;
      return matchesTerm && matchesStatus;
    });
  }, [searchTerm, statusFilter, submissions]);

  const recentActivity = useMemo(() => {
    const copy = submissions
      .filter((item) => item.submittedAt)
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.submittedAt).getTime();
        const bTime = new Date(b.submittedAt).getTime();
        return bTime - aTime;
      });
    return copy.slice(0, 5);
  }, [submissions]);

  const aggregatedStats = useMemo(
    () => ({
      total: (organizerStats.total || 0) + (expertStats.total || 0),
      pending: (organizerStats.pending || 0) + (expertStats.pending || 0),
      approved: (organizerStats.approved || 0) + (expertStats.approved || 0),
      rejected: (organizerStats.rejected || 0) + (expertStats.rejected || 0),
    }),
    [expertStats, organizerStats],
  );

  const statCards = [
    {
      key: 'total',
      label: 'Total Submissions',
      value: aggregatedStats.total || submissions.length,
      badge: 'T',
      variant: 'primary',
    },
    {
      key: 'pending',
      label: 'Pending Review',
      value: aggregatedStats.pending,
      badge: 'P',
      variant: 'warning',
    },
    {
      key: 'approved',
      label: 'Approved',
      value: aggregatedStats.approved,
      badge: 'A',
      variant: 'success',
    },
    {
      key: 'rejected',
      label: 'Rejected',
      value: aggregatedStats.rejected,
      badge: 'R',
      variant: 'danger',
    },
  ];

  const handleNavigate = useCallback((target) => {
    if (typeof document === 'undefined') {
      return;
    }
    const element =
      target === 'organizer'
        ? document.getElementById('organizer-requests')
        : target === 'expert'
        ? document.getElementById('expert-requests')
        : target === 'dashboard'
        ? document.getElementById('dashboard')
        : document.getElementById('submissions-panel');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__title">Pabukid</span>
          <span className="admin-brand__tagline">Admin panel</span>
        </div>
        <nav className="admin-nav">
          <div className="admin-nav-group">
            <button type="button" className="admin-nav-item admin-nav-item--active" onClick={() => handleNavigate('dashboard')}>
              <span className="admin-nav-item__icon">
                <span className="badge-dot" />
              </span>
              Dashboard
            </button>
            <button type="button" className="admin-nav-item" onClick={() => handleNavigate('submissions')}>
              <span className="admin-nav-item__icon" />
              Submissions
            </button>
          </div>
        </nav>
        <button type="button" className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      </aside>
      <div className="admin-main">
        <header className="admin-header" id="dashboard">
          <div className="admin-header__left">
            <h1 className="admin-header__title">Dashboard</h1>
            <p className="admin-header__subtitle">Certification submissions overview</p>
          </div>
          <div className="admin-header__actions">
            <div className="admin-search">
              <MagnifierIcon className="admin-search__icon" />
              <input
                aria-label="Search applicants"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search applicants"
              />
            </div>
            <button type="button" className="admin-icon-button" onClick={() => handleNavigate('submissions')}>
              <BellIcon />
            </button>
            <div className="admin-avatar">{getInitials('Admin User')}</div>
          </div>
        </header>

        <main className="admin-content">
          <section className="stats-grid">
            {statCards.map((card) => (
              <article key={card.key} className={`stat-card stat-card--${card.variant}`}>
                <div className="stat-card__badge">{card.badge}</div>
                <span className="stat-card__label">{card.label}</span>
                <span className="stat-card__value">{card.value}</span>
                {card.key === 'pending' && aggregatedStats.pending > 0 ? (
                  <span className="stat-card__delta">Needs your review</span>
                ) : null}
              </article>
            ))}
          </section>

          <section className="panel">
            <div className="panel__header">
              <div className="panel__header-row">
                <h2 className="panel__title">Recent Activity</h2>
                <div className="panel__actions">
                  <button type="button" className="link-button" onClick={() => handleNavigate('submissions')}>
                    Review submissions
                  </button>
                </div>
              </div>
              <p className="panel__subtitle">Latest actions from organizer and expert applications.</p>
            </div>
            <div className="panel__body">
              {recentActivity.length === 0 ? (
                <p className="panel__empty">No recent submissions yet.</p>
              ) : (
                <ul className="activity-list">
                  {recentActivity.map((item) => (
                    <li key={item.id} className="activity-item">
                      <span className="activity-item__bullet" />
                      <div className="activity-item__content">
                        <p className="activity-item__title">
                          {item.applicant} | {item.type}
                        </p>
                        <p className="activity-item__meta">
                          {formatDateTime(item.submittedAt, { includeTime: true })} | {normaliseStatus(item.status)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel" id="submissions-panel">
            <div className="panel__header">
              <div className="panel__header-row">
                <h2 className="panel__title">Certificate Submissions</h2>
              </div>
              <p className="panel__subtitle">Search, filter, and review incoming organizer and expert requests.</p>
            </div>
            <div className="panel__body">
              {error ? <div className="error-banner">{error}</div> : null}
              <div className="filter-row">
                <input
                  className="filter-input"
                  placeholder="Search applicants"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status === 'all' ? 'All status' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Applicants</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Type</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          Loading submissions...
                        </td>
                      </tr>
                    ) : filteredSubmissions.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          No submissions match your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredSubmissions.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="table-applicant">
                              <div className="table-avatar">{getInitials(item.applicant)}</div>
                              <div>
                                <div>{item.applicant}</div>
                                {item.email ? <small className="activity-item__meta">{item.email}</small> : null}
                              </div>
                            </div>
                          </td>
                          <td>{formatDateTime(item.submittedAt)}</td>
                          <td>
                            <span className={`status-pill status-pill--${statusClassName(item.status)}`}>
                              {normaliseStatus(item.status)}
                            </span>
                          </td>
                          <td>{item.type}</td>
                          <td>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() =>
                                handleNavigate(
                                  item.type === 'Organizer' ? 'organizer' : item.type === 'Expert' ? 'expert' : 'submissions',
                                )
                              }
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <OrganizerRequests
            onUnauthorized={handleLogout}
            onStatsUpdate={setOrganizerStats}
            onDataChange={setOrganizerData}
          />

          <ExpertRequests
            onUnauthorized={handleLogout}
            onStatsUpdate={setExpertStats}
            onDataChange={setExpertData}
          />
        </main>
      </div>
    </div>
  );
};
const OrganizerRequests = ({ onUnauthorized, onStatsUpdate, onDataChange }) => {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await adminApi.get('/api/admin/organizer-requests');
      const payload = response.data?.requests ?? response.data ?? [];
      const items = Array.isArray(payload) ? payload : [];
      setRequests(items);
      onStatsUpdate?.(computeStatusCounts(items));
      onDataChange?.(items);
    } catch (err) {
      console.error('Fetch organizer requests error:', err);
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        onUnauthorized?.();
      } else if (err.response) {
        setError(err.response.data?.message || 'Unable to load organizer requests.');
      } else if (err.request) {
        setError('Network error: no response received.');
      } else {
        setError('Unexpected error while fetching organizer requests.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [onDataChange, onStatsUpdate, onUnauthorized]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (userId) => {
    setMessage('');
    setError('');
    setApprovingId(userId);
    try {
      const response = await adminApi.post(`/api/admin/approve-organizer/${userId}`);
      setMessage(response.data?.message || 'Organizer approved successfully.');
      await fetchRequests();
    } catch (err) {
      console.error('Approve organizer error:', err);
      if (err.response) {
        setError(err.response.data?.message || 'Failed to approve organizer.');
        if (err.response.status === 401 || err.response.status === 403) {
          onUnauthorized?.();
        }
      } else if (err.request) {
        setError('Network error: no response received.');
      } else {
        setError('Unexpected error while approving organizer.');
      }
    } finally {
      setApprovingId(null);
    }
  };

  const toggleExpanded = (requestId) => {
    setExpandedId((prev) => (prev === requestId ? null : requestId));
  };

  const buildDetails = (request, applicant) => [
    { label: 'Legal name', value: request.legalName || unknownValue },
    { label: 'Organization', value: request.organizationName || unknownValue },
    {
      label: 'Experience (years)',
      value:
        request.experienceYears === null ||
        request.experienceYears === undefined ||
        request.experienceYears === ''
          ? unknownValue
          : request.experienceYears,
    },
    { label: 'Government ID', value: request.governmentIdNumber || unknownValue },
    { label: 'Contact number', value: applicant.gcashNumber || request.contactNumber || unknownValue },
  ];
  return (
    <section className="panel" id="organizer-requests">
      <div className="panel__header">
        <div className="panel__header-row">
          <h2 className="panel__title">Organizer Requests</h2>
          <div className="panel__actions">
            <button type="button" className="link-button" onClick={fetchRequests} disabled={isLoading}>
              Refresh
            </button>
          </div>
        </div>
        <p className="panel__subtitle">Applications awaiting approval to host events on the platform.</p>
      </div>
      <div className="panel__body">
        {error ? <div className="error-banner">{error}</div> : null}
        {message ? <div className="success-banner">{message}</div> : null}
        {isLoading ? (
          <p className="panel__empty">Loading organizer requests...</p>
        ) : requests.length === 0 ? (
          <p className="panel__empty">No organizer requests require attention right now.</p>
        ) : (
          <div className="request-stack">
            {requests.map((request) => {
              const key = request.id ?? request.userId;
              const applicant = request.user || {};
              const isExpanded = expandedId === key;
              const details = buildDetails(request, applicant);
              return (
                <article key={key} className="request-card">
                  <div className="request-card__header">
                    <div>
                      <h3 className="request-card__title">
                        {request.legalName || applicant.name || 'Organizer applicant'}
                      </h3>
                      <p className="request-card__meta">
                        {applicant.email || request.email || 'No email on file'} | Submitted{' '}
                        {formatDateTime(request.submittedAt, { includeTime: true })}
                      </p>
                    </div>
                    <div className="request-card__actions">
                      <button type="button" className="button button--ghost" onClick={() => toggleExpanded(key)}>
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                      <button
                        type="button"
                        className="button button--approve"
                        onClick={() => handleApprove(request.userId)}
                        disabled={approvingId === request.userId}
                      >
                        {approvingId === request.userId ? 'Approving...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="request-card__body">
                      <div className="request-detail-grid">
                        {details.map((item) => (
                          <div key={`${key}-${item.label}`}>
                            <span className="detail-label">{item.label}</span>
                            <p className="detail-value">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {request.certifications ? (
                        <div>
                          <span className="detail-label">Certifications</span>
                          <p className="detail-value">{request.certifications}</p>
                        </div>
                      ) : null}
                      {request.bio ? (
                        <div>
                          <span className="detail-label">Bio</span>
                          <p className="detail-value">{request.bio}</p>
                        </div>
                      ) : null}
                      {request.additionalNotes ? (
                        <div>
                          <span className="detail-label">Additional notes</span>
                          <p className="detail-value">{request.additionalNotes}</p>
                        </div>
                      ) : null}
                      {request.documentUrls && request.documentUrls.length > 0 ? (
                        <div>
                          <span className="detail-label">Submitted documents</span>
                          <div className="request-documents">
                            {request.documentUrls.map((url, index) => (
                              <button
                                key={`${key}-doc-${index}`}
                                type="button"
                                className="document-preview"
                                onClick={() => window.open(url, '_blank', 'noopener')}
                              >
                                <img src={url} alt={`Document ${index + 1}`} />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
const ExpertRequests = ({ onUnauthorized, onStatsUpdate, onDataChange }) => {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await adminApi.get('/api/admin/expert-requests');
      const payload = response.data?.requests ?? response.data ?? [];
      const items = Array.isArray(payload) ? payload : [];
      setRequests(items);
      onStatsUpdate?.(computeStatusCounts(items));
      onDataChange?.(items);
    } catch (err) {
      console.error('Fetch expert requests error:', err);
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        onUnauthorized?.();
      } else if (err.response) {
        setError(err.response.data?.message || 'Unable to load expert requests.');
      } else if (err.request) {
        setError('Network error: no response received.');
      } else {
        setError('Unexpected error while fetching expert requests.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [onDataChange, onStatsUpdate, onUnauthorized]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const toggleExpanded = (requestId) => {
    setExpandedId((prev) => (prev === requestId ? null : requestId));
  };

  const handleApprove = async (userId) => {
    setProcessingId(userId);
    setError('');
    setMessage('');
    try {
      const response = await adminApi.post(`/api/admin/approve-expert/${userId}`);
      setMessage(response.data?.message || 'Expert verification approved.');
      await fetchRequests();
    } catch (err) {
      console.error('Approve expert error:', err);
      if (err.response) {
        setError(err.response.data?.message || 'Failed to approve expert.');
        if (err.response.status === 401 || err.response.status === 403) {
          onUnauthorized?.();
        }
      } else if (err.request) {
        setError('Network error: no response received.');
      } else {
        setError('Unexpected error while approving expert.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId) => {
    const reviewNotes = window.prompt('Optional: include notes for the applicant (leave blank for none).', '');
    if (reviewNotes === null) {
      return;
    }

    setProcessingId(userId);
    setError('');
    setMessage('');
    try {
      const response = await adminApi.post(`/api/admin/reject-expert/${userId}`, {
        reviewNotes: reviewNotes.trim() || undefined,
      });
      setMessage(response.data?.message || 'Expert verification rejected.');
      await fetchRequests();
    } catch (err) {
      console.error('Reject expert error:', err);
      if (err.response) {
        setError(err.response.data?.message || 'Failed to reject expert.');
        if (err.response.status === 401 || err.response.status === 403) {
          onUnauthorized?.();
        }
      } else if (err.request) {
        setError('Network error: no response received.');
      } else {
        setError('Unexpected error while rejecting expert.');
      }
    } finally {
      setProcessingId(null);
    }
  };
  return (
    <section className="panel" id="expert-requests">
      <div className="panel__header">
        <div className="panel__header-row">
          <h2 className="panel__title">Expert Verifications</h2>
          <div className="panel__actions">
            <button type="button" className="link-button" onClick={fetchRequests} disabled={isLoading}>
              Refresh
            </button>
          </div>
        </div>
        <p className="panel__subtitle">Assess climber experience and supporting documents before approving experts.</p>
      </div>
      <div className="panel__body">
        {error ? <div className="error-banner">{error}</div> : null}
        {message ? <div className="success-banner">{message}</div> : null}
        {isLoading ? (
          <p className="panel__empty">Loading expert requests...</p>
        ) : requests.length === 0 ? (
          <p className="panel__empty">No expert requests need review at the moment.</p>
        ) : (
          <div className="request-stack">
            {requests.map((request) => {
              const key = request.id ?? request.userId;
              const applicant = request.user || {};
              const isExpanded = expandedId === key;
              const isProcessing = processingId === request.userId;
              return (
                <article key={key} className="request-card">
                  <div className="request-card__header">
                    <div>
                      <h3 className="request-card__title">{request.summitName || applicant.name || 'Expert applicant'}</h3>
                      <p className="request-card__meta">
                        {(applicant.email || request.email || 'No email provided')} | Submitted{' '}
                        {formatDateTime(request.submittedAt, { includeTime: true })}
                      </p>
                    </div>
                    <div className="request-card__actions">
                      <button type="button" className="button button--ghost" onClick={() => toggleExpanded(key)}>
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                      <button
                        type="button"
                        className="button button--approve"
                        onClick={() => handleApprove(request.userId)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className="button button--reject"
                        onClick={() => handleReject(request.userId)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? 'Processing...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="request-card__body">
                      <div className="request-detail-grid">
                        <div>
                          <span className="detail-label">Summit</span>
                          <p className="detail-value">{request.summitName || unknownValue}</p>
                        </div>
                        <div>
                          <span className="detail-label">Summit date</span>
                          <p className="detail-value">
                            {request.summitDate ? formatDateTime(request.summitDate) : unknownValue}
                          </p>
                        </div>
                        <div>
                          <span className="detail-label">Experience level</span>
                          <p className="detail-value">{applicant.experienceLevel || unknownValue}</p>
                        </div>
                        <div>
                          <span className="detail-label">Current status</span>
                          <p className="detail-value">{request.status || request.reviewStatus || 'Pending'}</p>
                        </div>
                      </div>
                      {request.additionalNotes ? (
                        <div>
                          <span className="detail-label">Applicant notes</span>
                          <p className="detail-value">{request.additionalNotes}</p>
                        </div>
                      ) : null}
                      <div className="request-documents">
                        {request.peakPhotoUrl ? (
                          <button
                            type="button"
                            className="document-preview"
                            onClick={() => window.open(request.peakPhotoUrl, '_blank', 'noopener')}
                          >
                            <img src={request.peakPhotoUrl} alt="Summit proof" />
                          </button>
                        ) : null}
                        {request.certificateUrl ? (
                          <button
                            type="button"
                            className="document-preview"
                            onClick={() => window.open(request.certificateUrl, '_blank', 'noopener')}
                          >
                            <img src={request.certificateUrl} alt="Certificate" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
const MagnifierIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M8.5 2a6.5 6.5 0 014.94 10.73l3.41 3.42-1.41 1.41-3.42-3.41A6.5 6.5 0 118.5 2zm0 2a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"
      fill="currentColor"
    />
  </svg>
);

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M10 18a2 2 0 002-2H8a2 2 0 002 2zm6-5V9a6 6 0 10-12 0v4l-1.5 1.5a.5.5 0 00.35.85h14.3a.5.5 0 00.35-.85L16 13z"
      fill="currentColor"
    />
  </svg>
);


