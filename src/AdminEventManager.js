import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaLink,
  FaQrcode,
  FaDownload,
  FaPhotoVideo,
  FaCamera,
  FaEdit,
  FaTrash,
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';
import { downloadPhotosAsZip } from './utils/downloadPhotos';
import { PricingModal } from './components/PricingModal';
import { UserBadge } from './components/UserBadge';
import { TIERS, formatGuestCap, formatPhotoCap } from './services/pricingTiers';
import { initializePaystackTransaction } from './services/paystackService';
import { logError } from './services/errorLogger';
import { QRCodeCanvas } from 'qrcode.react';
import jsPDF from 'jspdf';
import styles from './AdminEventManager.module.css';

function AdminEventManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [eventName, setEventName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState('');
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pendingEvent, setPendingEvent] = useState(null);

  const fetchEvents = React.useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Explicit owner filter as defense-in-depth — RLS already scopes
      // this (see fix-events-rls-leak.sql), but this dashboard should
      // never rely on RLS as its only safeguard against showing another
      // user's events.
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      toast.error('Failed to load events');
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Paystack redirects back here with ?payment=success&event=<id> once the
  // hosted checkout page completes. The Paystack webhook (server-side,
  // verified signature) is the only thing that can actually mark an event
  // paid — a DB trigger rejects any client attempt to set is_paid directly.
  // So on return, we just poll briefly for the webhook to have landed
  // rather than writing the status ourselves.
  const pollForPaymentConfirmation = React.useCallback(async (eventId, attempt = 0) => {
    const { data } = await supabase
      .from('events')
      .select('is_paid')
      .eq('id', eventId)
      .single();

    if (data?.is_paid) {
      toast.success('Payment confirmed! Your event is live.');
      fetchEvents();
      return;
    }

    if (attempt < 6) {
      setTimeout(() => pollForPaymentConfirmation(eventId, attempt + 1), 2000);
    } else {
      toast.warning(
        "Still confirming your payment with Paystack. Refresh in a moment if your event doesn't update."
      );
      fetchEvents();
    }
  }, [fetchEvents]);

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const paidEventId = searchParams.get('event');

    if (paymentStatus === 'success' && paidEventId) {
      toast.info('Payment received. Confirming with Paystack...');
      pollForPaymentConfirmation(paidEventId);
      setSearchParams({});
    } else if (paymentStatus === 'cancelled') {
      toast.info('Payment cancelled');
      setSearchParams({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createEvent = async (e) => {
    e.preventDefault();

    if (!eventName.trim() || !startDate || !endDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      toast.error('End date cannot be before start date');
      return;
    }

    setPendingEvent({ eventName, description, startDate, endDate });
    setShowPricingModal(true);
  };

  const finalizEventCreation = async (tierKey) => {
    if (!pendingEvent) return;

    const tier = TIERS[tierKey];
    if (!tier) return;

    const { eventName: name, description: desc, startDate, endDate } = pendingEvent;
    const start = new Date(startDate);
    const end = new Date(endDate);

    const expiry = new Date(end);
    expiry.setDate(expiry.getDate() + 30);

    try {
      const { data, error } = await supabase
        .from('events')
        .insert({
          name: name.trim(),
          description: desc.trim(),
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          expiry_date: expiry.toISOString(),
          created_by: user.id,
          tier: tier.key,
          is_free: tier.key === 'free',
          // guest_cap, photo_cap_per_guest, is_paid, and payment_status are
          // deliberately NOT set here — the enforce_event_billing_integrity
          // DB trigger derives them from `tier` alone server-side. Only the
          // Paystack webhook (service role) can ever mark an event paid.
        })
        .select()
        .single();

      if (error) throw error;

      setEventName('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setPendingEvent(null);
      setShowPricingModal(false);

      if (tier.key === 'free') {
        toast.success('Free event created!');
        fetchEvents();
      } else {
        toast.info('Redirecting to secure payment...');
        await initiatePayment(data.id, name, tier);
      }
    } catch (error) {
      if (error.message?.includes('free_tier_limit_reached')) {
        toast.error("You've already used your one free event. Choose a paid plan for this one.");
      } else {
        toast.error('Failed to create event: ' + error.message);
      }
      console.error('Error:', error);
    }
  };

  const initiatePayment = async (eventId, name, tier) => {
    try {
      const { authorization_url: authorizationUrl } = await initializePaystackTransaction(
        eventId,
        name,
        user.id,
        user.email,
        tier.key
      );

      if (!authorizationUrl) {
        throw new Error('Paystack did not return a checkout URL');
      }

      // Full redirect to Paystack's hosted checkout page — no client SDK
      // involved, matches how the previous Stripe redirect flow worked.
      window.location.href = authorizationUrl;
    } catch (error) {
      // The event was created (pending payment) right before this was
      // called — if we never even made it to Paystack's checkout page,
      // don't leave that half-finished event sitting on the dashboard.
      // (A payment that reaches Paystack but is then cancelled/abandoned
      // there is a separate case — Paystack always redirects back to the
      // same callback_url regardless of outcome, so that one still has to
      // be cleaned up manually via the Delete button for now.)
      await supabase.from('events').delete().eq('id', eventId);
      fetchEvents();
      logError('initiatePayment', error, { eventId, severity: 'error' });
      toast.error('Payment failed: ' + error.message);
      console.error('Payment error:', error);
    }
  };

  const updateEvent = async (id) => {
    if (!newName.trim()) {
      toast.error('Event name cannot be empty');
      return;
    }

    try {
      const { error } = await supabase
        .from('events')
        .update({ name: newName.trim() })
        .eq('id', id);

      if (error) throw error;

      toast.success('Event updated');
      setEditingId(null);
      fetchEvents();
    } catch (error) {
      toast.error('Failed to update event');
      console.error('Error:', error);
    }
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Are you sure? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Event deleted');
      fetchEvents();
    } catch (error) {
      toast.error('Failed to delete event');
      console.error('Error:', error);
    }
  };

  const copyLink = async (id) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/camera?event=${id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied!');
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  const downloadQRCodePDF = (event) => {
    const canvas = document.getElementById(`qr-${event.id}`);
    if (!canvas) {
      toast.error('QR code not ready');
      return;
    }

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text('Scan to upload photos to event:', 10, 20);
    pdf.addImage(imgData, 'PNG', 35, 30, 140, 140);
    pdf.setFontSize(12);
    pdf.text(`Event: ${event.name}`, 10, 185);
    pdf.text(`ID: ${event.id}`, 10, 195);
    pdf.save(`${event.name}_QR.pdf`);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const isExpired = (expiryDate) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const downloadEventPhotos = async (eventId, eventName) => {
    try {
      toast.info('Fetching photos...');

      const { data: photos, error } = await supabase
        .from('photos')
        .select('id, storage_path')
        .eq('event_id', eventId);

      if (error) throw error;

      if (photos.length === 0) {
        toast.error('No photos to download');
        return;
      }

      const photosWithUrls = photos.map((p) => ({
        id: p.id,
        storagePath: p.storage_path,
        url: supabase.storage
          .from('event-photos')
          .getPublicUrl(p.storage_path).data.publicUrl,
      }));

      toast.info(`Creating ZIP with ${photos.length} photos...`);
      await downloadPhotosAsZip(eventName, photosWithUrls);
      toast.success('Download started!');
    } catch (error) {
      toast.error('Download failed: ' + error.message);
      console.error('Error:', error);
    }
  };

  if (loading) {
    return (
      <div className={styles.adminContainer}>
        <p>Loading...</p>
      </div>
    );
  }

  const hasFreeEvent = events.some((e) => e.tier === 'free');

  return (
    <div className={styles.adminContainer}>
      <PricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
        onSelectPlan={finalizEventCreation}
        freeTierUsed={hasFreeEvent}
      />

      <div className={styles.adminHeader}>
        <div>
          <Link to="/" className={styles.headerBrand}>Capture</Link>
          <h1>Your Events</h1>
        </div>
        <UserBadge />
      </div>

      <div className={styles.eventForm}>
        <h2>Create New Event</h2>
        <form onSubmit={createEvent}>
          <input
            type="text"
            placeholder="Event Name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            required
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="3"
          />
          <div className={styles.dateInputs}>
            <div>
              <label>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" className={styles.createBtn}>
            Create Event
          </button>
        </form>
      </div>

      <div className={styles.eventsSection}>
        <h2>Your Events ({events.length})</h2>
        {events.length === 0 ? (
          <p className={styles.noEvents}>No events yet. Create one to get started!</p>
        ) : (
          <div className={styles.eventsGrid}>
            {events.map((event) => {
              const expired = isExpired(event.expiry_date);
              const tier = TIERS[event.tier] || TIERS.free;
              return (
                <div
                  key={event.id}
                  className={`${styles.eventCard} ${expired ? styles.eventCardExpired : ''}`}
                >
                  <div className={styles.eventQr}>
                    <QRCodeCanvas
                      id={`qr-${event.id}`}
                      value={`${window.location.origin}/camera?event=${event.id}`}
                      size={112}
                    />
                  </div>

                  <div className={styles.eventDetails}>
                    {editingId === event.id ? (
                      <div className={styles.editMode}>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          autoFocus
                        />
                        <button
                          className={styles.saveBtn}
                          onClick={() => updateEvent(event.id)}
                        >
                          Save
                        </button>
                        <button
                          className={styles.cancelBtn}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3>{event.name}</h3>
                        {event.description && (
                          <p className={styles.eventDesc}>{event.description}</p>
                        )}
                        <div className={styles.eventMeta}>
                          <p>
                            <strong>Plan:</strong> {tier.name} ({formatGuestCap(event.guest_cap)}, {formatPhotoCap(event.photo_cap_per_guest)})
                            {event.tier !== 'free' && event.payment_status === 'pending_payment' && (
                              <span className={styles.paymentPendingBadge}> · payment pending</span>
                            )}
                          </p>
                          <p>
                            <strong>Dates:</strong> {formatDate(event.start_date)} – {formatDate(event.end_date)}
                          </p>
                          <p>
                            <strong>Expires:</strong> {formatDate(event.expiry_date)}
                          </p>
                        </div>
                        {expired && (
                          <div className={styles.expiredBadge}>Expired</div>
                        )}
                      </>
                    )}
                  </div>

                  <div className={styles.eventActions}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => copyLink(event.id)}
                      title="Copy guest link"
                    >
                      <FaLink /> Link
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => downloadQRCodePDF(event)}
                      title="Download QR code"
                    >
                      <FaQrcode /> QR
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => navigate(`/gallery?event=${event.id}`)}
                      title="View shared gallery"
                    >
                      <FaPhotoVideo /> Gallery
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => downloadEventPhotos(event.id, event.name)}
                      title="Download all photos as ZIP"
                    >
                      <FaDownload /> Download
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => navigate(`/camera?event=${event.id}`)}
                      title="Preview guest camera"
                    >
                      <FaCamera /> Preview
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => {
                        setEditingId(event.id);
                        setNewName(event.name);
                      }}
                      title="Edit event name"
                    >
                      <FaEdit /> Edit
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={() => deleteEvent(event.id)}
                      title="Delete event"
                    >
                      <FaTrash /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminEventManager;
