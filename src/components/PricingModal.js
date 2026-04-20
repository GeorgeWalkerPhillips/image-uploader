import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { FaCheck, FaTimes } from 'react-icons/fa';
import { PRICING } from '../services/stripeService';
import './PricingModal.css';

export function PricingModal({ isOpen, onClose, onSelectPlan, freeEventsUsed }) {
  const [loading, setLoading] = useState(false);

  const handleFreePlan = () => {
    if (freeEventsUsed >= PRICING.FREE_EVENTS_PER_USER) {
      toast.error('You have used your free event');
      return;
    }
    onSelectPlan('free');
  };

  const handlePaidPlan = async () => {
    setLoading(true);
    try {
      onSelectPlan('paid');
    } catch (error) {
      toast.error('Payment failed: ' + error.message);
    } finally {
      setLoading(false);
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
        <p className="subtitle">Choose a plan to get started</p>

        <div className="pricing-grid">
          {/* Free Plan */}
          <div className="pricing-card free">
            <h2>Free</h2>
            <div className="price">
              R0<span className="period">/once</span>
            </div>
            <p className="plan-desc">Perfect for trying it out</p>

            <ul className="features">
              <li>
                <FaCheck className="check" />
                1 event included
              </li>
              <li>
                <FaCheck className="check" />
                Unlimited uploads
              </li>
              <li>
                <FaCheck className="check" />
                30-day event
              </li>
              <li>
                <FaTimes className="times" />
                Download ZIP
              </li>
              <li>
                <FaTimes className="times" />
                Custom branding
              </li>
            </ul>

            <button
              className="plan-btn free-btn"
              onClick={handleFreePlan}
              disabled={freeEventsUsed >= PRICING.FREE_EVENTS_PER_USER}
            >
              {freeEventsUsed >= PRICING.FREE_EVENTS_PER_USER
                ? 'Free event used'
                : 'Use Free Event'}
            </button>
            {freeEventsUsed > 0 && (
              <p className="usage-note">
                {PRICING.FREE_EVENTS_PER_USER - freeEventsUsed} free event remaining
              </p>
            )}
          </div>

          {/* Paid Plan */}
          <div className="pricing-card paid featured">
            <div className="badge">POPULAR</div>
            <h2>Pro Event</h2>
            <div className="price">
              {PRICING.ZAR.display}<span className="period">/event</span>
            </div>
            <p className="plan-desc">Professional photo sharing</p>

            <ul className="features">
              <li>
                <FaCheck className="check" />
                Unlimited events
              </li>
              <li>
                <FaCheck className="check" />
                Unlimited uploads
              </li>
              <li>
                <FaCheck className="check" />
                30-day event
              </li>
              <li>
                <FaCheck className="check" />
                Download ZIP
              </li>
              <li>
                <FaCheck className="check" />
                QR codes & links
              </li>
            </ul>

            <button
              className="plan-btn paid-btn"
              onClick={handlePaidPlan}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Pay Now'}
            </button>
            <p className="secure-note">🔒 Secure payment with Stripe</p>
          </div>
        </div>

        <div className="pricing-footer">
          <p>Events expire 30 days after the event date</p>
          <p>All payments are processed securely</p>
        </div>
      </div>
    </div>
  );
}
