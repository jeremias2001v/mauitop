import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCmR2HQQceYzzoZvjbgYavfzQTliUPRW8c",
  authDomain: "mauitopv.firebaseapp.com",
  projectId: "mauitopv",
  storageBucket: "mauitopv.firebasestorage.app",
  messagingSenderId: "557940578609",
  appId: "1:557940578609:web:e252adf53766ddd9a17810",
  measurementId: "G-QS0BY1P6N1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage, firebaseConfig };
