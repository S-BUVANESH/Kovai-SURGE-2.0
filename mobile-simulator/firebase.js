// Firebase config for React Native (using modular SDK)
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const firebaseConfig = {
    apiKey: "AIzaSyAuf0ZxDFuSY2r-cJ_7k9CsIZd5JpnBfEc",
    authDomain: "kovai-surge.firebaseapp.com",
    databaseURL: "https://kovai-surge-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "kovai-surge",
    storageBucket: "kovai-surge.firebasestorage.app",
    messagingSenderId: "54184356664",
    appId: "1:54184356664:web:ec8cd6f905d2b8c737efcd"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Use set(ref, null) for delete so stop handlers work even if remove() isn't available.
const removeData = (dbRef) => set(dbRef, null);

export { database, ref, set, removeData };
