import React from 'react';
import { FilterControls } from './CameraFilters';
import { TimerControls } from './CameraTimer';
import './CameraSettingsSheet.css';

export function CameraSettingsSheet({
  open,
  onClose,
  brightness,
  contrast,
  filter,
  showGrid,
  onBrightnessChange,
  onContrastChange,
  onFilterChange,
  onGridToggle,
  armedSeconds,
  onArmTimer,
}) {
  if (!open) return null;

  return (
    <div className="settings-sheet-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="settings-sheet-handle" />
        <div className="settings-sheet-header">
          <h3>Camera Settings</h3>
          <button className="settings-sheet-done" onClick={onClose}>
            Done
          </button>
        </div>

        <TimerControls armedSeconds={armedSeconds} onArm={onArmTimer} />
        <FilterControls
          brightness={brightness}
          contrast={contrast}
          filter={filter}
          showGrid={showGrid}
          onBrightnessChange={onBrightnessChange}
          onContrastChange={onContrastChange}
          onFilterChange={onFilterChange}
          onGridToggle={onGridToggle}
        />
      </div>
    </div>
  );
}
