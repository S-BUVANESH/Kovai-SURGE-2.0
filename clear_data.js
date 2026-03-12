import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { getDatabase, ref, set } from "firebase/database";
import fs from 'fs';

// Extract config from firebase-config.js
const configContent = fs.readFileSync('./firebase-config.js', 'utf-8');
const configMatch = configContent.match(/const firebaseConfig = ({[\s\S]*?});/);
if (!configMatch) {
    console.error("Could not parse firebase-config.js");
    process.exit(1);
}

const firebaseConfig = eval(`(${configMatch[1]})`);

console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

const clearCollection = async (collectionName) => {
    console.log(`Clearing ${collectionName} collection in Firestore...`);
    const snapshot = await getDocs(collection(db, collectionName));
    let count = 0;
    for (const document of snapshot.docs) {
        await deleteDoc(doc(db, collectionName, document.id));
        count++;
    }
    console.log(`Deleted ${count} documents from ${collectionName}.`);
};

const clearData = async () => {
    try {
        await clearCollection('bins');
        await clearCollection('trucks');
        await clearCollection('reports');
        // keeping 'users' collection to retain the admin/citizen account

        console.log("Clearing RTDB live nodes...");
        await set(ref(rtdb, 'live'), null); // Delete everything under /live
        console.log("Deleted RTDB /live nodes.");

        console.log("✅ All seeded data successfully cleared!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error clearing data:", error.message);
        process.exit(1);
    }
};

clearData();
