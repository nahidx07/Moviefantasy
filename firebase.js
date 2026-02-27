const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

const saveUser = async (user) => {
    const userRef = db.collection('users').doc(user.id.toString());
    const doc = await userRef.get();
    if (!doc.exists) {
        await userRef.set({
            user_id: user.id,
            username: user.username || 'N/A',
            first_name: user.first_name,
            start_date: new Date().toISOString()
        });
    }
};

const getAllUsers = async () => {
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(doc => doc.id);
};

module.exports = { db, saveUser, getAllUsers };
