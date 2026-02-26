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

  const categoryConfig = {
    under: { label: 'Underestimated', color: '#DE350B', bgColor: '#FFEBE6', borderColor: '#FF8F73' },
    normal: { label: 'Normal', color: '#0052CC', bgColor: '#DEEBFF', borderColor: '#B3D4FF' },
    good: { label: 'Good', color: '#006644', bgColor: '#E3FCEF', borderColor: '#ABF5D1' }
  };

  const IssueTable = ({ issueList, type }) => {
    if (!issueList || issueList.length === 0) return null;
    const cfg = categoryConfig[type];
    return (
      <div style={{ marginTop: '8px', marginBottom: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#F4F5F7' }}>
              <th style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Key</th>
              <th style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Summary</th>
              <th style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Status</th>
              <th style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Est.</th>
              <th style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Remain</th>
              <th style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #DFE1E6', color: '#5E6C84', fontWeight: '500' }}>Spent</th>
            </tr>
          </thead>
          <tbody>
            {issueList.map((issue, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F4F5F7' }}>
                <td style={{ padding: '4px 6px' }}>
                  <a
                    href={`/browse/${issue.key}`}
                    onClick={(e) => { e.preventDefault(); router.open(`/browse/${issue.key}`); }}
                    style={{ color: '#0052CC', textDecoration: 'none', fontWeight: '500', cursor: 'pointer' }}
                  >
                    {issue.key}
                  </a>
                </td>
                <td style={{ padding: '4px 6px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#172B4D' }}>
                  {issue.summary}
                </td>
                <td style={{ padding: '4px 6px', color: '#5E6C84', fontSize: '10px' }}>
                  {issue.status}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: '#5E6C84' }}>
                  {issue.originalEstimate}h
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: '#172B4D', fontWeight: '500' }}>
                  {issue.remainingEstimate}h
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: '#5E6C84' }}>
                  {issue.timeSpent}h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const HealthCard = ({ count, type }) => {
    const cfg = categoryConfig[type];
    const isExpanded = expandedCategory === type;
    const issueList = issues?.[type] || [];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    return (
      <div style={{ marginBottom: '2px' }}>
        <div
          onClick={() => count > 0 && toggleCategory(type)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: '6px',
            background: isExpanded ? cfg.bgColor : '#FAFBFC',
            border: `1px solid ${isExpanded ? cfg.borderColor : '#EBECF0'}`,
            cursor: count > 0 ? 'pointer' : 'default',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: cfg.color, opacity: 0.8
            }} />
            <span style={{ fontSize: '13px', color: '#172B4D', fontWeight: '500' }}>{cfg.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#172B4D' }}>{count}</span>
            <span style={{ fontSize: '11px', color: '#5E6C84' }}>({pct}%)</span>
            {count > 0 && (
              <span style={{ fontSize: '10px', color: '#5E6C84', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▼</span>
            )}
          </div>
        </div>
        {isExpanded && <IssueTable issueList={issueList} type={type} />}
      </div>
    );
  };

  return (
    <GadgetWrapper 
      gadgetTitle="Sprint Health"
      gadgetSubtitle={sprintName}
      onConfigChange={loadConfig}
    >
      <div className="gadget">
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#172B4D' }}>Sprint Health</div>
          <div style={{ fontSize: '12px', color: '#5E6C84', marginTop: '2px' }}>{sprintName}</div>
        </div>

        {/* Summary bar */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: '#F4F5F7' }}>
            <div style={{ width: `${(counts.under / total) * 100}%`, background: '#DE350B', transition: 'width 0.3s' }} />
            <div style={{ width: `${(counts.normal / total) * 100}%`, background: '#0052CC', transition: 'width 0.3s' }} />
            <div style={{ width: `${(counts.good / total) * 100}%`, background: '#006644', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '11px', color: '#5E6C84', marginTop: '4px', textAlign: 'right' }}>
            {total} items
          </div>
        </div>

        {/* Category cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <HealthCard count={counts.under} type="under" />
          <HealthCard count={counts.normal} type="normal" />
          <HealthCard count={counts.good} type="good" />
        </div>
      </div>
    </GadgetWrapper>
  );
};

export default HealthGadget;
