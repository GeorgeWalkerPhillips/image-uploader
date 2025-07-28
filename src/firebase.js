// Import the functions you need from the SDKs
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyB3OP7WXKT36M7qO-yrJHnm3OeyZVGU078",
    authDomain: "capturexval.firebaseapp.com",
    projectId: "capturexval",
    storageBucket: "capturexval.appspot.com", // 🔧 FIXED: correct domain format
    messagingSenderId: "983180189880",
    appId: "1:983180189880:web:0c45489c563fe7bdf7d44d",
    measurementId: "G-P143X3T4RJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// ✅ Add these lines:
export const db = getFirestore(app);
export const storage = getStorage(app);
