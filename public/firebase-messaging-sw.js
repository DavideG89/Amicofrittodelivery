/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js')

let initialized = false

function initFirebase(config) {
  if (initialized || !config) return
  firebase.initializeApp(config)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {}
    const title = notification.title || 'Nuovo ordine'
    const options = {
      body: notification.body || 'È arrivato un nuovo ordine',
      icon: '/icons/icon-star.svg',
      data: payload.data || {},
    }
    self.registration.showNotification(title, options)
  })

  initialized = true
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'INIT_FIREBASE') {
    initFirebase(event.data.config)
  }
})
