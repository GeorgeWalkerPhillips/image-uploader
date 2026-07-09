import React from 'react';

const DURATIONS = [3, 5, 10];

// Picker shown inside the settings sheet — selecting a duration arms the
// timer; the actual countdown is owned by CameraCapture so it can drive
// the capture flow.
export function TimerControls({ armedSeconds, onArm }) {
  return (
    <div className="settings-row">
      <label>Self-Timer</label>
      <div className="filter-buttons timer-picker">
        <button
          className={`filter-btn ${armedSeconds === null ? 'active' : ''}`}
          onClick={() => onArm(null)}
        >
          Off
        </button>
        {DURATIONS.map((seconds) => (
          <button
            key={seconds}
            className={`filter-btn ${armedSeconds === seconds ? 'active' : ''}`}
            onClick={() => onArm(seconds)}
          >
            {seconds}s
          </button>
        ))}
      </div>
    </div>
  );
}

// Full-screen countdown, shown while a timed capture is in progress.
export function TimerCountdownOverlay({ countdown, onCancel }) {
  if (countdown === null) return null;

  return (
    <div className="timer-display">
      <div className="timer-number">{countdown}</div>
      <button className="timer-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
