import React, { useEffect, useState, useCallback } from 'react';
import { invoke, router } from '@forge/bridge';
import GadgetWrapper from './GadgetWrapper';

const PriorityGadget = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({ boardId: null });
  const [expanded, setExpanded] = useState(false);

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
        boardId: config.boardId,
        expand: expanded
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
  }, [config.boardId, expanded]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config.boardId) {
      loadData();
    }
  }, [config.boardId, loadData]);

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  const getPriorityBadge = (priority) => {
    const p = priority?.toLowerCase() || '';
    if (p === 'highest') return <span className="badge badge-priority-highest">🔴 {priority}</span>;
    if (p === 'high') return <span className="badge badge-priority-high">🟠 {priority}</span>;
    if (p === 'medium') return <span className="badge" style={{ background: '#FFF0B3', color: '#974F0C' }}>🟡 {priority}</span>;
    if (p === 'low') return <span className="badge" style={{ background: '#DEEBFF', color: '#0747A6' }}>🔵 {priority}</span>;
    return <span className="badge" style={{ background: '#F4F5F7', color: '#42526E' }}>⚪ {priority}</span>;
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

  // Jira-style Time Tracking Progress Bar
  const TimeTrackingBar = ({ originalEstimate, timeSpent, remainingEstimate }) => {
    const oe = originalEstimate || 0;
    const spent = timeSpent || 0;
    const remaining = remainingEstimate || 0;
    const total = spent + remaining;

    // No estimate at all
    if (oe === 0 && spent === 0 && remaining === 0) {
      return (
        <div style={{ fontSize: '10px', color: '#97A0AF', textAlign: 'center' }}>
          No estimate
        </div>
      );
    }

    const maxBar = Math.max(oe, total);
    const spentPct = maxBar > 0 ? (spent / maxBar) * 100 : 0;
    const remainPct = maxBar > 0 ? (remaining / maxBar) * 100 : 0;
    const isOverEstimate = total > oe && oe > 0;
    const overAmount = isOverEstimate ? total - oe : 0;
    const overPct = maxBar > 0 ? (overAmount / maxBar) * 100 : 0;

    // Colors: Blue = logged, Light blue = remaining, Red = over estimate
    const spentColor = isOverEstimate ? '#DE350B' : '#0065FF';
    const remainColor = '#DEEBFF';

    return (
      <div style={{ minWidth: '120px' }}>
        {/* Progress bar */}
        <div style={{
          display: 'flex',
          height: '6px',
          borderRadius: '3px',
          overflow: 'hidden',
          background: '#F4F5F7',
          marginBottom: '3px'
        }}>
          {spentPct > 0 && (
            <div style={{
              width: `${Math.min(spentPct, 100)}%`,
              background: spentColor,
              borderRadius: spentPct >= 100 ? '3px' : '3px 0 0 3px',
              transition: 'width 0.3s ease'
            }} />
          )}
          {remainPct > 0 && !isOverEstimate && (
            <div style={{
              width: `${remainPct}%`,
              background: remainColor,
              transition: 'width 0.3s ease'
            }} />
          )}
        </div>
        {/* Labels */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '9px',
          color: '#6B778C',
          lineHeight: '1.2'
        }}>
          <span style={{ color: spentColor, fontWeight: '600' }}>
            {spent}h logged
          </span>
          <span>
            {remaining}h remain
          </span>
        </div>
        {isOverEstimate && (
          <div style={{
            fontSize: '9px',
            color: '#DE350B',
            fontWeight: '600',
            textAlign: 'right'
          }}>
            +{overAmount.toFixed(1)}h over
          </div>
        )}
      </div>
    );
  };

  // Jira base URL


  if (!config.boardId && !loading) {
    return (
      <GadgetWrapper 
        gadgetTitle="High Priority Items"
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

  const {
    items,
    total,
    highestCount,
    highCount,
    mediumCount,
    lowCount,
    lowestCount,
    sprintName
  } = data;

  return (
    <GadgetWrapper 
      gadgetTitle={expanded ? 'All Sprint Tasks by Priority' : 'High Priority Items'}
      gadgetSubtitle={sprintName}
      onConfigChange={loadConfig}
    >
      <div className="gadget">
      {/* Header */}
      <div className="gadget-header">
        <div>
          <div className="gadget-title">
            {expanded ? 'All Sprint Tasks by Priority' : 'High Priority Items'}
          </div>
          <div className="gadget-subtitle">{sprintName}</div>
        </div>
        <span className={`count-badge ${(highestCount + highCount) > 0 ? 'danger' : ''}`}>
          {expanded ? `${total} items` : `${highestCount + highCount} items`}
        </span>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: expanded ? '8px' : '16px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        <div style={{
          flex: 1,
          minWidth: expanded ? '60px' : '80px',
          textAlign: 'center',
          padding: expanded ? '8px 4px' : '12px',
          background: '#ffebe6',
          borderRadius: '3px'
        }}>
          <div style={{
            fontSize: expanded ? '18px' : '24px',
            fontWeight: '700',
            color: '#bf2600'
          }}>
            {highestCount}
          </div>
          <div style={{ fontSize: '10px', color: '#bf2600' }}>🔴 Highest</div>
        </div>
        <div style={{
          flex: 1,
          minWidth: expanded ? '60px' : '80px',
          textAlign: 'center',
          padding: expanded ? '8px 4px' : '12px',
          background: '#fff0b3',
          borderRadius: '3px'
        }}>
          <div style={{
            fontSize: expanded ? '18px' : '24px',
            fontWeight: '700',
            color: '#974f0c'
          }}>
            {highCount}
          </div>
          <div style={{ fontSize: '10px', color: '#974f0c' }}>🟠 High</div>
        </div>
        {expanded && (
          <>
            <div style={{
              flex: 1,
              minWidth: '60px',
              textAlign: 'center',
              padding: '8px 4px',
              background: '#FFF7E6',
              borderRadius: '3px'
            }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#974f0c' }}>
                {mediumCount || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#974f0c' }}>🟡 Medium</div>
            </div>
            <div style={{
              flex: 1,
              minWidth: '60px',
              textAlign: 'center',
              padding: '8px 4px',
              background: '#DEEBFF',
              borderRadius: '3px'
            }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#0747a6' }}>
                {lowCount || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#0747a6' }}>🔵 Low</div>
            </div>
            <div style={{
              flex: 1,
              minWidth: '60px',
              textAlign: 'center',
              padding: '8px 4px',
              background: '#F4F5F7',
              borderRadius: '3px'
            }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#42526E' }}>
                {lowestCount || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#42526E' }}>⚪ Lowest</div>
            </div>
          </>
        )}
      </div>

      {/* Priority Distribution Bar (expanded mode) */}
      {expanded && total > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            marginBottom: '4px'
          }}>
            <span style={{ color: '#6b778c' }}>Priority Distribution</span>
            <span style={{ fontWeight: '600' }}>{total} Total</span>
          </div>
          <div className="progress-bar" style={{ height: '8px' }}>
            {highestCount > 0 && (
              <div className="progress-segment" style={{
                width: `${(highestCount / total) * 100}%`,
                background: '#DE350B'
              }} />
            )}
            {highCount > 0 && (
              <div className="progress-segment" style={{
                width: `${(highCount / total) * 100}%`,
                background: '#FF991F'
              }} />
            )}
            {(mediumCount || 0) > 0 && (
              <div className="progress-segment" style={{
                width: `${((mediumCount || 0) / total) * 100}%`,
                background: '#FFAB00'
              }} />
            )}
            {(lowCount || 0) > 0 && (
              <div className="progress-segment" style={{
                width: `${((lowCount || 0) / total) * 100}%`,
                background: '#2684FF'
              }} />
            )}
            {(lowestCount || 0) > 0 && (
              <div className="progress-segment" style={{
                width: `${((lowestCount || 0) / total) * 100}%`,
                background: '#97A0AF'
              }} />
            )}
          </div>
        </div>
      )}

      {/* Items Table */}
      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✨</div>
          <div className="empty-state-text">
            {expanded ? 'No tasks in sprint' : 'No high priority items'}
          </div>
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
                <th style={{ minWidth: '130px' }}>Time Tracking</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td>
                    <a
                      href={`/browse/${item.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => { e.preventDefault(); router.open(`/browse/${item.key}`); }}
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
                  <td>{getPriorityBadge(item.priority)}</td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    <TimeTrackingBar
                      originalEstimate={item.originalEstimate}
                      timeSpent={item.timeSpent}
                      remainingEstimate={item.remainingEstimate}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expand / Collapse Button */}
      <div style={{
        textAlign: 'center',
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #DFE1E6'
      }}>
        <button
          className="btn btn-secondary"
          onClick={handleToggleExpand}
          style={{
            fontSize: '12px',
            padding: '6px 16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {expanded ? (
            <>
              <span style={{ fontSize: '10px' }}>▲</span>
              Show Top 5 Only
            </>
          ) : (
            <>
              <span style={{ fontSize: '10px' }}>▼</span>
              Show All {total} Tasks by Priority
            </>
          )}
        </button>
      </div>
    </div>
    </GadgetWrapper>
  );
};

export default PriorityGadget;
