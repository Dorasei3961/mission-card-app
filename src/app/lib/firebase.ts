// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQCrjsd_3MIDNuUQeN2RD0P8ke1sJDsV8",
  authDomain: "mission-card-app.firebaseapp.com",
  projectId: "mission-card-app",
  storageBucket: "mission-card-app.firebasestorage.app",
  messagingSenderId: "230188862801",
  appId: "1:230188862801:web:ea6f746ee4c979fbf85770"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);