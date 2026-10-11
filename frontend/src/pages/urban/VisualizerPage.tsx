import { useState } from 'react';
import Experience from '../../components/Experience';
import Overlay from '../../components/Overlay';
import { RWHComponent } from '../../data/rwhData';

export function VisualizerPage() {
  const [selectedComponent, setSelectedComponent] = useState<RWHComponent | null>(null);

  const handleSelect = (component: RWHComponent | null) => {
    setSelectedComponent(component);
  };

  const handleClose = () => {
    setSelectedComponent(null);
  };

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 90px)' }}>
      <Experience onSelect={handleSelect} />
      <Overlay selectedComponent={selectedComponent} onClose={handleClose} />
    </div>
  );
}
