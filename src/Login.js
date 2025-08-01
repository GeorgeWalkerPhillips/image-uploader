// Login.js
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "./firebase";
import { useNavigate } from "react-router-dom";

function Login() {
    const navigate = useNavigate();

    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Optionally check role in Firestore here or in AdminEventManager
            console.log("Signed in as:", user.email);
            navigate("/admin"); // Go to admin page after login
        } catch (err) {
            console.error("Login failed", err);
            alert("Google sign-in failed.");
        }
    };

    return (
        <div style={{ textAlign: "center", marginTop: "50px" }}>
            <h2>Login to Admin Panel</h2>
            <button onClick={handleGoogleLogin}>Sign in with Google</button>
        </div>
    );
}

export default Login;
