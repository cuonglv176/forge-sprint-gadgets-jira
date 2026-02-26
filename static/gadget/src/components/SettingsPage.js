import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

const SettingsPage = () => {
  const [boards, setBoards] = useState([]);
  const [config, setConfig] = useState({
    boardId: '',
    teamSize: 10,
    workingDays: 10
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

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
        setError(boardsResult.error || 'Failed to load boards');
      }

      // Load existing config
      const existingConfig = await invoke('getConfig');
      if (existingConfig?.boardId) {
        setConfig(existingConfig);
      }
    } catch (err) {
      setError(err.message || 'Error loading data');
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
    setSuccess(false);

    try {
      const result = await invoke('saveConfig', config);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError(err.message || 'Error saving configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({
      boardId: '',
      teamSize: 10,
      workingDays: 10
    });
    setError(null);
    setSuccess(false);
  };

  const maxCapacity = config.workingDays * 8 * config.teamSize;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#fff'
      }}>
        <div className="spinner" style={{ margin: '0 auto' }}></div>
        <p style={{ marginTop: '12px', color: '#6b778c', fontSize: '13px' }}>
          Loading settings...
        </p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f4f5f7',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        backgroundColor: '#fff',
        borderRadius: '3px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #dfe1e6',
          backgroundColor: '#fafbfc'
        }}>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: '24px',
            fontWeight: '700',
            color: '#172b4d'
          }}>
            ⚙️ Sprint Gadgets Settings
          </h1>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#6b778c'
          }}>
            Configure your sprint tracking gadgets
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Success Message */}
          {success && (
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#e3fcef',
              border: '1px solid #abf5d1',
              borderRadius: '3px',
              color: '#006644',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>✅</span>
              <span>Settings saved successfully!</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#ffebe6',
              border: '1px solid #ffcccc',
              borderRadius: '3px',
              color: '#de350b',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Board Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#6b778c'
            }}>
              Scrum Board *
            </label>
            <select
              value={config.boardId}
              onChange={(e) =>
                setConfig(prev => ({ ...prev, boardId: e.target.value }))
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '2px solid #dfe1e6',
                borderRadius: '3px',
                fontSize: '14px',
                fontFamily: 'inherit',
                cursor: 'pointer'
              }}
            >
              <option value="">Select a board...</option>
              {boards.map(board => (
                <option key={board.id} value={board.id}>
                  {board.name} {board.projectKey && `(${board.projectKey})`}
                </option>
              ))}
            </select>
            <p style={{
              marginTop: '4px',
              fontSize: '11px',
              color: '#6b778c'
            }}>
              Select the Scrum board to track sprint data from. This setting applies to all gadgets.
            </p>
          </div>

          {/* Team Size */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#6b778c'
            }}>
              Team Size
            </label>
            <input
              type="number"
              value={config.teamSize}
              onChange={(e) =>
                setConfig(prev => ({
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
            <p style={{
              marginTop: '4px',
              fontSize: '11px',
              color: '#6b778c'
            }}>
              Number of team members. Used for Max Capacity calculation in Burndown chart.
            </p>
          </div>

          {/* Working Days */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#6b778c'
            }}>
              Working Days per Sprint
            </label>
            <input
              type="number"
              value={config.workingDays}
              onChange={(e) =>
                setConfig(prev => ({
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
            <p style={{
              marginTop: '4px',
              fontSize: '11px',
              color: '#6b778c'
            }}>
              Default working days. Used if sprint dates are not properly set.
            </p>
          </div>

          {/* Formula Preview */}
          <div style={{
            backgroundColor: '#f4f5f7',
            padding: '12px',
            borderRadius: '3px',
            marginBottom: '20px'
          }}>
            <p style={{
              margin: 0,
              fontWeight: '600',
              color: '#0052cc',
              fontSize: '12px'
            }}>
              Max Capacity Formula:
            </p>
            <p style={{
              margin: '8px 0 0',
              color: '#172b4d',
              fontSize: '13px'
            }}>
              Working Days × 8 hours × Team Size<br />
              = {config.workingDays} × 8 × {config.teamSize} = <strong>{maxCapacity}h</strong>
            </p>
          </div>

          {/* Info Box */}
          <div style={{
            backgroundColor: '#deebff',
            padding: '12px',
            borderRadius: '3px',
            marginBottom: '20px',
            fontSize: '12px',
            color: '#0747a6',
            borderLeft: '3px solid #0052cc'
          }}>
            <strong>ℹ️ Info:</strong>
            <p style={{ margin: '8px 0 0' }}>
              These settings apply to all 6 Sprint Gadgets:
              <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0 }}>
                <li>Sprint Burndown Chart</li>
                <li>Sprint Health</li>
                <li>At Risk Items</li>
                <li>Scope Changes</li>
                <li>High Priority Items</li>
                <li>Sprint Releases</li>
              </ul>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #dfe1e6',
          backgroundColor: '#fafbfc',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px'
        }}>
          <button
            onClick={handleReset}
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
              transition: 'all 0.2s',
              opacity: saving || loading ? 0.5 : 1
            }}
          >
            Reset
          </button>
          <button
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
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div style={{
        textAlign: 'center',
        marginTop: '20px',
        fontSize: '12px',
        color: '#6b778c'
      }}>
        <p>
          Settings are saved to Forge Storage and applied to all gadgets across your Jira instance.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
