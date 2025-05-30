import React, { useState } from "react";
import QRCode from "qrcode.react";

function EventSetup() {
    const [authenticated, setAuthenticated] = useState(false);
    const [passwordInput, setPasswordInput] = useState("");

    const PASSWORD = "valisawesome123"; 

    const [eventName, setEventName] = useState("");
    const [eventId, setEventId] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const handleLogin = () => {
        if (passwordInput === PASSWORD) {
            setAuthenticated(true);
        } else {
            alert("Incorrect password");
        }
    };

    const generateEventId = () => {
        return Math.random().toString(36).substring(2, 10); // 8-character random ID
    };

    const handleCreateEvent = () => {
        if (!eventName.trim()) {
            alert("Please enter an event name.");
            return;
        }

        const newId = generateEventId();
        setEventId(newId);
        setSubmitted(true);
    };

    const downloadQRCode = () => {
        const canvas = document.getElementById("eventQRCode");
        const pngUrl = canvas
            .toDataURL("image/png")
            .replace("image/png", "image/octet-stream");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = `${eventName}_QR.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    };

    if (!authenticated) {
        return (
            <div className="login-container">
                <h2>Admin Login</h2>
                <input
                    type="password"
                    placeholder="Enter password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                />
                <button onClick={handleLogin}>Login</button>
            </div>
        );
    }

    return (
        <div className="admin-container">
            <h1>Event Setup</h1>
            <div className="form-section">
                <label>Event Name:</label>
                <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="e.g. John's Birthday"
                />
                <button onClick={handleCreateEvent}>Create Event</button>
            </div>

            {submitted && (
                <div className="event-result">
                    <h3>Event Created!</h3>
                    <p><strong>Event Name:</strong> {eventName}</p>
                    <p><strong>Event ID:</strong> {eventId}</p>
                    <p><strong>Guest Link:</strong></p>
                    <code>{`${window.location.origin}/?event=${eventId}`}</code>

                    <div className="qr-section">
                        <QRCode
                            id="eventQRCode"
                            value={`${window.location.origin}/?event=${eventId}`}
                            size={200}
                            level={"H"}
                            includeMargin={true}
                        />
                        <button onClick={downloadQRCode}>Download QR Code</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EventSetup;
