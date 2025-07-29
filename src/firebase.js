// Import the functions you need from the SDKs
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";


// Your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyB3OP7WXKT36M7qO-yrJHnm3OeyZVGU078",
    authDomain: "capturexval.firebaseapp.com",
    projectId: "capturexval",
    storageBucket: "capturexval.firebasestorage.app",  
    messagingSenderId: "983180189880",
    appId: "1:983180189880:web:0c45489c563fe7bdf7d44d",
    measurementId: "G-P143X3T4RJ"  // Optional: okay to leave
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);  // ✅ Add this line

export { db, storage, auth };  // ✅ Now export it
