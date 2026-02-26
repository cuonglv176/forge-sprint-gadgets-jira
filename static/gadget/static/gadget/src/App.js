import React, { useEffect, useState } from 'react';
import { invoke, view } from '@forge/bridge';

// Import gadget components
import BurndownGadget from './components/BurndownGadget';
import HealthGadget from './components/HealthGadget';
import RiskGadget from './components/RiskGadget';
import ChangesGadget from './components/ChangesGadget';
import PriorityGadget from './components/PriorityGadget';
import ConfigForm from './components/ConfigForm';

function App() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get view context to determine which gadget/resource is being rendered
    view.getContext().then((ctx) => {
      setContext(ctx);
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

  // Get the resource key from context
  const resource = context?.extension?.gadget?.moduleKey || 
                   context?.localId ||
                   context?.extension?.type;

  // Check if this is a config view
  const isConfig = context?.extension?.entryPoint === 'edit' ||
                   window.location.search.includes('config');

  // If config view, show config form
  if (isConfig) {
    return <ConfigForm />;
  }

  // Render appropriate gadget based on module key
  switch (resource) {
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
    
    default:
      // If can't determine type, show burndown as default
      return <BurndownGadget />;
  }
}

export default App;
