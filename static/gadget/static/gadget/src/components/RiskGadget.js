import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@forge/bridge';

const RiskGadget = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({ boardId: null });

  const loadConfig = useCallback(async () => {
    try {
      const savedConfig = await invoke('getConfig');
      if (savedConfig?.boardId) {
        setConfig(savedConfig);
      }
    } catch (err) {
      console.error('Error loading config:', err);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!config.boardId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invoke('getAtRiskItems', {
        boardId: config.boardId
      });

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [config.boardId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config.boardId) {
      loadData();
    }
  }, [config.boardId, loadData]);

  const getRiskBadge = (reason) => {
    if (reason === 'TIME_BOX_EXCEEDED') {
      return <span className="badge badge-risk-time">⏰ Time Box</span>;
    }
    return <span className="badge badge-risk-deadline">📅 Deadline</span>;
  };

  const getPriorityBadge = (priority) => {
    const p = priority?.toLowerCase();
    if (p === 'highest') return <span className="badge badge-priority-highest">{priority}</span>;
    if (p === 'high') return <span className="badge badge-priority-high">{priority}</span>;
    return <span className="badge badge-priority-medium">{priority}</span>;
  };

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('done') || s.includes('closed')) {
      return <span className="badge badge-status-done">{status}</span>;
    }
    if (s.includes('progress')) {
      return <span className="badge badge-status-progress">{status}</span>;
    }
    return <span className="badge badge-status-todo">{status}</span>;
  };

  if (!config.boardId && !loading) {
    return (
      <div className="configure-message">
        <p>⚙️ Please configure this gadget</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ marginTop: '12px' }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return <div className="error">⚠️ {error}</div>;
  }

  if (!data) return null;

  const { items, total, sprintName } = data;

  return (
    <div className="gadget">
      <div className="gadget-header">
        <div>
          <div className="gadget-title">At Risk Items</div>
          <div className="gadget-subtitle">{sprintName}</div>
        </div>
        <span className={`count-badge ${total > 0 ? 'danger' : ''}`}>
          {total} items
        </span>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-text">All tasks on track!</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Work</th>
                <th>Assignee</th>
                <th>Priority</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Est.</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 10).map((item) => (
                <tr key={item.key}>
                  <td>
                    <a
                      href={`/browse/${item.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="issue-key"
                    >
                      {item.key}
                    </a>
                    <div style={{
                      fontSize: '11px',
                      color: '#6b778c',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.summary}
                    </div>
                  </td>
                  <td style={{ fontSize: '11px' }}>{item.assignee}</td>
                  <td>{getPriorityBadge(item.priority)}</td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td style={{ textAlign: 'right', fontSize: '11px' }}>
                    {item.originalEstimate}h / {item.remainingEstimate}h
                  </td>
                  <td>{getRiskBadge(item.riskReason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 10 && (
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#6b778c', marginTop: '8px' }}>
              +{items.length - 10} more items
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default RiskGadget;
