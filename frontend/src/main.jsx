import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1d27',
              color: '#e2e8f0',
              border: '1px solid #2e3347',
              fontSize: '13.5px',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#1a1d27' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#1a1d27' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)

