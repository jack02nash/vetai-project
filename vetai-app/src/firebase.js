import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: "vet-ai-58f03.firebaseapp.com",
  databaseURL: "https://vet-ai-58f03-default-rtdb.firebaseio.com",
  projectId: "vet-ai-58f03",
  storageBucket: "vet-ai-58f03.appspot.com",
  messagingSenderId: "108297516558",
  appId: "1:108297516558:web:7f784b2ebba4d572206e5f",
  measurementId: "G-C6R1Y7CKWD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };