import React, { useEffect, useState } from 'react';
import { invoke, view } from '@forge/bridge';

const ConfigForm = () => {
  const [boards, setBoards] = useState([]);
  const [config, setConfig] = useState({
    boardId: '',
    teamSize: 10,
    workingDays: 10
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load available boards
      const boardsResult = await invoke('getBoards');
      if (boardsResult.success) {
        setBoards(boardsResult.boards);
      } else {
        setError(boardsResult.error);
      }

      // Load existing config
      const existingConfig = await invoke('getConfig');
      if (existingConfig?.boardId) {
        setConfig(prev => ({ ...prev, ...existingConfig }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.boardId) {
      setError('Please select a board');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Save config to Forge storage
      const result = await invoke('saveConfig', config);
      if (result.success) {
        // Use view.submit() to close edit mode and notify Jira
        // This is REQUIRED for Forge dashboard gadget edit mode
        view.submit(config);
      } else {
        setError(result.error || 'Failed to save configuration');
        setSaving(false);
      }
    } catch (err) {
      console.error('[ConfigForm] Error saving:', err);
      // Fallback: try to close anyway
      try {
        view.submit(config);
      } catch (submitErr) {
        try {
          view.close();
        } catch (closeErr) {
          console.error('[ConfigForm] Cannot close view:', closeErr);
        }
      }
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Close edit mode without saving
    try {
      view.close();
    } catch (err) {
      console.error('[ConfigForm] Error closing:', err);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ marginTop: '12px' }}>Loading configuration...</p>
      </div>
    );
  }

  const maxCapacity = config.workingDays * 8 * config.teamSize;

  return (
    <div className="config-form">
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600', color: '#172b4d' }}>
        Configure Gadget
      </h2>

      {error && (
        <div className="error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Scrum Board *</label>
        <select
          className="form-select"
          value={config.boardId}
          onChange={(e) => setConfig(prev => ({ ...prev, boardId: e.target.value }))}
        >
          <option value="">Select a board...</option>
          {boards.map(board => (
            <option key={board.id} value={board.id}>
              {board.name} {board.projectKey && `(${board.projectKey})`}
            </option>
          ))}
        </select>
        <p className="form-help">
          Select the Scrum board to track sprint data from.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Team Size</label>
        <input
          type="number"
          className="form-input"
          value={config.teamSize}
          onChange={(e) => setConfig(prev => ({ ...prev, teamSize: Math.max(1, parseInt(e.target.value) || 1) }))}
          min="1"
          max="50"
        />
        <p className="form-help">
          Number of team members.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Working Days per Sprint</label>
        <input
          type="number"
          className="form-input"
          value={config.workingDays}
          onChange={(e) => setConfig(prev => ({ ...prev, workingDays: Math.max(1, parseInt(e.target.value) || 10) }))}
          min="1"
          max="30"
        />
        <p className="form-help">
          Default working days. Used if sprint dates are not properly set.
        </p>
      </div>

      <div className="formula-preview">
        <p style={{ margin: 0 }}>
          <strong>Max Capacity Formula:</strong>
        </p>
        <p style={{ margin: '8px 0 0' }}>
          Working Days x 8 hours x Team Size<br />
          = {config.workingDays} x 8 x {config.teamSize} = <strong>{maxCapacity}h</strong>
        </p>
      </div>

      <div className="form-actions">
        <button
          className="btn btn-secondary"
          onClick={handleCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!config.boardId || saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default ConfigForm;
