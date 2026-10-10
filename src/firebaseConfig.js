import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // เปลี่ยนมาใช้ Firestore

const firebaseConfig = {
  apiKey: "AIzaSyBltJf8g9-YKwG98Yfu1WdoWNuP_AJqd8M",
  authDomain: "dbsensor-eb39d.firebaseapp.com",
  projectId: "dbsensor-eb39d",
  storageBucket: "dbsensor-eb39d.firebasestorage.app",
  messagingSenderId: "484180057195",
  appId: "1:484180057195:web:19443fcde28e38bba5e52e",
  measurementId: "G-ST2Y0E4RG0"
};

// เริ่มต้นระบบ Firebase
const app = initializeApp(firebaseConfig);

// ส่งออก Firestore Database ออกไปใช้งาน
export const db = getFirestore(app);