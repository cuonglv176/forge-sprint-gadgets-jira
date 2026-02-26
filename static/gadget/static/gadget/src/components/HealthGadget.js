import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@forge/bridge';

const HealthGadget = () => {
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

  const { counts, sprintName } = data;
  const total = counts.total || 1;

  const HealthCircle = ({ count, label, type }) => (
    <div className={`health-circle health-${type}`}>
      <div className="health-circle-value">
        <span>{count}</span>
        <small>/{total}</small>
      </div>
      <div className="health-circle-label" style={{
        color: type === 'under' ? '#974f0c' : type === 'normal' ? '#0747a6' : '#006644'
      }}>
        {label}
      </div>
    </div>
  );

  return (
    <div className="gadget">
      <div className="gadget-header">
        <div>
          <div className="gadget-title">Sprint Health</div>
          <div className="gadget-subtitle">{sprintName}</div>
        </div>
      </div>

      <div className="health-circles">
        <HealthCircle count={counts.under} label="Underestimated" type="under" />
        <HealthCircle count={counts.normal} label="Normal" type="normal" />
        <HealthCircle count={counts.good} label="Good" type="good" />
      </div>

      {/* Progress Bar */}
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
          <span style={{ color: '#6b778c' }}>Overall Progress</span>
          <span style={{ fontWeight: '600' }}>{total} Total Items</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-segment"
            style={{
              width: `${(counts.under / total) * 100}%`,
              background: '#ff991f'
            }}
          />
          <div
            className="progress-segment"
            style={{
              width: `${(counts.normal / total) * 100}%`,
              background: '#2684ff'
            }}
          />
          <div
            className="progress-segment"
            style={{
              width: `${(counts.good / total) * 100}%`,
              background: '#36b37e'
            }}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="legend" style={{ marginTop: '12px' }}>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#ff991f', borderRadius: '50%', width: '8px', height: '8px' }}></div>
          <span>Under</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#2684ff', borderRadius: '50%', width: '8px', height: '8px' }}></div>
          <span>Normal</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#36b37e', borderRadius: '50%', width: '8px', height: '8px' }}></div>
          <span>Good</span>
        </div>
      </div>
    </div>
  );
};

export default HealthGadget;
