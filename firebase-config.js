// KOVAI~SURGE Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAuf0ZxDFuSY2r-cJ_7k9CsIZd5JpnBfEc",
    authDomain: "kovai-surge.firebaseapp.com",
    databaseURL: "https://kovai-surge-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "kovai-surge",
    storageBucket: "kovai-surge.firebasestorage.app",
    messagingSenderId: "54184356664",
    appId: "1:54184356664:web:ec8cd6f905d2b8c737efcd"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firebase services for use across the app
const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();
