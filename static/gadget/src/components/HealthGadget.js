import React, { useEffect, useState, useCallback } from 'react';
import { invoke, router } from '@forge/bridge';
import GadgetWrapper from './GadgetWrapper';

const HealthGadget = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({ boardId: null });
  const [expandedCategory, setExpandedCategory] = useState(null);

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
      const result = await invoke('getSprintHealth', {
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

  if (!config.boardId && !loading) {
    return (
      <GadgetWrapper 
        gadgetTitle="Sprint Health"
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

  const { counts, issues, sprintName } = data;
  const total = counts.total || 1;

  const toggleCategory = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  // Circle component matching original design
  const HealthCircle = ({ count, label, color, type }) => {
    const isExpanded = expandedCategory === type;
    const size = 90;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: count > 0 ? 'pointer' : 'default',
          flex: 1
        }}
        onClick={() => count > 0 && toggleCategory(type)}
      >
        <div style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          border: `3px solid ${color}`,
          background: isExpanded ? `${color}18` : 'transparent',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          boxShadow: isExpanded ? `0 0 0 3px ${color}30` : 'none'
        }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: color,
            lineHeight: '1'
          }}>
            {count}
          </div>
          <div style={{
            fontSize: '11px',
            color: '#6B778C',
            marginTop: '2px'
          }}>
            /{total}
          </div>
        </div>
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          fontWeight: '600',
          color: '#42526E',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          textAlign: 'center'
        }}>
          {label}
        </div>
        {count > 0 && (
          <div style={{
            marginTop: '4px',
            fontSize: '10px',
            color: isExpanded ? color : '#97A0AF',
            fontWeight: '500'
          }}>
            {isExpanded ? '▲ Hide' : '▼ Details'}
          </div>
        )}
      </div>
    );
  };

  // Issue detail table
  const IssueTable = ({ issueList }) => {
    if (!issueList || issueList.length === 0) return null;
    return (
      <div style={{
        marginTop: '12px',
        border: '1px solid #EBECF0',
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#F4F5F7' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Key</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Summary</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Status</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Est.</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Remain</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Spent</th>
            </tr>
          </thead>
          <tbody>
            {issueList.map((issue, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F4F5F7' }}>
                <td style={{ padding: '5px 8px' }}>
                  <a
                    href={`/browse/${issue.key}`}
                    onClick={(e) => { e.preventDefault(); router.open(`/browse/${issue.key}`); }}
                    style={{ color: '#0052CC', textDecoration: 'none', fontWeight: '500', cursor: 'pointer' }}
                  >
                    {issue.key}
                  </a>
                </td>
                <td style={{ padding: '5px 8px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#172B4D' }}>
                  {issue.summary}
                </td>
                <td style={{ padding: '5px 8px', color: '#5E6C84', fontSize: '10px' }}>
                  {issue.status}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#5E6C84' }}>
                  {issue.originalEstimate}h
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#172B4D', fontWeight: '500' }}>
                  {issue.remainingEstimate}h
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#5E6C84' }}>
                  {issue.timeSpent}h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const underColor = '#F6C244';
  const normalColor = '#4C9AFF';
  const goodColor = '#57D9A3';

  return (
    <GadgetWrapper 
      gadgetTitle="Sprint Health"
      gadgetSubtitle={sprintName}
      onConfigChange={loadConfig}
    >
      <div className="gadget">
        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#172B4D' }}>Sprint Health</div>
          <div style={{ fontSize: '12px', color: '#6B778C', marginTop: '2px' }}>{sprintName}</div>
        </div>

        {/* Three circles */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'flex-start',
          marginBottom: '24px',
          padding: '0 8px'
        }}>
          <HealthCircle count={counts.under} label="Underestimated" color={underColor} type="under" />
          <HealthCircle count={counts.normal} label="Normal" color={normalColor} type="normal" />
          <HealthCircle count={counts.good} label="Good" color={goodColor} type="good" />
        </div>

        {/* Expanded detail table */}
        {expandedCategory && issues?.[expandedCategory] && (
          <IssueTable issueList={issues[expandedCategory]} />
        )}

        {/* Overall Progress bar */}
        <div style={{ marginTop: expandedCategory ? '16px' : '0' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px'
          }}>
            <span style={{ fontSize: '12px', color: '#6B778C' }}>Overall Progress</span>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#42526E' }}>{total} Total Items</span>
          </div>
          <div style={{
            display: 'flex',
            height: '10px',
            borderRadius: '5px',
            overflow: 'hidden',
            background: '#F4F5F7'
          }}>
            {counts.under > 0 && (
              <div style={{
                width: `${(counts.under / total) * 100}%`,
                background: underColor,
                transition: 'width 0.3s ease'
              }} />
            )}
            {counts.normal > 0 && (
              <div style={{
                width: `${(counts.normal / total) * 100}%`,
                background: normalColor,
                transition: 'width 0.3s ease'
              }} />
            )}
            {counts.good > 0 && (
              <div style={{
                width: `${(counts.good / total) * 100}%`,
                background: goodColor,
                transition: 'width 0.3s ease'
              }} />
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          marginTop: '12px',
          fontSize: '12px',
          color: '#42526E'
        }}>
          <span>
            <span style={{ color: underColor, fontSize: '14px', marginRight: '4px' }}>●</span>
            Under
          </span>
          <span>
            <span style={{ color: normalColor, fontSize: '14px', marginRight: '4px' }}>●</span>
            Normal
          </span>
          <span>
            <span style={{ color: goodColor, fontSize: '14px', marginRight: '4px' }}>●</span>
            Good
          </span>
        </div>
      </div>
    </GadgetWrapper>
  );
};

export default HealthGadget;
