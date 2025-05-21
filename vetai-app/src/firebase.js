import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyANlB4vi_ktWUU37Bgs4XWgWp_VIeF0QRg",  // Replace with your actual Firebase config
  authDomain: "vetai-project.firebaseapp.com",
  projectId: "vetai-project",
  storageBucket: "vetai-project.firebasestorage.app",
  messagingSenderId: "156057684426",
  appId: "1:156057684426:web:62fa0799957bd94476e733"
};

// Debug log with actual values
console.log('Firebase Config Values:', {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with persistence
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Error setting auth persistence:", error);
  });

// Initialize Firestore with persistence
const db = getFirestore(app);
enableIndexedDbPersistence(db)
  .catch((error) => {
    console.error("Error enabling Firestore persistence:", error);
    if (error.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (error.code === 'unimplemented') {
      console.warn('The current browser does not support persistence.');
    }
  });

export { auth, db };