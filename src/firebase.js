// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyB3OP7WXKT36M7qO-yrJHnm3OeyZVGU078",
    authDomain: "capturexval.firebaseapp.com",
    projectId: "capturexval",
    storageBucket: "capturexval.firebasestorage.app",
    messagingSenderId: "983180189880",
    appId: "1:983180189880:web:0c45489c563fe7bdf7d44d",
    measurementId: "G-P143X3T4RJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);