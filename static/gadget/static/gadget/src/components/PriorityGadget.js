import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@forge/bridge';

const PriorityGadget = () => {
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
      const result = await invoke('getHighPriorityItems', {
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

  const getPriorityBadge = (priority) => {
    if (priority === 'Highest') {
      return <span className="badge badge-priority-highest">🔴 {priority}</span>;
    }
    return <span className="badge badge-priority-high">🟠 {priority}</span>;
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

  const { items, total, highestCount, highCount, sprintName } = data;

  return (
    <div className="gadget">
      <div className="gadget-header">
        <div>
          <div className="gadget-title">High Priority Items</div>
          <div className="gadget-subtitle">{sprintName}</div>
        </div>
        <span className={`count-badge ${total > 0 ? 'danger' : ''}`}>
          {total} items
        </span>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px', background: '#ffebe6', borderRadius: '3px' }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#bf2600' }}>{highestCount}</div>
          <div style={{ fontSize: '11px', color: '#bf2600' }}>🔴 Highest</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px', background: '#fff0b3', borderRadius: '3px' }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#974f0c' }}>{highCount}</div>
          <div style={{ fontSize: '11px', color: '#974f0c' }}>🟠 High</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✨</div>
          <div className="empty-state-text">No high priority items</div>
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
                <th style={{ textAlign: 'right' }}>Original</th>
                <th style={{ textAlign: 'right' }}>Remaining</th>
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
                      maxWidth: '180px',
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
                    {item.originalEstimate}h
                  </td>
                  <td style={{ textAlign: 'right', fontSize: '11px' }}>
                    {item.remainingEstimate}h
                  </td>
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

export default PriorityGadget;
