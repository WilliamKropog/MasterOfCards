export const environment = {
  production: true,
  useEmulators: false,
  firebase: {
    apiKey: 'AIzaSyCewO7QDZo3j9xgb7S4RfzLG049QWxSRKI',
    authDomain: 'master-of-cards.firebaseapp.com',
    databaseURL: 'https://master-of-cards-default-rtdb.firebaseio.com',
    projectId: 'master-of-cards',
    storageBucket: 'master-of-cards.firebasestorage.app',
    messagingSenderId: '820125994898',
    appId: '1:820125994898:web:97cc4029d3425e755dbb4b',
    measurementId: 'G-FCWPJSQ4LF',
  },
  emulators: {
    auth: { host: '127.0.0.1', port: 9099 },
    firestore: { host: '127.0.0.1', port: 8080 },
    functions: { host: '127.0.0.1', port: 5001 },
  },
};
