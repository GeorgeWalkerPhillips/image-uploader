// AdminEventManager.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
} from "firebase/firestore";
import { QRCodeCanvas } from "qrcode.react";
import jsPDF from "jspdf";
import "./AdminEventManager.css";

function AdminEventManager() {
    const [user, setUser] = useState(null);
    const [eventName, setEventName] = useState("");
    const [events, setEvents] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [newName, setNewName] = useState("");
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                navigate("/unauthorized");
                return;
            }

            try {
                const adminDocRef = doc(db, "admin", currentUser.uid);
                const adminSnap = await getDoc(adminDocRef);

                if (adminSnap.exists()) {
                    setUser(currentUser);
                    fetchEvents();
                } else {
                    navigate("/unauthorized");
                }
            } catch (err) {
                console.error("Error checking admin access:", err);
                navigate("/unauthorized");
            }
        });

        return () => unsubscribe();
    }, [navigate]);

    const isExpired = (endDateString) => {
        const now = new Date();
        const endDate = new Date(endDateString);
        return now > endDate;
    };

    const fetchEvents = async () => {
        setLoading(true);
        const snapshot = await getDocs(collection(db, "events"));
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setEvents(list);
        setLoading(false);
    };

    const createEvent = async () => {
        if (!eventName) return alert("Please enter an event name");
        try {
            const now = new Date();
            const endDate = new Date(now);
            endDate.setDate(endDate.getDate() + 30);

            await addDoc(collection(db, "events"), {
                name: eventName,
                createdAt: serverTimestamp(),
                startDate: now.toISOString(),
                endDate: endDate.toISOString(),
                coverPhotoUrl: "",
            });

            setEventName("");
            fetchEvents();
        } catch (err) {
            console.error("Failed to create event:", err);
            alert("Error creating event.");
        }
    };

    const updateEvent = async (id) => {
        const ref = doc(db, "events", id);
        await updateDoc(ref, { name: newName });
        setEditingId(null);
        fetchEvents();
    };

    const deleteEvent = async (id) => {
        if (window.confirm("Are you sure you want to delete this event?")) {
            await deleteDoc(doc(db, "events", id));
            fetchEvents();
        }
    };

    const downloadQRCodePDF = (event) => {
        const { id, name } = event;
        const canvas = document.getElementById(`qr-${id}`);
        const imgData = canvas.toDataURL("image/png");

        const pdf = new jsPDF();
        pdf.setFontSize(16);
        pdf.text("Scan to upload photos to event:", 10, 20);
        pdf.addImage(imgData, "PNG", 10, 30, 180, 180);
        pdf.text(`Event ID: ${id}`, 10, 220);
        pdf.save(`${name}_QR.pdf`);
    };

    const copyLink = (id) => {
        const link = `https://capture-by-val.vercel.app/?event=${id}`;
        navigator.clipboard.writeText(link)
            .then(() => alert("Link copied to clipboard!"))
            .catch((err) => console.error("Failed to copy:", err));
    };

    const startEditing = (event) => {
        setEditingId(event.id);
        setNewName(event.name);
    };

    return (
        <div className="admin-container">
            <h1>📸 Event Admin Panel</h1>

            <div className="event-form">
                <input
                    type="text"
                    placeholder="e.g., John's Wedding"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                />
                <button onClick={createEvent}>Create New Event</button>
            </div>

            <div className="events-grid">
                {events.map((event) => (
                    <div key={event.id} className={`event-row ${isExpired(event.endDate) ? 'expired' : ''}`}>
                        <div className="event-info">
                            <QRCodeCanvas
                                id={`qr-${event.id}`}
                                value={`https://capture-by-val.vercel.app/?event=${event.id}`}
                                size={64}
                            />
                            {editingId === event.id ? (
                                <input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onBlur={() => updateEvent(event.id)}
                                />
                            ) : (
                                <div className="event-details">
                                    <div className="event-name">
                                        {event.name} {isExpired(event.endDate) && <span className="expired-label">Expired</span>}
                                    </div>
                                    <div className="event-id">ID: {event.id}</div>
                                    <div className="event-dates">
                                        From {new Date(event.startDate).toLocaleDateString()} to {new Date(event.endDate).toLocaleDateString()}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="event-actions">
                            <button className="copy" onClick={() => copyLink(event.id)}>Copy Link</button>
                            <button className="download" onClick={() => downloadQRCodePDF(event)}>Download QR</button>
                            <button className="edit" onClick={() => startEditing(event)}>Edit</button>
                            <button className="delete" onClick={() => deleteEvent(event.id)}>Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default AdminEventManager;
