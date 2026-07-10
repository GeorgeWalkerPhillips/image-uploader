import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaSignOutAlt,
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
import { TIERS, formatGuestCap, formatPhotoCap } from './services/pricingTiers';
import {
  createCheckoutSession,
  getStripe,
  updateEventPaymentStatus,
} from './services/stripeService';
import { QRCodeCanvas } from 'qrcode.react';
import jsPDF from 'jspdf';
import styles from './AdminEventManager.module.css';

function AdminEventManager() {
  const { user, signOut } = useAuth();
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
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      toast.error('Failed to load events');
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Stripe redirects back here with ?payment=success|cancelled&event=<id>.
  // A real webhook (see PAYMENT_SETUP.md) is the secure way to confirm a
  // charge server-side; this client-side confirmation is a pragmatic
  // stopgap until that's deployed.
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const paidEventId = searchParams.get('event');

    if (paymentStatus === 'success' && paidEventId) {
      (async () => {
        try {
          await updateEventPaymentStatus(paidEventId, true);
          toast.success('Payment confirmed! Your event is live.');
          fetchEvents();
        } catch (err) {
          toast.error('Could not confirm payment status');
          console.error('Payment confirmation error:', err);
        } finally {
          setSearchParams({});
        }
      })();
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
          guest_cap: tier.guestCap,
          photo_cap_per_guest: tier.photosPerGuest,
          is_free: tier.key === 'free',
          is_paid: tier.key !== 'free',
          payment_status: tier.key === 'free' ? 'free' : 'pending_payment',
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
      toast.error('Failed to create event: ' + error.message);
      console.error('Error:', error);
    }
  };

  const initiatePayment = async (eventId, name, tier) => {
    try {
      const session = await createCheckoutSession(
        eventId,
        name,
        user.id,
        tier.amountCents,
        tier.key
      );
      const stripe = await getStripe();
      const { error } = await stripe.redirectToCheckout({
        sessionId: session.sessionId,
      });
      if (error) throw error;
    } catch (error) {
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

  const handleSignOut = () => {
    // Don't wait on the network round-trip — local session state clears
    // synchronously inside signOut(), so navigation can happen immediately.
    signOut();
    navigate('/');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
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

  return (
    <div className={styles.adminContainer}>
      <PricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
        onSelectPlan={finalizEventCreation}
      />

      <div className={styles.adminHeader}>
        <div>
          <Link to="/" className={styles.headerBrand}>Capture</Link>
          <h1>Your Events</h1>
        </div>
        <button className={styles.signOutBtn} onClick={handleSignOut} title="Sign Out">
          <FaSignOutAlt /> Sign Out
        </button>
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
                      onClick={() =>
                        window.open(`/gallery?event=${event.id}`, '_blank')
                      }
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
                      onClick={() =>
                        window.open(`/camera?event=${event.id}`, '_blank')
                      }
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
