import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import SettingsModal from './SettingsModal';

/**
 * GadgetWrapper component
 * Wraps any gadget component with:
 * - Settings button in the header (always visible)
 * - Settings modal for board/config selection
 * - When no config → shows inline "Configure" prompt
 * - When config exists → shows child gadget content
 * - After save → forces full reload of child gadget
 */
const GadgetWrapper = ({
  children,
  gadgetTitle,
  gadgetSubtitle,
  onConfigChange
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  // Key to force re-mount children after config save
  const [reloadKey, setReloadKey] = useState(0);

  const loadConfig = useCallback(async () => {
    try {
      const savedConfig = await invoke('getConfig');
      if (savedConfig) {
        setConfig(savedConfig);
      }
    } catch (err) {
      console.error('[GadgetWrapper] Error loading config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleConfigSave = useCallback((newConfig) => {
    setConfig(newConfig);
    // Increment key to force full re-mount of children
    setReloadKey(prev => prev + 1);
    if (onConfigChange) {
      onConfigChange(newConfig);
    }
  }, [onConfigChange]);

  // Loading
  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ marginTop: '12px' }}>Loading...</p>
      </div>
    );
  }

  // Not configured → show inline configure prompt
  if (!config?.boardId) {
    return (
      <div className="gadget" style={{ padding: '16px' }}>
        {/* Header with Configure button */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid #dfe1e6'
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#172b4d' }}>
              {gadgetTitle}
            </div>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              background: '#0052cc',
              border: 'none',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: '3px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⚙️ Configure
          </button>
        </div>

        {/* Configure prompt */}
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          backgroundColor: '#f4f5f7',
          borderRadius: '3px'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚙️</div>
          <p style={{ fontSize: '15px', fontWeight: '600', color: '#172b4d', margin: '0 0 8px' }}>
            Configuration Required
          </p>
          <p style={{ fontSize: '13px', color: '#6b778c', margin: '0 0 16px' }}>
            Select a Scrum board to start tracking sprint data.
          </p>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              background: '#0052cc',
              border: 'none',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              padding: '10px 24px',
              borderRadius: '3px',
              color: '#fff'
            }}
          >
            Select Board
          </button>
        </div>

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleConfigSave}
          currentConfig={config}
        />
      </div>
    );
  }

  // Configured → render child gadget with settings button
  return (
    <div key={reloadKey}>
      {/* Gadget Content (children already have their own headers) */}
      {children}

      {/* Settings Modal (accessible from child gadget's own Settings button if needed) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleConfigSave}
        currentConfig={config}
      />
    </div>
  );
};

export default GadgetWrapper;
