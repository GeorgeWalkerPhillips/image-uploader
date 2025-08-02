import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { QRCodeCanvas } from 'qrcode.react'; // ✅ This is correct
import jsPDF from "jspdf";
import "./AdminEventManager.css";

function AdminEventManager() {
    const [user, setUser] = useState(null);
    const [eventName, setEventName] = useState("");
    const [eventId, setEventId] = useState("");
    const [qrGenerated, setQrGenerated] = useState(false);
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
                    setUser(currentUser); // Authorized admin
                } else {
                    navigate("/unauthorized"); // Not an admin
                }
            } catch (err) {
                console.error("Error checking admin access:", err);
                navigate("/unauthorized");
            }
        });

        return () => unsubscribe();
    }, [navigate]);
    

    const createEvent = async () => {
        if (!eventName) return alert("Please enter an event name");

        try {
            const docRef = await addDoc(collection(db, "events"), {
                name: eventName,
                createdAt: serverTimestamp(),
                coverPhotoUrl: "",
            });

            setEventId(docRef.id);
            setQrGenerated(true);
        } catch (err) {
            console.error("Failed to create event:", err);
            alert("Error creating event.");
        }
    };

    const downloadQRCodePDF = () => {
        const qrCanvas = document.querySelector("canvas");
        const imgData = qrCanvas.toDataURL("image/png");

        const pdf = new jsPDF();
        pdf.setFontSize(16);
        pdf.text("Scan to upload photos to event:", 10, 20);
        pdf.addImage(imgData, "PNG", 10, 30, 180, 180);
        pdf.text(`Event ID: ${eventId}`, 10, 220);
        pdf.save(`${eventName}_QR.pdf`);
    };

    const copyLink = () => {
        const link = `https://capture-by-val.vercel.app/?event=${eventId}`;
        navigator.clipboard.writeText(link)
            .then(() => alert("Link copied to clipboard!"))
            .catch(err => console.error("Failed to copy link:", err));
    }

    return (
        <div className="admin-container">
            <h1>Event Admin Panel</h1>

            <div className="event-form">
                <label>Event Name:</label>
                <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="e.g., John's Wedding"
                />
                <button onClick={createEvent}>Create Event</button>
            </div>

            {qrGenerated && (
                <div className="qr-section">
                    <h3>QR Code for Event</h3>
                    <QRCodeCanvas value={`https://capture-by-val.vercel.app/?event=${eventId}`} size={256} />
                    <br />
                    <button onClick={downloadQRCodePDF}>Download as PDF</button>
                    <button onClick={copyLink}>Copy Link</button>
                </div>
            )}
        </div>
    );
}

export default AdminEventManager;
