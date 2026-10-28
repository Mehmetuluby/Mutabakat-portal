// Firebase config & initialization (compat SDKs loaded in index.html)
const firebaseConfig = {
  apiKey: "AIzaSyA_XcO6WrihbiqqUmbjAlsx6DYAQXMoeOk",
  authDomain: "basbugcrm-3026e.firebaseapp.com",
  projectId: "basbugcrm-3026e",
  storageBucket: "basbugcrm-3026e.firebasestorage.app",
  messagingSenderId: "907051994920",
  appId: "1:907051994920:web:bb54457868770ab0390a1d",
  measurementId: "G-YL8EK2J0TJ"
};

if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Expose shared handles on window to avoid global const collisions across scripts
window.db = firebase.firestore();
window.FieldValue = firebase.firestore.FieldValue;

// Backward-compat (old single-doc state); kept for reference but NOT used in new flow
window.stateDocRef = window.db.collection("mutabakatState").doc("global-v1");


// Storage (for file uploads)
window.storage = firebase.storage();
