import React, { useEffect, useState, useCallback } from 'react';
import { invoke, router } from '@forge/bridge';
import GadgetWrapper from './GadgetWrapper';

const ReleasesGadget = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({ boardId: null });
  const [expandedRelease, setExpandedRelease] = useState(null);

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
      const result = await invoke('getReleaseData', {
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

  const toggleExpand = (releaseId) => {
    setExpandedRelease(expandedRelease === releaseId ? null : releaseId);
  };

  const getProgressColor = (progress) => {
    if (progress >= 80) return '#57D9A3';
    if (progress >= 50) return '#B3D4FF';
    if (progress >= 20) return '#FFD666';
    return '#FF8F73';
  };

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('done') || s.includes('closed') || s.includes('resolved')) {
      return <span className="badge badge-status-done">{status}</span>;
    }
    if (s.includes('progress')) {
      return <span className="badge badge-status-progress">{status}</span>;
    }
    return <span className="badge badge-status-todo">{status}</span>;
  };

  const getPriorityIcon = (priority) => {
    const p = priority?.toLowerCase() || '';
    if (p === 'highest') return '●';
    if (p === 'high') return '●';
    if (p === 'medium') return '●';
    if (p === 'low') return '●';
    return '○';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'No date';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  if (!config.boardId && !loading) {
    return (
      <GadgetWrapper 
        gadgetTitle="Sprint Releases"
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
        <p style={{ marginTop: '12px' }}>Loading releases...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <p>⚠️ {error}</p>
        <button className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={loadData}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { releases, totalReleases, unversionedCount, sprintName } = data;

  return (
    <GadgetWrapper 
      gadgetTitle="Sprint Releases"
      gadgetSubtitle={sprintName}
      onConfigChange={loadConfig}
    >
      <div className="gadget">
      {/* Header */}
      <div className="gadget-header">
        <div>
          <div className="gadget-title">Releases</div>
          <div className="gadget-subtitle">{sprintName}</div>
        </div>
        <span className="count-badge">
          {totalReleases} release{totalReleases !== 1 ? 's' : ''}
        </span>
      </div>

      {releases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">-</div>
          <div className="empty-state-text">No releases linked to sprint tasks</div>
          {unversionedCount > 0 && (
            <p style={{ fontSize: '12px', color: '#6b778c', marginTop: '8px' }}>
              {unversionedCount} task{unversionedCount > 1 ? 's' : ''} without a release version
            </p>
          )}
        </div>
      ) : (
        <div>
          {/* Release Cards */}
          {releases.map((release) => {
            const progressColor = getProgressColor(release.progress);
            const isExpanded = expandedRelease === release.id;

            return (
              <div
                key={release.id}
                style={{
                  border: '1px solid #DFE1E6',
                  borderRadius: '4px',
                  marginBottom: '12px',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s',
                }}
              >
                {/* Release Header */}
                <div
                  style={{
                    padding: '12px 16px',
                    background: '#FAFBFC',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => toggleExpand(release.id)}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#7A869A' }}>
                        {release.released ? '●' : '○'}
                      </span>
                      <span style={{
                        fontWeight: '600',
                        fontSize: '14px',
                        color: '#172B4D'
                      }}>
                        {release.name}
                      </span>
                      {release.released && (
                        <span className="badge badge-status-done" style={{ fontSize: '10px' }}>
                          Released
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        fontSize: '12px',
                        color: '#6B778C'
                      }}>
                        {release.releaseDate ? formatDate(release.releaseDate) : 'No release date'}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: '#6B778C',
                        transition: 'transform 0.2s',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        display: 'inline-block'
                      }}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      marginBottom: '4px'
                    }}>
                      <span style={{ color: '#6B778C' }}>
                        {release.doneIssues}/{release.totalIssues} issues done
                      </span>
                      <span style={{
                        fontWeight: '700',
                        color: progressColor
                      }}>
                        {release.progress}%
                      </span>
                    </div>
                    <div className="progress-bar" style={{ height: '8px' }}>
                      <div
                        className="progress-segment"
                        style={{
                          width: `${release.progress}%`,
                          background: progressColor,
                          borderRadius: '4px',
                          transition: 'width 0.5s ease'
                        }}
                      />
                    </div>
                  </div>

                  {/* Estimate Info */}
                  {release.totalEstimate > 0 && (
                    <div style={{
                      display: 'flex',
                      gap: '16px',
                      fontSize: '11px',
                      color: '#6B778C',
                      marginTop: '6px'
                    }}>
                      <span>
                        Est: <strong style={{ color: '#172B4D' }}>{release.totalEstimate}h</strong>
                      </span>
                      <span>
                        Done: <strong style={{ color: '#172B4D' }}>{release.doneEstimate}h</strong>
                      </span>
                      <span>
                        Remaining: <strong style={{ color: '#5E6C84' }}>
                          {Math.round((release.totalEstimate - release.doneEstimate) * 10) / 10}h
                        </strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Expanded Issue List */}
                {isExpanded && release.issues && release.issues.length > 0 && (
                  <div style={{
                    borderTop: '1px solid #DFE1E6',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}>
                    <table className="table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Issue</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Assignee</th>
                          <th style={{ textAlign: 'right' }}>Est.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {release.issues.map((issue) => (
                          <tr key={issue.key} style={{
                            background: issue.isDone ? '#F4FFF8' : 'transparent'
                          }}>
                            <td>
                              <a
                                href={`/browse/${issue.key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => { e.preventDefault(); router.open(`/browse/${issue.key}`); }}
                                className="issue-key"
                                style={{ cursor: 'pointer' }}
                              >
                                {issue.key}
                              </a>
                              <div style={{
                                fontSize: '11px',
                                color: '#6b778c',
                                maxWidth: '200px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {issue.summary}
                              </div>
                            </td>
                            <td style={{ fontSize: '12px' }}>
                              {getPriorityIcon(issue.priority)} {issue.priority}
                            </td>
                            <td>{getStatusBadge(issue.status)}</td>
                            <td style={{ fontSize: '11px' }}>{issue.assignee}</td>
                            <td style={{ textAlign: 'right', fontSize: '11px' }}>
                              {issue.estimate > 0 ? `${issue.estimate}h` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unversioned Info */}
          {unversionedCount > 0 && (
            <div style={{
              padding: '10px 16px',
              background: '#FAFBFC',
              border: '1px solid #EBECF0',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#5E6C84',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span></span>
              <span>
                <strong>{unversionedCount}</strong> task{unversionedCount > 1 ? 's' : ''} in this sprint {unversionedCount > 1 ? 'are' : 'is'} not linked to any release version.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
    </GadgetWrapper>
  );
};

export default ReleasesGadget;
