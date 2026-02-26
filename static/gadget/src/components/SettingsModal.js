import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

const SettingsModal = ({ isOpen, onClose, onSave, currentConfig }) => {
  const [boards, setBoards] = useState([]);
  const [config, setConfig] = useState({
    boardId: '',
    teamSize: 10,
    workingDays: 10
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
  }, [currentConfig]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load available boards
      const boardsResult = await invoke('getBoards');
      if (boardsResult.success) {
        setBoards(boardsResult.boards);
      } else {
        setError(boardsResult.error || 'Failed to load boards');
      }
    } catch (err) {
      setError(err.message || 'Error loading boards');
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
      // Save config via resolver
      const result = await invoke('saveConfig', config);
      if (result.success) {
        onSave(config);
        onClose();
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError(err.message || 'Error saving configuration');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const maxCapacity = config.workingDays * 8 * config.teamSize;

  return (
    <>
      {/* Overlay */}
      <div
        className="settings-modal-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}
      >
        {/* Modal */}
        <div
          className="settings-modal"
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'white',
            borderRadius: '3px',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            zIndex: 1001
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px',
              borderBottom: '1px solid #dfe1e6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#172b4d' }}>
              ⚙️ Gadget Settings
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#6b778c',
                padding: '0',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '20px' }}>
            {error && (
              <div
                className="error"
                style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#ffebe6',
                  border: '1px solid #ffcccc',
                  borderRadius: '3px',
                  color: '#de350b',
                  fontSize: '13px'
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <div className="spinner" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '12px', color: '#6b778c', fontSize: '13px' }}>
                  Loading boards...
                </p>
              </div>
            ) : (
              <>
                {/* Board Selection */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label
                    className="form-label"
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b778c'
                    }}
                  >
                    Scrum Board *
                  </label>
                  <select
                    className="form-select"
                    value={config.boardId}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, boardId: e.target.value }))
                    }
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '2px solid #dfe1e6',
                      borderRadius: '3px',
                      fontSize: '14px',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="">Select a board...</option>
                    {boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.name} {board.projectKey && `(${board.projectKey})`}
                      </option>
                    ))}
                  </select>
                  <p
                    style={{
                      marginTop: '4px',
                      fontSize: '11px',
                      color: '#6b778c'
                    }}
                  >
                    Select the Scrum board to track sprint data from.
                  </p>
                </div>

                {/* Team Size */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label
                    className="form-label"
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b778c'
                    }}
                  >
                    Team Size
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={config.teamSize}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        teamSize: Math.max(1, parseInt(e.target.value) || 1)
                      }))
                    }
                    min="1"
                    max="50"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '2px solid #dfe1e6',
                      borderRadius: '3px',
                      fontSize: '14px',
                      fontFamily: 'inherit'
                    }}
                  />
                  <p
                    style={{
                      marginTop: '4px',
                      fontSize: '11px',
                      color: '#6b778c'
                    }}
                  >
                    Number of team members. Used for Max Capacity calculation.
                  </p>
                </div>

                {/* Working Days */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label
                    className="form-label"
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b778c'
                    }}
                  >
                    Working Days per Sprint
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={config.workingDays}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        workingDays: Math.max(1, parseInt(e.target.value) || 10)
                      }))
                    }
                    min="1"
                    max="30"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '2px solid #dfe1e6',
                      borderRadius: '3px',
                      fontSize: '14px',
                      fontFamily: 'inherit'
                    }}
                  />
                  <p
                    style={{
                      marginTop: '4px',
                      fontSize: '11px',
                      color: '#6b778c'
                    }}
                  >
                    Default working days. Used if sprint dates are not properly set.
                  </p>
                </div>

                {/* Formula Preview */}
                <div
                  className="formula-preview"
                  style={{
                    backgroundColor: '#f4f5f7',
                    padding: '12px',
                    borderRadius: '3px',
                    fontSize: '12px',
                    marginBottom: '16px'
                  }}
                >
                  <p style={{ margin: 0, fontWeight: '600', color: '#0052cc' }}>
                    Max Capacity Formula:
                  </p>
                  <p style={{ margin: '8px 0 0', color: '#172b4d', fontSize: '13px' }}>
                    Working Days × 8 hours × Team Size<br />
                    = {config.workingDays} × 8 × {config.teamSize} ={' '}
                    <strong>{maxCapacity}h</strong>
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid #dfe1e6',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px'
            }}
          >
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving || loading}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                backgroundColor: '#f4f5f7',
                color: '#172b4d',
                transition: 'all 0.2s'
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!config.boardId || saving || loading}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                backgroundColor: '#0052cc',
                color: '#fff',
                transition: 'all 0.2s',
                opacity: !config.boardId || saving || loading ? 0.5 : 1
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsModal;
