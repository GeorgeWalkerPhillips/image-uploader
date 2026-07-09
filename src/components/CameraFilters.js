import React from 'react';
import { FaPlus, FaMinus } from 'react-icons/fa';

const FILTERS = [
  { id: 'normal', label: 'Normal' },
  { id: 'bw', label: 'B&W' },
  { id: 'sepia', label: 'Sepia' },
];

export const FILTER_ORDER = FILTERS.map((f) => f.id);

// Plain settings content — no self-toggle. The parent (CameraSettingsSheet)
// decides when this is visible.
export function FilterControls({
  brightness,
  contrast,
  filter,
  showGrid,
  onBrightnessChange,
  onContrastChange,
  onFilterChange,
  onGridToggle,
}) {
  return (
    <>
      <div className="settings-row">
        <label>Filter</label>
        <div className="filter-buttons">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-btn ${filter === f.id ? 'active' : ''}`}
              onClick={() => onFilterChange(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <label>Brightness</label>
        <div className="slider-group">
          <button
            className="control-btn"
            onClick={() => onBrightnessChange(Math.max(50, brightness - 10))}
          >
            <FaMinus />
          </button>
          <input
            type="range"
            min="50"
            max="150"
            value={brightness}
            onChange={(e) => onBrightnessChange(Number(e.target.value))}
            className="slider"
          />
          <button
            className="control-btn"
            onClick={() => onBrightnessChange(Math.min(150, brightness + 10))}
          >
            <FaPlus />
          </button>
        </div>
      </div>

      <div className="settings-row">
        <label>Contrast</label>
        <div className="slider-group">
          <button
            className="control-btn"
            onClick={() => onContrastChange(Math.max(50, contrast - 10))}
          >
            <FaMinus />
          </button>
          <input
            type="range"
            min="50"
            max="150"
            value={contrast}
            onChange={(e) => onContrastChange(Number(e.target.value))}
            className="slider"
          />
          <button
            className="control-btn"
            onClick={() => onContrastChange(Math.min(150, contrast + 10))}
          >
            <FaPlus />
          </button>
        </div>
      </div>

      <div className="settings-row">
        <button
          className={`grid-toggle-btn ${showGrid ? 'active' : ''}`}
          onClick={onGridToggle}
        >
          {showGrid ? '✓ Grid ON' : 'Grid OFF'}
        </button>
      </div>
    </>
  );
}

export function applyVideoFilters(video, brightness, contrast, filter) {
  let filterStyle = `brightness(${brightness}%) contrast(${contrast}%)`;

  switch (filter) {
    case 'bw':
      filterStyle += ' grayscale(100%)';
      break;
    case 'sepia':
      filterStyle += ' sepia(100%)';
      break;
    default:
      break;
  }

  if (video) {
    video.style.filter = filterStyle;
  }
}

export function applyCanvasFilters(canvas, ctx, imageData, brightness, contrast, filter) {
  // Apply brightness and contrast
  const data = imageData.data;
  const bMult = brightness / 100;
  const cMult = (contrast - 50) / 50;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * bMult + cMult * 50);
    data[i + 1] = Math.min(255, data[i + 1] * bMult + cMult * 50);
    data[i + 2] = Math.min(255, data[i + 2] * bMult + cMult * 50);
  }

  // Apply filter
  if (filter === 'bw') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  } else if (filter === 'sepia') {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
