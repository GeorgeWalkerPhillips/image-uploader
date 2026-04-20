import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaSignOutAlt, FaArrowRight } from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';
import { QRCodeCanvas } from 'qrcode.react';
import jsPDF from 'jspdf';
import './AdminEventManager.css';

function AdminEventManager() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [eventName, setEventName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
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
  };

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

    const expiry = new Date(end);
    expiry.setDate(expiry.getDate() + 30);

    try {
      const { error } = await supabase.from('events').insert({
        name: eventName.trim(),
        description: description.trim(),
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        expiry_date: expiry.toISOString(),
        created_by: user.id,
      });

      if (error) throw error;

      toast.success('Event created successfully!');
      setEventName('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      fetchEvents();
    } catch (error) {
      toast.error('Failed to create event');
      console.error('Error:', error);
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
    const link = `${baseUrl}/?event=${id}`;
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

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      toast.error('Sign out failed');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString();
  };

  const isExpired = (expiryDate) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  if (loading) {
    return (
      <div className="admin-container">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>📸 Capture Admin Panel</h1>
        <button className="logout-btn" onClick={handleSignOut} title="Sign Out">
          <FaSignOutAlt /> Sign Out
        </button>
      </div>

      <div className="event-form">
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
          <div className="date-inputs">
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
          <button type="submit" className="create-btn">
            Create Event
          </button>
        </form>
      </div>

      <div className="events-section">
        <h2>Your Events ({events.length})</h2>
        {events.length === 0 ? (
          <p className="no-events">No events yet. Create one to get started!</p>
        ) : (
          <div className="events-grid">
            {events.map((event) => {
              const expired = isExpired(event.expiry_date);
              return (
                <div
                  key={event.id}
                  className={`event-card ${expired ? 'expired' : ''}`}
                >
                  <div className="event-qr">
                    <QRCodeCanvas
                      id={`qr-${event.id}`}
                      value={`${window.location.origin}/?event=${event.id}`}
                      size={100}
                    />
                  </div>

                  <div className="event-details">
                    {editingId === event.id ? (
                      <div className="edit-mode">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          autoFocus
                        />
                        <button
                          className="save-btn"
                          onClick={() => updateEvent(event.id)}
                        >
                          Save
                        </button>
                        <button
                          className="cancel-btn"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3>{event.name}</h3>
                        <p className="event-id">ID: {event.id}</p>
                        {event.description && (
                          <p className="event-desc">{event.description}</p>
                        )}
                        <div className="event-dates">
                          <p>
                            <strong>Start:</strong> {formatDate(event.start_date)}
                          </p>
                          <p>
                            <strong>End:</strong> {formatDate(event.end_date)}
                          </p>
                          <p>
                            <strong>Expires:</strong>{' '}
                            {formatDate(event.expiry_date)}
                          </p>
                        </div>
                        {expired && (
                          <div className="expired-badge">📵 Expired</div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="event-actions">
                    <button
                      className="action-btn copy-btn"
                      onClick={() => copyLink(event.id)}
                      title="Copy link"
                    >
                      Link
                    </button>
                    <button
                      className="action-btn qr-btn"
                      onClick={() => downloadQRCodePDF(event)}
                      title="Download QR"
                    >
                      QR
                    </button>
                    <button
                      className="action-btn edit-btn"
                      onClick={() => {
                        setEditingId(event.id);
                        setNewName(event.name);
                      }}
                      title="Edit event"
                    >
                      Edit
                    </button>
                    <button
                      className="action-btn delete-btn"
                      onClick={() => deleteEvent(event.id)}
                      title="Delete event"
                    >
                      Delete
                    </button>
                    <button
                      className="action-btn view-btn"
                      onClick={() =>
                        window.open(`/?event=${event.id}`, '_blank')
                      }
                      title="View event"
                    >
                      <FaArrowRight />
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
