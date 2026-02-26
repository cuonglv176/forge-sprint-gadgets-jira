import React, { useEffect, useState } from 'react';
import { view } from '@forge/bridge';

// Import gadget components
import BurndownGadget from './components/BurndownGadget';
import HealthGadget from './components/HealthGadget';
import RiskGadget from './components/RiskGadget';
import ChangesGadget from './components/ChangesGadget';
import PriorityGadget from './components/PriorityGadget';
import ReleasesGadget from './components/ReleasesGadget';
import ConfigForm from './components/ConfigForm';

function App() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    view.getContext().then((ctx) => {
      console.log('[App] Context received:', JSON.stringify(ctx, null, 2));
      setContext(ctx);
      setLoading(false);
    }).catch((err) => {
      console.error('[App] Error getting context:', err);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ marginTop: '12px' }}>Loading...</p>
      </div>
    );
  }

  // LOGIC FIX: Kiểm tra kỹ hơn các trường hợp của Edit Mode
  // 1. entryPoint === 'edit' (Chuẩn mới)
  // 2. context.extension.context.mode === 'edit' (Một số trường hợp cũ hoặc đặc thù)
  const isEditMode =
    context?.extension?.entryPoint === 'edit' ||
    context?.extension?.mode === 'edit' ||
    context?.context?.mode === 'edit';

  console.log('[App] isEditMode:', isEditMode);
  console.log('[App] extension:', JSON.stringify(context?.extension));

  // Nếu đang ở chế độ edit, hiển thị form cấu hình
  if (isEditMode) {
    return <ConfigForm />;
  }

  // Lấy module key để biết cần render gadget nào
  const moduleKey = context?.extension?.gadget?.moduleKey || context?.moduleKey || '';

  console.log('[App] moduleKey:', moduleKey);

  // Render gadget tương ứng dựa trên module key
  switch (moduleKey) {
    case 'sprint-burndown-gadget':
      return <BurndownGadget />;

    case 'sprint-health-gadget':
      return <HealthGadget />;

    case 'at-risk-gadget':
      return <RiskGadget />;

    case 'scope-changes-gadget':
      return <ChangesGadget />;

    case 'high-priority-gadget':
      return <PriorityGadget />;

    case 'releases-gadget':
      return <ReleasesGadget />;

    default:
      // Fallback nếu không khớp key nào, hoặc đang dev
      // Hiển thị thông báo thân thiện hơn
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h3>Gadget Loaded</h3>
          <p>Module Key: {moduleKey}</p>
          <p>Waiting for configuration...</p>
          {/* Nút debug để ép mở form config nếu cần thiết trong quá trình dev */}
          <button
            onClick={() => setContext({...context, extension: {...context.extension, entryPoint: 'edit'}})}
            style={{ marginTop: '10px', padding: '5px 10px', cursor: 'pointer' }}
          >
            Force Config Mode (Debug)
          </button>
        </div>
      );
  }
}

export default App;