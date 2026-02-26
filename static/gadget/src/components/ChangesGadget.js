import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import GadgetWrapper from './GadgetWrapper';

const JIRA_BASE_URL = 'https://jeisysvn.atlassian.net/browse/';

const ChangesGadget = () => {
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
      const result = await invoke('getScopeChanges', {
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

  const getChangeBadge = (type) => {
    switch (type) {
      case 'ADDED':
        return <span className="badge badge-change-added">+ Added</span>;
      case 'REMOVED':
        return <span className="badge badge-change-removed">- Removed</span>;
      case 'PRIORITY':
        return <span className="badge badge-change-priority">Priority</span>;
      default:
        return null;
    }
  };

  const formatChangeDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  };

  if (!config.boardId && !loading) {
    return (
      <GadgetWrapper 
        gadgetTitle="Scope Changes"
        gadgetSubtitle=""
        onConfigChange={loadConfig}
      >
        <div className="gadget" />
      </GadgetWrapper>
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
    return <div className="error">{error}</div>;
  }

  if (!data) return null;

  const { added, removed, priorityChanged, totalAdded, totalRemoved, totalPriorityChanged, sprintName } = data;
  const totalChanges = totalAdded + totalRemoved + totalPriorityChanged;

  // Combine all changes for display
  const allChanges = [
    ...added.map(item => ({ ...item, changeType: 'ADDED' })),
    ...removed.map(item => ({ ...item, changeType: 'REMOVED' })),
    ...priorityChanged.map(item => ({ ...item, changeType: 'PRIORITY' }))
  ].sort((a, b) => {
    const dateA = a.changeDate ? new Date(a.changeDate) : new Date(0);
    const dateB = b.changeDate ? new Date(b.changeDate) : new Date(0);
    return dateB - dateA;
  });

  return (
    <GadgetWrapper 
      gadgetTitle="Scope Changes"
      gadgetSubtitle={sprintName}
      onConfigChange={loadConfig}
    >
      <div className="gadget">
      <div className="gadget-header">
        <div>
          <div className="gadget-title">Scope Changes</div>
          <div className="gadget-subtitle">{sprintName}</div>
        </div>
        <span className="count-badge">{totalChanges} changes</span>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px', background: '#e3fcef', borderRadius: '3px' }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#006644' }}>{totalAdded}</div>
          <div style={{ fontSize: '11px', color: '#006644' }}>Added</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px', background: '#ffebe6', borderRadius: '3px' }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#bf2600' }}>{totalRemoved}</div>
          <div style={{ fontSize: '11px', color: '#bf2600' }}>Removed</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '12px', background: '#fff0b3', borderRadius: '3px' }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#974f0c' }}>{totalPriorityChanged}</div>
          <div style={{ fontSize: '11px', color: '#974f0c' }}>Priority</div>
        </div>
      </div>

      {allChanges.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-text">No scope changes detected</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Work</th>
                <th>Assignee</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Est.</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {allChanges.slice(0, 15).map((item, index) => (
                <tr key={`${item.key}-${index}`}>
                  <td>
                    <a
                      href={`${JIRA_BASE_URL}${item.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => { e.preventDefault(); (window.top || window.parent || window).open(`${JIRA_BASE_URL}${item.key}`, '_blank'); }}
                      className="issue-key"
                      style={{ cursor: 'pointer' }}
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
                  <td style={{ fontSize: '10px', color: '#6b778c', whiteSpace: 'nowrap' }}>
                    {formatChangeDate(item.changeDate)}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: '11px' }}>
                    {item.originalEstimate}h
                  </td>
                  <td>{getChangeBadge(item.changeType)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {allChanges.length > 15 && (
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#6b778c', marginTop: '8px' }}>
              +{allChanges.length - 15} more changes
            </p>
          )}
        </div>
      )}
    </div>
    </GadgetWrapper>
  );
};

export default ChangesGadget;
