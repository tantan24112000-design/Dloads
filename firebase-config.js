const firebaseConfig = {
    apiKey: "AIzaSyC5LzxgMCOvF01tSMWjoVWt3jjYAnJR394",
    authDomain: "sf2g-bf285.firebaseapp.com",
    projectId: "sf2g-bf285",
    databaseURL: "https://sf2g-bf285-default-rtdb.firebaseio.com",
    storageBucket: "sf2g-bf285.firebasestorage.app",
    messagingSenderId: "982578480996",
    appId: "1:982578480996:web:609acf09d1d5b951299c71",
    measurementId: "G-VD58ECNEPQ"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
