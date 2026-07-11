import React, { useState } from 'react';
import './GuestNamePrompt.css';

const MAX_NAME_LENGTH = 40;

export function GuestNamePrompt({ open, defaultValue, onSubmit, onSkip }) {
  const [name, setName] = useState(defaultValue || '');

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="guest-name-backdrop">
      <form className="guest-name-card" onSubmit={handleSubmit}>
        <h2>What's your name?</h2>
        <p>Your photos will be grouped into your own album in the gallery.</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jaco"
          maxLength={MAX_NAME_LENGTH}
          autoFocus
        />
        <button type="submit" className="guest-name-submit" disabled={!name.trim()}>
          Continue
        </button>
        <button type="button" className="guest-name-skip" onClick={onSkip}>
          Skip for now
        </button>
      </form>
    </div>
  );
}
