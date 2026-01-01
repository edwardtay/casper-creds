import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClickProvider } from '@make-software/csprclick-ui'
import App from './App'
import './index.css'

// CSPR.click configuration
const clickOptions = {
  appName: 'CasperCreds',
  appId: 'caspercreds',
  contentMode: 'iframe',
  providers: ['casper-wallet', 'ledger', 'torus-wallet', 'casper-signer'],
  chainName: 'casper-test'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClickProvider options={clickOptions}>
      <App />
    </ClickProvider>
  </React.StrictMode>,
)
