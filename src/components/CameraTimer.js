import React, { useState, useEffect } from 'react';
import './CameraTimer.css';

export function TimerButton({ onCapture }) {
  const [timerMode, setTimerMode] = useState(null);
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    if (countdown === null || countdown === undefined) return;

    if (countdown === 0) {
      onCapture();
      setCountdown(null);
      setTimerMode(null);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, onCapture]);

  const startTimer = (seconds) => {
    setTimerMode(seconds);
    setCountdown(seconds);
  };

  const cancelTimer = () => {
    setTimerMode(null);
    setCountdown(null);
  };

  if (countdown !== null && countdown > 0) {
    return (
      <div className="timer-display">
        <div className="timer-number">{countdown}</div>
        <button className="timer-cancel" onClick={cancelTimer}>
          Cancel
        </button>
      </div>
    );
  }

  if (timerMode) {
    return (
      <div className="timer-menu">
        <p>Timer set to {timerMode}s</p>
        <div className="timer-buttons">
          <button onClick={() => startTimer(timerMode)}>Ready? Start</button>
          <button onClick={cancelTimer} className="cancel-btn">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="timer-options">
      <button
        className="timer-btn"
        onClick={() => startTimer(3)}
        title="3 second timer"
      >
        ⏱️ 3s
      </button>
      <button
        className="timer-btn"
        onClick={() => startTimer(5)}
        title="5 second timer"
      >
        ⏱️ 5s
      </button>
      <button
        className="timer-btn"
        onClick={() => startTimer(10)}
        title="10 second timer"
      >
        ⏱️ 10s
      </button>
    </div>
  );
}
