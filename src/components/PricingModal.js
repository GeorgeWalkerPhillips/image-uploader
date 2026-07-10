import React, { useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { TIERS, TIER_ORDER, formatGuestCap, formatPhotoCap } from '../services/pricingTiers';
import './PricingModal.css';

const FEATURES = [
  'Guests upload with no app or signup',
  'Built-in camera with filters and timer',
  '30-day shared gallery',
  'Download every photo as one ZIP',
  'QR code and shareable link included',
];

const POPULAR_TIER = 'growth';

export function PricingModal({ isOpen, onClose, onSelectPlan }) {
  const [loadingTier, setLoadingTier] = useState(null);

  const handleSelect = async (tierKey) => {
    setLoadingTier(tierKey);
    try {
      await onSelectPlan(tierKey);
    } catch (error) {
      // onSelectPlan is expected to surface its own error toast
    } finally {
      setLoadingTier(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="pricing-modal-overlay">
      <div className="pricing-modal">
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>

        <h1>Create Your Event</h1>
        <p className="subtitle">Priced by guest count — pay once, no subscription</p>

        <div className="pricing-grid">
          {TIER_ORDER.map((tierKey) => {
            const tier = TIERS[tierKey];
            const isFree = tierKey === 'free';
            const isPopular = tierKey === POPULAR_TIER;

            return (
              <div
                key={tierKey}
                className={`pricing-card${isPopular ? ' featured' : ''}`}
              >
                {isPopular && <div className="badge">MOST POPULAR</div>}

                <h2>{tier.name}</h2>
                <div className="price">
                  {tier.display}
                  {!isFree && <span className="period">/event</span>}
                </div>
                <p className="plan-desc">
                  {formatGuestCap(tier.guestCap)} · {formatPhotoCap(tier.photosPerGuest)}
                </p>

                <ul className="features">
                  {FEATURES.map((feature) => (
                    <li key={feature}>
                      <FaCheck className="check" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  className={`plan-btn ${isFree ? 'free-btn' : 'paid-btn'}`}
                  onClick={() => handleSelect(tierKey)}
                  disabled={loadingTier !== null}
                >
                  {loadingTier === tierKey
                    ? 'Processing...'
                    : isFree
                    ? 'Use Free Plan'
                    : `Choose ${tier.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="pricing-footer">
          <p>Events stay live for 30 days after your event date</p>
          <p>Paid plans are processed securely with Stripe</p>
        </div>
      </div>
    </div>
  );
}
