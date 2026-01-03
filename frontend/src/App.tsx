/// <reference types="vite/client" />
import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useClickRef } from '@make-software/csprclick-ui'
import { createWorker } from 'tesseract.js'
import { 
  getChainStats, 
  verifyCredentialOnChain, 
  issueCredential, 
  isContractConfigured,
  waitForDeploy,
  uploadToIPFS,
  uploadImageToIPFS,
  isIPFSConfigured,
  getCredentialsByHolder,
  getTotalCredentials,
  OnChainCredential
} from './casper'

interface Credential {
  id: string; issuer: string; holder: string; type: string; title: string
  institution: string; issuedAt: number; expiresAt: number; revoked: boolean
  txHash?: string; signature?: string; onChain?: boolean; chainId?: number
}

interface ChainStats { 
  blockHeight: number; era: number; peers: number
  stateRootHash?: string; buildVersion?: string
}

type Role = null | 'issuer' | 'verifier' | 'holder'

// No hardcoded credentials - everything comes from on-chain
const STORAGE_KEY = 'caspercreds_v6' // Local cache for issued credentials

const loadStorage = (): Credential[] => { 
  try { 
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    // Only return real on-chain credentials
    return stored.filter((c: Credential) => c.onChain === true)
  } catch { return [] }
}
const saveStorage = (c: Credential[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(c))

// Get role from URL path
const getRoleFromPath = (): Role => {
  const path = window.location.pathname.toLowerCase()
  if (path === '/issuer') return 'issuer'
  if (path === '/verifier' || path === '/verify') return 'verifier'
  if (path === '/holder' || path === '/wallet') return 'holder'
  return null
}

// Update URL when role changes
const updateUrl = (role: Role) => {
  const path = role ? `/${role}` : '/'
  window.history.pushState({}, '', path)
}

export default function App() {
  const [role, setRole] = useState<Role>(getRoleFromPath)
  const [pubKey, setPubKey] = useState('')
  const [chainStats, setChainStats] = useState<ChainStats|null>(null)
  const [credentials, setCredentials] = useState<Credential[]>(loadStorage)
  const [toast, setToast] = useState<{t:'ok'|'err', m:string}|null>(null)
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => setRole(getRoleFromPath())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Update URL when role changes
  const handleSetRole = (newRole: Role) => {
    setRole(newRole)
    updateUrl(newRole)
  }

  useEffect(() => {
    fetchStats()
    const i = setInterval(fetchStats, 20000)
    return () => clearInterval(i)
  }, [])

  const fetchStats = async () => {
    const stats = await getChainStats()
    if (stats) setChainStats(stats)
  }

  const clickRef = useClickRef()

  const connectWallet = async () => {
    try {
      // Use CSPR.click for wallet connection (supports multiple wallets + social login)
      if (clickRef) {
        clickRef.signIn()
        return
      }
      // Fallback to direct Casper Wallet
      const p = (window as any).CasperWalletProvider?.()
      if (!p) return setToast({t:'err', m:'Install Casper Wallet or use CSPR.click'})
      await p.requestConnection()
      setPubKey(await p.getActivePublicKey())
      setToast({t:'ok', m:'Wallet connected'})
    } catch (e: any) { setToast({t:'err', m:e.message}) }
  }

  const disconnectWallet = () => {
    if (clickRef) {
      clickRef.signOut()
    }
    setPubKey('')
    setWalletMenuOpen(false)
    setToast({t:'ok', m:'Wallet disconnected'})
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(pubKey)
    setToast({t:'ok', m:'Address copied'})
    setWalletMenuOpen(false)
  }

  const viewOnExplorer = () => {
    window.open(`https://testnet.cspr.live/account/${pubKey}`, '_blank')
    setWalletMenuOpen(false)
  }

  // Listen for CSPR.click account changes
  useEffect(() => {
    if (!clickRef) return
    const handleSignedIn = (evt: any) => {
      if (evt?.account?.public_key) {
        setPubKey(evt.account.public_key)
        setToast({t:'ok', m:'Wallet connected via CSPR.click'})
      }
    }
    const handleSwitched = (evt: any) => {
      if (evt?.account?.public_key) {
        setPubKey(evt.account.public_key)
        setToast({t:'ok', m:'Account switched'})
      }
    }
    const handleSignedOut = () => {
      setPubKey('')
      setToast({t:'ok', m:'Signed out'})
    }
    
    clickRef.on('csprclick:signed_in', handleSignedIn)
    clickRef.on('csprclick:switched_account', handleSwitched)
    clickRef.on('csprclick:signed_out', handleSignedOut)
    
    // Check if already connected
    const activeAccount = clickRef.getActiveAccount()
    if (activeAccount?.public_key) {
      setPubKey(activeAccount.public_key)
    }
    
    return () => {
      clickRef.off('csprclick:signed_in', handleSignedIn)
      clickRef.off('csprclick:switched_account', handleSwitched)
      clickRef.off('csprclick:signed_out', handleSignedOut)
    }
  }, [clickRef])

  const addCredential = (c: Credential) => {
    const updated = [...credentials, c]
    setCredentials(updated)
    saveStorage(updated)
  }

  if (!role) return <LandingPage setRole={handleSetRole} chainStats={chainStats} credentials={credentials} />

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      <div className="fixed inset-0 bg-gradient-to-br from-red-950/20 via-transparent to-purple-950/20 pointer-events-none"/>
      <header className="relative z-[200] border-b border-zinc-800/50 backdrop-blur-sm">
        <div className="px-6 h-16 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button onClick={()=>handleSetRole(null)} className="flex items-center gap-2 hover:opacity-80">
              <img src="/logo.png" alt="CasperCreds" className="w-10 h-10 rounded-xl shadow-lg shadow-red-500/20"/>
              <span className="font-bold text-lg">CasperCreds</span>
            </button>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${role==='issuer'?'bg-purple-500/20 text-purple-400':role==='verifier'?'bg-blue-500/20 text-blue-400':'bg-green-500/20 text-green-400'}`}>
              {role.charAt(0).toUpperCase() + role.slice(1)} Portal
            </span>
          </div>
          <div className="flex items-center gap-3">
            {pubKey ? (
              <div className="relative">
                <button onClick={()=>setWalletMenuOpen(!walletMenuOpen)} className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 transition">
                  <span className="w-2 h-2 bg-green-500 rounded-full"/><code className="text-sm text-zinc-400">{pubKey.slice(0,8)}...{pubKey.slice(-4)}</code>
                  <span className="text-zinc-500 text-xs">▼</span>
                </button>
                {walletMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-[100] overflow-hidden">
                    <button onClick={copyAddress} className="w-full px-4 py-3 text-left text-sm hover:bg-zinc-800 flex items-center gap-2">📋 Copy Address</button>
                    <button onClick={viewOnExplorer} className="w-full px-4 py-3 text-left text-sm hover:bg-zinc-800 flex items-center gap-2">🔗 View on Explorer</button>
                    <div className="border-t border-zinc-700"/>
                    <button onClick={disconnectWallet} className="w-full px-4 py-3 text-left text-sm hover:bg-zinc-800 text-red-400 flex items-center gap-2">🚪 Disconnect</button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={connectWallet} className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 rounded-lg font-medium shadow-lg shadow-red-500/20">Connect Wallet</button>
            )}
            <select value={role || ''} onChange={e=>handleSetRole(e.target.value as Role)} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm border border-zinc-700 cursor-pointer">
              <option value="issuer">🏛️ Issuer</option>
              <option value="verifier">🔍 Verifier</option>
              <option value="holder">👤 Holder</option>
            </select>
          </div>
        </div>
      </header>
      {toast && <div className={`fixed top-20 right-6 px-5 py-3 rounded-xl text-sm shadow-2xl z-50 ${toast.t==='err'?'bg-red-950 border border-red-800':'bg-green-950 border border-green-800'}`}>{toast.m} <button onClick={()=>setToast(null)} className="ml-3">×</button></div>}
      <main className="relative max-w-7xl mx-auto px-6 py-8">
        {role === 'issuer' && <IssuerPortal pubKey={pubKey} credentials={credentials} addCredential={addCredential} setToast={setToast} clickRef={clickRef}/>}
        {role === 'verifier' && <VerifierPortal credentials={credentials} setToast={setToast}/>}
        {role === 'holder' && <HolderPortal pubKey={pubKey} credentials={credentials} setToast={setToast}/>}
      </main>
    </div>
  )
}

function LandingPage({ setRole, chainStats, credentials }: { setRole:(r:Role)=>void, chainStats:ChainStats|null, credentials:Credential[] }) {
  const contractReady = isContractConfigured()
  const contractHash = import.meta.env.VITE_CONTRACT_HASH?.replace('contract-package-', '') || ''
  const [totalOnChain, setTotalOnChain] = useState(0)
  
  // Fetch total credentials from chain
  useEffect(() => {
    if (contractReady) {
      getTotalCredentials().then(setTotalOnChain).catch(() => {})
    }
  }, [contractReady])
  
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans flex flex-col">
      <div className="fixed inset-0 bg-gradient-to-br from-red-950/30 via-transparent to-purple-950/30 pointer-events-none"/>
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none"/>
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"/>
      <header className="relative border-b border-zinc-800/50">
        <div className="px-6 h-16 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="CasperCreds" className="w-10 h-10 rounded-xl shadow-lg shadow-red-500/20"/>
            <span className="font-bold text-xl">CasperCreds</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-500">
            {contractReady && <a href={`https://testnet.cspr.live/contract-package/${contractHash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-green-400 hover:text-green-300"><span className="w-2 h-2 bg-green-500 rounded-full"/>Contract ↗</a>}
          </div>
        </div>
      </header>
      <main className="relative max-w-7xl mx-auto px-6 py-8 flex-1">
        <div className="text-center mb-6 px-2">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent leading-tight">Verifiable Credentials<br/>for the Real World</h1>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto">Issue, verify, and manage credentials on blockchain. Degrees, licenses, certifications — cryptographically secured and tamper-proof.</p>
        </div>
        <div className="mb-10 p-5 bg-zinc-900/50 rounded-2xl border border-zinc-800">
          <div className="flex items-center gap-2 mb-4"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/><span className="text-sm font-medium text-green-400">Live Network Status</span><span className="text-xs text-zinc-600 ml-auto">casper-test</span></div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-3 bg-zinc-800/50 rounded-xl"><div className="text-xs text-zinc-500 mb-1">Block</div>{chainStats ? <div className="text-lg font-bold font-mono">{chainStats.blockHeight.toLocaleString()}</div> : <div className="h-7 bg-zinc-700/50 rounded animate-pulse"/>}</div>
            <div className="p-3 bg-zinc-800/50 rounded-xl"><div className="text-xs text-zinc-500 mb-1">Era</div>{chainStats ? <div className="text-lg font-bold font-mono">{chainStats.era.toLocaleString()}</div> : <div className="h-7 bg-zinc-700/50 rounded animate-pulse"/>}</div>
            <div className="p-3 bg-zinc-800/50 rounded-xl"><div className="text-xs text-zinc-500 mb-1">Peers</div>{chainStats ? <div className="text-lg font-bold font-mono">{chainStats.peers}</div> : <div className="h-7 bg-zinc-700/50 rounded animate-pulse"/>}</div>
            <div className="p-3 bg-zinc-800/50 rounded-xl"><div className="text-xs text-zinc-500 mb-1">Credentials</div><div className="text-lg font-bold font-mono">{totalOnChain || credentials.length}</div></div>
            <a href={`https://testnet.cspr.live/contract-package/${contractHash}`} target="_blank" rel="noopener noreferrer" className="p-3 bg-zinc-800/50 rounded-xl hover:bg-zinc-700/50 transition"><div className="text-xs text-zinc-500 mb-1">Contract ↗</div><div className="text-xs font-mono text-green-400 truncate">{contractHash ? `${contractHash.slice(0,12)}...` : '—'}</div></a>
          </div>
        </div>
        <div className="mb-10"><h2 className="text-2xl font-bold text-center mb-6">Choose Your Role</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            <button onClick={()=>setRole('issuer')} className="group p-6 bg-gradient-to-br from-purple-950/50 to-zinc-900 rounded-2xl border border-purple-800/30 hover:border-purple-500/50 transition text-left hover:scale-[1.02]">
              <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">🏛️</div>
              <h3 className="text-xl font-bold mb-2">Issuer</h3><p className="text-zinc-400 text-sm mb-3">Universities, companies, certification bodies.</p>
              <ul className="text-xs text-zinc-500 space-y-1 mb-3"><li>• Issue credentials on-chain</li><li>• Batch issuance via CSV</li><li>• Revoke with audit trail</li></ul>
              <div className="text-purple-400 text-sm font-medium group-hover:translate-x-1 transition">Enter Portal →</div>
            </button>
            <button onClick={()=>setRole('verifier')} className="group p-6 bg-gradient-to-br from-blue-950/50 to-zinc-900 rounded-2xl border border-blue-800/30 hover:border-blue-500/50 transition text-left hover:scale-[1.02]">
              <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">🔍</div>
              <h3 className="text-xl font-bold mb-2">Verifier</h3><p className="text-zinc-400 text-sm mb-3">Employers, institutions, anyone verifying credentials.</p>
              <ul className="text-xs text-zinc-500 space-y-1 mb-3"><li>• Instant blockchain verification</li><li>• Cryptographic proof</li><li>• No wallet required</li></ul>
              <div className="text-blue-400 text-sm font-medium group-hover:translate-x-1 transition">Enter Portal →</div>
            </button>
            <button onClick={()=>setRole('holder')} className="group p-6 bg-gradient-to-br from-green-950/50 to-zinc-900 rounded-2xl border border-green-800/30 hover:border-green-500/50 transition text-left hover:scale-[1.02]">
              <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition">👤</div>
              <h3 className="text-xl font-bold mb-2">Holder</h3><p className="text-zinc-400 text-sm mb-3">Individuals who hold and share credentials.</p>
              <ul className="text-xs text-zinc-500 space-y-1 mb-3"><li>• View all credentials</li><li>• Share via QR/link</li><li>• Export as PDF</li></ul>
              <div className="text-green-400 text-sm font-medium group-hover:translate-x-1 transition">Enter Portal →</div>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          <div className="p-5 bg-red-950/30 rounded-2xl border border-red-900/30"><h3 className="text-lg font-semibold text-red-400 mb-3">❌ The $600B Problem</h3><ul className="space-y-2 text-sm text-zinc-400"><li>• <strong className="text-white">40%</strong> of resumes contain falsified credentials</li><li>• Manual verification takes <strong className="text-white">days to weeks</strong></li><li>• Centralized databases are <strong className="text-white">hackable</strong></li></ul></div>
          <div className="p-5 bg-green-950/30 rounded-2xl border border-green-900/30"><h3 className="text-lg font-semibold text-green-400 mb-3">✓ Our Solution</h3><ul className="space-y-2 text-sm text-zinc-400"><li>• <strong className="text-white">Instant</strong> blockchain verification</li><li>• <strong className="text-white">Immutable</strong> credential records</li><li>• <strong className="text-white">Cryptographic</strong> signatures</li></ul></div>
        </div>
        
        {/* How it Works */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-center mb-6">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative p-5 bg-zinc-900/50 rounded-2xl border border-zinc-800">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-sm font-bold">1</div>
              <div className="text-2xl mb-3">🏛️</div>
              <h4 className="font-semibold mb-2">Issuer Registers</h4>
              <p className="text-xs text-zinc-400">Universities & institutions register as verified issuers on-chain</p>
            </div>
            <div className="relative p-5 bg-zinc-900/50 rounded-2xl border border-zinc-800">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-sm font-bold">2</div>
              <div className="text-2xl mb-3">📝</div>
              <h4 className="font-semibold mb-2">Issue Credential</h4>
              <p className="text-xs text-zinc-400">Credential data stored on Casper blockchain + metadata on IPFS</p>
            </div>
            <div className="relative p-5 bg-zinc-900/50 rounded-2xl border border-zinc-800">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-sm font-bold">3</div>
              <div className="text-2xl mb-3">🔍</div>
              <h4 className="font-semibold mb-2">Instant Verify</h4>
              <p className="text-xs text-zinc-400">Anyone can verify credentials instantly via blockchain query</p>
            </div>
            <div className="relative p-5 bg-zinc-900/50 rounded-2xl border border-zinc-800">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-sm font-bold">4</div>
              <div className="text-2xl mb-3">📤</div>
              <h4 className="font-semibold mb-2">Share & Export</h4>
              <p className="text-xs text-zinc-400">Share via QR code, link, or export as PDF certificate</p>
            </div>
          </div>
        </div>

        {/* Credential Types */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-center mb-2">Supported Credential Types</h2>
          <p className="text-center text-zinc-500 text-sm mb-6">Issue any type of verifiable credential on Casper blockchain</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { type: 'degree', icon: '🎓', name: 'Degrees', desc: 'University diplomas & academic credentials' },
              { type: 'certificate', icon: '📜', name: 'Certificates', desc: 'Professional certifications & courses' },
              { type: 'license', icon: '📋', name: 'Licenses', desc: 'Professional & occupational licenses' },
              { type: 'employment', icon: '💼', name: 'Employment', desc: 'Work history & job verification' },
              { type: 'identity', icon: '🪪', name: 'Identity', desc: 'ID documents & KYC verification' }
            ].map(item => (
              <div key={item.type} className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-zinc-700 transition text-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 mx-auto mb-3">
                  {item.icon}
                </div>
                <div className="font-medium text-sm mb-1">{item.name}</div>
                <div className="text-xs text-zinc-500">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-10 p-5 bg-zinc-900/50 rounded-2xl border border-zinc-800"><h3 className="text-lg font-semibold mb-4">🔐 Security Architecture</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-zinc-800/50 rounded-xl"><div className="text-2xl mb-2">🔑</div><div className="font-medium text-sm">Ed25519 Signatures</div><div className="text-xs text-zinc-500">Cryptographic proof</div></div>
            <div className="p-4 bg-zinc-800/50 rounded-xl"><div className="text-2xl mb-2">⛓️</div><div className="font-medium text-sm">Immutable Ledger</div><div className="text-xs text-zinc-500">Tamper-proof records</div></div>
            <div className="p-4 bg-zinc-800/50 rounded-xl"><div className="text-2xl mb-2">📦</div><div className="font-medium text-sm">IPFS Storage</div><div className="text-xs text-zinc-500">Decentralized metadata</div></div>
            <div className="p-4 bg-zinc-800/50 rounded-xl"><div className="text-2xl mb-2">🛡️</div><div className="font-medium text-sm">Access Control</div><div className="text-xs text-zinc-500">Role-based permissions</div></div>
          </div>
        </div>
      </main>
      <footer className="relative border-t border-zinc-800/50 py-6">
        <div className="flex flex-col items-center gap-2 text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
            <span>Powered by</span>
            <span className="text-red-400 font-medium">Casper Network</span>
          </div>
          <p className="text-xs text-zinc-600 text-center max-w-md">Testnet demo only. Not for production use. Credentials are for demonstration purposes.</p>
        </div>
      </footer>
    </div>
  )
}


function IssuerPortal({ pubKey, credentials, addCredential, setToast, clickRef }: { pubKey:string, credentials:Credential[], addCredential:(c:Credential)=>void, setToast:(t:any)=>void, clickRef:any }) {
  const [view, setView] = useState<'issue'|'batch'|'history'>('issue')
  const [form, setForm] = useState({ holder:'', type:'degree', title:'', institution:'', startDate:'', expires:'', holderName:'', description:'', grade:'', skills:'', licenseNumber:'', idNumber:'' })
  const [loading, setLoading] = useState(false)
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<any[]>([])
  const [imageFile, setImageFile] = useState<File|null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [extracting, setExtracting] = useState(false)
  const extractAbortRef = useRef<AbortController|null>(null)
  const myIssued = credentials.filter(c => c.issuer === pubKey)
  const generateId = () => `CRED-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
  const contractReady = isContractConfigured()
  const ipfsReady = isIPFSConfigured()

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setToast({t:'err', m:'Image must be under 5MB'})
        return
      }
      
      // Cancel any pending extraction
      if (extractAbortRef.current) {
        extractAbortRef.current.abort()
        extractAbortRef.current = null
      }
      setExtracting(false)
      
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = async (evt) => {
        const base64 = evt.target?.result as string
        setImagePreview(base64)
        
        // Try OCR extraction
        if (file.type.startsWith('image/')) {
          const abortController = new AbortController()
          extractAbortRef.current = abortController
          setExtracting(true)
          setToast({t:'ok', m:'🔍 Running OCR...'})
          
          try {
            const extracted = await extractCredentialInfo(base64, abortController.signal)
            if (extracted && !abortController.signal.aborted) {
              setForm(prev => ({ ...prev, ...extracted }))
              setToast({t:'ok', m:'✓ Auto-filled from image'})
            } else if (!abortController.signal.aborted) {
              setToast({t:'ok', m:'OCR complete - no fields detected'})
            }
          } catch (err: any) {
            if (err.name !== 'AbortError') {
              console.error('OCR failed:', err)
              setToast({t:'err', m:'OCR failed: ' + (err.message || 'Unknown error')})
            }
          } finally {
            if (!abortController.signal.aborted) {
              setExtracting(false)
              extractAbortRef.current = null
            }
          }
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const clearImage = () => {
    // Cancel any pending extraction
    if (extractAbortRef.current) {
      extractAbortRef.current.abort()
      extractAbortRef.current = null
    }
    setExtracting(false)
    setImageFile(null)
    setImagePreview('')
  }

  // Extract credential info from image using Tesseract.js (fast, client-side OCR)
  const extractCredentialInfo = async (base64Image: string, signal: AbortSignal): Promise<Partial<typeof form> | null> => {
    let worker: any = null
    try {
      
      // Create Tesseract worker (silent mode)
      worker = await createWorker('eng', 1, {
        logger: () => {} // Suppress verbose logging
      })
      
      if (signal.aborted) {
        await worker.terminate()
        return null
      }
      
      // Run OCR
      const { data: { text: extractedText } } = await worker.recognize(base64Image)
      await worker.terminate()
      worker = null
      
      if (signal.aborted) return null
      
      // Parse credential info from extracted text
      const result: Partial<typeof form> = {}
      const text = extractedText.toLowerCase()
      const lines = extractedText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
      
      // Detect credential type
      if (text.includes('license') || text.includes('licensed') || text.includes('licensure')) {
        result.type = 'license'
      } else if (text.includes('degree') || text.includes('bachelor') || text.includes('master') || text.includes('phd')) {
        result.type = 'degree'
      } else if (text.includes('certificate') || text.includes('certification')) {
        result.type = 'certificate'
      } else if (text.includes('employment') || text.includes('employee')) {
        result.type = 'employment'
      }
      
      // Extract institution - look for BOARD, UNIVERSITY, etc in uppercase or title case
      for (const line of lines) {
        if (/state board|university|college|institute|academy|school/i.test(line)) {
          result.institution = line.replace(/official.*|licensing.*/i, '').trim()
          break
        }
      }
      
      // Extract title - look for Professional X, Bachelor of X, etc
      for (const line of lines) {
        if (/^professional\s+\w+/i.test(line)) {
          result.title = line.trim()
          break
        }
        if (/bachelor|master|doctor|certificate of/i.test(line)) {
          result.title = line.trim()
          break
        }
      }
      
      // Extract holder name - look for line after "certify that" or standalone name pattern
      // Exclude words that are likely titles, not names
      const titleWords = /professional|engineer|bachelor|master|doctor|certificate|license|degree|certified|specialist|technician|architect|manager|director|officer|analyst/i
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip lines that look like credential titles
        if (titleWords.test(line)) continue
        
        // Check if this line or previous mentions "certify"
        if (/certify|awarded to|granted to|presented to/i.test(lines[i-1] || '')) {
          if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(line)) {
            result.holderName = line
            break
          }
        }
        // Look for standalone name (First Last pattern, not all caps)
        if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(line) && !result.holderName) {
          result.holderName = line
        }
      }
      
      // Extract skills - look for areas of specialization
      const skillsLine = lines.find((l: string) => /civil|structural|mechanical|electrical|software|engineering/i.test(l))
      if (skillsLine) {
        result.skills = skillsLine.replace(/areas of specialization/i, '').trim()
      }
      
      // Extract grade/status
      if (text.includes('licensed')) result.grade = 'Licensed'
      else if (text.includes('passed') || text.includes('pass')) result.grade = 'Pass'
      else if (text.includes('completed')) result.grade = 'Completed'
      
      // Extract dates (start date, expiration date, issue date)
      // Common date formats: MM/DD/YYYY, DD/MM/YYYY, Month DD, YYYY, YYYY-MM-DD
      const foundDates: { date: Date, context: string }[] = []
      const monthMap: {[key:string]:number} = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 }
      
      for (const line of lines) {
        // Check numeric date patterns
        let match = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
        if (match) {
          const [_, p1, p2, year] = match
          // Assume MM/DD/YYYY format
          const date = new Date(parseInt(year), parseInt(p1) - 1, parseInt(p2))
          if (!isNaN(date.getTime())) {
            foundDates.push({ date, context: line.toLowerCase() })
          }
        }
        
        // Check YYYY-MM-DD
        match = line.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
        if (match) {
          const [_, year, month, day] = match
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          if (!isNaN(date.getTime())) {
            foundDates.push({ date, context: line.toLowerCase() })
          }
        }
        
        // Check Month DD, YYYY
        match = line.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i)
        if (match) {
          const [_, month, day, year] = match
          const date = new Date(parseInt(year), monthMap[month.toLowerCase()], parseInt(day))
          if (!isNaN(date.getTime())) {
            foundDates.push({ date, context: line.toLowerCase() })
          }
        }
        
        // Check DD Month YYYY
        match = line.match(/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i)
        if (match) {
          const [_, day, month, year] = match
          const date = new Date(parseInt(year), monthMap[month.toLowerCase()], parseInt(day))
          if (!isNaN(date.getTime())) {
            foundDates.push({ date, context: line.toLowerCase() })
          }
        }
      }
      
      // Categorize dates based on context
      const formatDate = (d: Date) => d.toISOString().split('T')[0] // YYYY-MM-DD for input[type=date]
      
      for (const { date, context } of foundDates) {
        if (/expir|valid until|through|ends/i.test(context)) {
          result.expires = formatDate(date)
        } else if (/issued|granted|awarded|start|effective|from|begin/i.test(context)) {
          result.startDate = formatDate(date)
        }
      }
      
      // If we found dates but couldn't categorize, use heuristics
      if (foundDates.length > 0 && !result.startDate && !result.expires) {
        const sortedDates = foundDates.sort((a, b) => a.date.getTime() - b.date.getTime())
        if (sortedDates.length >= 2) {
          result.startDate = formatDate(sortedDates[0].date)
          result.expires = formatDate(sortedDates[sortedDates.length - 1].date)
        } else if (sortedDates.length === 1) {
          // Single date - likely issue/start date
          result.startDate = formatDate(sortedDates[0].date)
        }
      }
      
      return Object.keys(result).length > 0 ? result : null
    } catch (err: any) {
      console.error('OCR error:', err)
      if (worker) {
        try { await worker.terminate() } catch {}
      }
      throw err
    }
  }

  const issue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pubKey) return setToast({t:'err', m:'Connect wallet first'})
    setLoading(true)
    
    const timestamp = Date.now()
    const localId = generateId()
    const expiresAt = form.expires ? new Date(form.expires).getTime() : 0
    
    // Upload image to IPFS if provided
    let imageHash = ''
    if (imageFile && ipfsReady) {
      try {
        setToast({t:'ok', m:'Uploading image to IPFS...'})
        imageHash = await uploadImageToIPFS(imageFile)
      } catch (err) {
        console.error('Image upload failed:', err)
      }
    }
    
    // Upload metadata to IPFS if configured
    let metadataHash = ''
    if (ipfsReady) {
      try {
        setToast({t:'ok', m:'Uploading metadata to IPFS...'})
        metadataHash = await uploadToIPFS({
          title: form.title,
          type: form.type,
          institution: form.institution,
          holder: form.holder,
          issuer: pubKey,
          issuedAt: timestamp,
          startDate: form.startDate ? new Date(form.startDate).getTime() : timestamp,
          expiresAt,
          description: form.description,
          holderName: form.holderName,
          grade: form.grade,
          skills: form.skills,
          licenseNumber: form.licenseNumber,
          idNumber: form.idNumber,
          imageUrl: imageHash ? `ipfs://${imageHash}` : undefined
        })
      } catch (err) {
        console.error('IPFS upload failed:', err)
      }
    }
    
    // Issue on-chain (requires Casper Wallet extension for signing)
    if (!contractReady) {
      setToast({t:'err', m:'Contract not configured'})
      setLoading(false)
      return
    }
    
    // Check for Casper Wallet extension
    const wallet = (window as any).CasperWalletProvider?.()
    if (!wallet) {
      setToast({t:'err', m:'Install Casper Wallet extension to issue credentials'})
      setLoading(false)
      return
    }
    
    try {
      setToast({t:'ok', m:'Submitting to blockchain...'})
      const result = await issueCredential(
        pubKey,
        form.holder,
        form.type,
        form.title,
        expiresAt,
        metadataHash,
        clickRef
      )
      
      if (result) {
        setToast({t:'ok', m:'Waiting for confirmation...'})
        const success = await waitForDeploy(result.deployHash, 60000)
        
        if (success) {
          const cred: Credential = {
            id: localId,
            issuer: pubKey,
            holder: form.holder,
            type: form.type,
            title: form.title,
            institution: form.institution,
            issuedAt: timestamp,
            expiresAt,
            revoked: false,
            txHash: result.deployHash,
            onChain: true
          }
          addCredential(cred)
          setToast({t:'ok', m:`✓ On-chain: ${localId}${metadataHash ? ' + IPFS' : ''}`})
          setForm({ holder:'', type:'degree', title:'', institution:'', startDate:'', expires:'', holderName:'', description:'', grade:'', skills:'', licenseNumber:'', idNumber:'' })
          setImageFile(null)
          setImagePreview('')
          setLoading(false)
          return
        }
      }
      setToast({t:'err', m:'Transaction failed'})
    } catch (err: any) {
      console.error('On-chain issue failed:', err)
      setToast({t:'err', m: err.message || 'Transaction failed'})
    }
    setLoading(false)
  }

  const parseCSV = () => {
    const lines = csv.trim().split('\n').filter(l=>l.trim())
    if (lines.length < 2) return setToast({t:'err', m:'Need header + data'})
    const parsed = lines.slice(1).map(line => { const [holder, type, title, institution] = line.split(',').map(s=>s.trim()); return { holder, type: type || 'certificate', title, institution } }).filter(p => p.holder && p.title && p.institution)
    setPreview(parsed)
  }

  const issueBatch = async () => {
    if (!pubKey) return setToast({t:'err', m:'Connect wallet'})
    if (!contractReady) return setToast({t:'err', m:'Contract not configured - batch requires on-chain'})
    setToast({t:'ok', m:`Batch issuance requires individual on-chain transactions. Use single issue for now.`})
  }

  if (!pubKey) return (<div className="text-center py-20"><div className="w-20 h-20 bg-purple-500/20 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-6">🏛️</div><h2 className="text-2xl font-bold mb-4">Issuer Portal</h2><p className="text-zinc-400 mb-8">Connect your wallet using the button in the header</p></div>)

  return (
    <div className="space-y-6">
      <div className="flex gap-2">{[{id:'issue',l:'Issue Single',i:'📝'},{id:'batch',l:'Batch Issue',i:'📦'},{id:'history',l:'History',i:'📋'}].map(t=><button key={t.id} onClick={()=>setView(t.id as any)} className={`px-4 py-2 rounded-lg font-medium transition ${view===t.id?'bg-purple-600 text-white':'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>{t.i} {t.l}</button>)}<div className="flex-1"/><div className="text-sm text-zinc-500 self-center">{myIssued.length} issued</div></div>
      {view === 'issue' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={issue} className="lg:col-span-2 p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800"><h3 className="text-lg font-semibold mb-6">Issue New Credential</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-2">Type *</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700"><option value="degree">🎓 Degree</option><option value="certificate">📜 Certificate</option><option value="license">📋 License</option><option value="employment">💼 Employment</option><option value="identity">🪪 Identity</option></select></div>
              <div className="col-span-2">
                <label className="block text-sm text-zinc-400 mb-2">Document Image</label>
                {imagePreview ? (
                  <div className="flex items-center gap-3">
                    <div className="relative inline-block group">
                      <img src={imagePreview} alt="Preview" className="h-16 rounded-lg border border-zinc-700 cursor-pointer transition-transform"/>
                      <button type="button" onClick={clearImage} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full text-white text-xs hover:bg-red-500">×</button>
                      <div className="fixed inset-0 z-50 hidden group-hover:flex items-center justify-center bg-black/80 pointer-events-none">
                        <img src={imagePreview} alt="Preview enlarged" className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl"/>
                      </div>
                    </div>
                    {extracting && <div className="flex items-center gap-2 text-sm text-purple-400"><span className="animate-spin">⚙️</span> Extracting...</div>}
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-full h-20 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-purple-500 transition">
                    <div className="text-center">
                      <span className="text-2xl">📄</span>
                      <p className="text-xs text-zinc-500 mt-1">Drop image or click to upload</p>
                    </div>
                    <input type="file" accept="image/*,.pdf" onChange={handleImageChange} className="hidden"/>
                  </label>
                )}
              </div>
              <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-2">Holder Address *</label><input value={form.holder} onChange={e=>setForm({...form,holder:e.target.value})} placeholder="02abc... (Casper public key)" className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700 font-mono text-sm" required/></div>
              <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-2">{form.type === 'employment' ? 'Employee Name' : 'Holder Name'}</label><input value={form.holderName} onChange={e=>setForm({...form,holderName:e.target.value})} placeholder="e.g. John Smith" className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700"/></div>
              
              {/* Institution/Company/Authority - varies by type */}
              <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-2">
                {form.type === 'degree' ? 'University/Institution *' : 
                 form.type === 'certificate' ? 'Issuing Organization *' : 
                 form.type === 'license' ? 'Licensing Authority *' : 
                 form.type === 'employment' ? 'Company/Employer *' : 
                 'Issuing Authority *'}
              </label><input value={form.institution} onChange={e=>setForm({...form,institution:e.target.value})} placeholder={
                form.type === 'degree' ? 'e.g. MIT, Stanford University' : 
                form.type === 'certificate' ? 'e.g. AWS, Google, Coursera' : 
                form.type === 'license' ? 'e.g. State Board of Engineering' : 
                form.type === 'employment' ? 'e.g. Google, Amazon, Startup Inc' : 
                'e.g. Government Agency'
              } className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700" required/></div>
              
              {/* Title - varies by type */}
              <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-2">
                {form.type === 'degree' ? 'Degree Title *' : 
                 form.type === 'certificate' ? 'Certificate Name *' : 
                 form.type === 'license' ? 'License Type *' : 
                 form.type === 'employment' ? 'Job Title *' : 
                 'Document Type *'}
              </label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder={
                form.type === 'degree' ? 'e.g. Bachelor of Science in Computer Science' : 
                form.type === 'certificate' ? 'e.g. AWS Solutions Architect Professional' : 
                form.type === 'license' ? 'e.g. Professional Engineer, Medical License' : 
                form.type === 'employment' ? 'e.g. Senior Software Engineer' : 
                'e.g. Passport, Driver License, National ID'
              } className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700" required/></div>
              
              {/* License/ID Number - only for license and identity */}
              {(form.type === 'license' || form.type === 'identity') && (
                <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-2">
                  {form.type === 'license' ? 'License Number *' : 'ID/Document Number *'}
                </label><input value={form.type === 'license' ? form.licenseNumber : form.idNumber} onChange={e=>setForm({...form, [form.type === 'license' ? 'licenseNumber' : 'idNumber']: e.target.value})} placeholder={
                  form.type === 'license' ? 'e.g. PE-12345-2024' : 'e.g. A12345678'
                } className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700 font-mono" required/></div>
              )}
              
              {/* Dates - labels vary by type */}
              <div><label className="block text-sm text-zinc-400 mb-2">
                {form.type === 'degree' ? 'Enrollment Date' : 
                 form.type === 'employment' ? 'Start Date' : 
                 'Issue Date'}
              </label><input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700"/></div>
              <div><label className="block text-sm text-zinc-400 mb-2">
                {form.type === 'degree' ? 'Graduation Date' : 
                 form.type === 'employment' ? 'End Date' : 
                 form.type === 'certificate' || form.type === 'license' || form.type === 'identity' ? 'Expiration Date' : 
                 'End Date'}
              </label><input type="date" value={form.expires} onChange={e=>setForm({...form,expires:e.target.value})} className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700"/></div>
              
              {/* Grade - only for degree and certificate */}
              {(form.type === 'degree' || form.type === 'certificate') && (
                <div className={form.type === 'degree' ? '' : 'col-span-2'}><label className="block text-sm text-zinc-400 mb-2">
                  {form.type === 'degree' ? 'GPA/Grade' : 'Score/Result'}
                </label><input value={form.grade} onChange={e=>setForm({...form,grade:e.target.value})} placeholder={
                  form.type === 'degree' ? 'e.g. 3.8 GPA, First Class Honours' : 'e.g. Pass, 95%, Distinction'
                } className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700"/></div>
              )}
              
              {/* Major/Skills - only for degree and certificate */}
              {form.type === 'degree' && (
                <div><label className="block text-sm text-zinc-400 mb-2">Major/Field</label><input value={form.skills} onChange={e=>setForm({...form,skills:e.target.value})} placeholder="e.g. Computer Science, Engineering" className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700"/></div>
              )}
              {form.type === 'certificate' && (
                <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-2">Skills Covered</label><input value={form.skills} onChange={e=>setForm({...form,skills:e.target.value})} placeholder="e.g. AWS, Cloud Architecture, EC2, S3" className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700"/></div>
              )}
              
              <div className="col-span-2"><label className="block text-sm text-zinc-400 mb-2">Description</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Additional details about the credential..." rows={2} className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700"/></div>
              <div className="col-span-2"><button disabled={loading} className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl font-medium disabled:opacity-50 text-lg">{loading ? 'Issuing...' : '📝 Issue Credential'}</button></div>
            </div>
          </form>
          <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800"><h4 className="font-medium mb-3">Quick Templates</h4><div className="space-y-2">{[
            {t:'degree',n:'BSc Computer Science',i:'MIT',g:'3.8 GPA',s:'Python, Algorithms, Data Structures',d:'Bachelor of Science degree in Computer Science with focus on software engineering'},
            {t:'certificate',n:'AWS Solutions Architect',i:'Amazon Web Services',g:'Pass',s:'AWS, Cloud Architecture, EC2, S3, Lambda',d:'Professional certification for designing distributed systems on AWS'},
            {t:'license',n:'Professional Engineer',i:'State Board of Engineering',g:'Licensed',s:'Civil Engineering, Structural Analysis',d:'Licensed Professional Engineer authorized to practice engineering'}
          ].map((q,i)=><button key={i} onClick={()=>setForm({...form,type:q.t,title:q.n,institution:q.i,grade:q.g,skills:q.s,description:q.d})} className="w-full p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-left text-sm">{q.n}</button>)}</div></div>
        </div>
      )}
      {view === 'batch' && (<div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800"><h3 className="text-lg font-semibold mb-4">Batch Issue</h3><textarea value={csv} onChange={e=>setCsv(e.target.value)} rows={8} placeholder="holder,type,title,institution&#10;02abc...,degree,BSc CS,MIT" className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700 font-mono text-xs mb-4"/><div className="flex gap-3"><button onClick={parseCSV} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl">Preview</button><button onClick={issueBatch} disabled={preview.length===0} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl disabled:opacity-50">Issue All</button></div></div><div className="p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800"><h3 className="text-lg font-semibold mb-4">Preview ({preview.length})</h3>{preview.length > 0 ? <div className="space-y-2 max-h-60 overflow-y-auto">{preview.map((p,i)=><div key={i} className="p-3 bg-zinc-800 rounded-lg text-sm">{p.title} • {p.institution}</div>)}</div> : <div className="text-center py-12 text-zinc-500">Paste CSV and click Preview</div>}</div></div>)}
      {view === 'history' && (
        <div className="p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800">
          <h3 className="text-lg font-semibold mb-4">Issued Credentials ({myIssued.length})</h3>
          {myIssued.length > 0 ? (
            <div className="space-y-3">
              {myIssued.slice().reverse().map(c=>(
                <div key={c.id} className="p-4 bg-zinc-800/50 rounded-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="font-medium truncate">{c.title}</div>
                    <div className="flex items-center gap-2">
                      {c.onChain && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">⛓️ On-chain</span>}
                      <span className={`px-2 py-1 rounded text-xs ${c.revoked?'bg-red-500/20 text-red-400':'bg-green-500/20 text-green-400'}`}>{c.revoked?'Revoked':'Valid'}</span>
                    </div>
                  </div>
                  <div className="text-sm text-zinc-500 mb-2">{c.institution} • <span className="font-mono text-xs">{c.id}</span></div>
                  <div className="text-xs text-zinc-400 mb-1">Issued: {new Date(c.issuedAt).toLocaleDateString()}</div>
                  {c.txHash && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-zinc-600">TX:</span>
                      {c.txHash.startsWith('0x') ? (
                        <span className="text-xs font-mono text-zinc-500">{c.txHash.slice(0,20)}...</span>
                      ) : (
                        <a href={`https://testnet.cspr.live/deploy/${c.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-blue-400 hover:text-blue-300 truncate">{c.txHash.slice(0,20)}... ↗</a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <div className="text-center py-12 text-zinc-500">No credentials issued yet</div>}
        </div>
      )}
    </div>
  )
}


function VerifierPortal({ credentials, setToast }: { credentials:Credential[], setToast:(t:any)=>void }) {
  const [id, setId] = useState('')
  const [result, setResult] = useState<Credential|null>(null)
  const [loading, setLoading] = useState(false)
  const certRef = useRef<HTMLDivElement>(null)
  const contractReady = isContractConfigured()

  const verify = async (e: React.FormEvent) => { 
    e.preventDefault()
    setLoading(true)
    setResult(null)
    
    // First check local storage
    let found = credentials.find(c => c.id === id || c.id.toLowerCase() === id.toLowerCase())
    
    // If it's a numeric ID, try on-chain verification
    if (!found && contractReady && /^\d+$/.test(id)) {
      try {
        setToast({t:'ok', m:'Checking blockchain...'})
        const onChainResult = await verifyCredentialOnChain(parseInt(id))
        if (onChainResult) {
          const cred: Credential = {
            id: onChainResult.credential.id,
            issuer: onChainResult.credential.issuer,
            holder: onChainResult.credential.holder,
            type: onChainResult.credential.credType,
            title: onChainResult.credential.title,
            institution: onChainResult.credential.institution,
            issuedAt: onChainResult.credential.issuedAt,
            expiresAt: onChainResult.credential.expiresAt,
            revoked: onChainResult.credential.revoked,
            onChain: true
          }
          setResult(cred)
          setLoading(false)
          return
        }
      } catch (err) {
        console.error('On-chain verify failed:', err)
      }
    }
    
    if (found) {
      setResult(found)
    } else {
      setToast({t:'err', m:'Credential not found'})
    }
    setLoading(false)
  }

  const exportPDF = async () => { if (!certRef.current || !result) return; const canvas = await html2canvas(certRef.current, { backgroundColor: '#0a0a0f' }); const pdf = new jsPDF('l', 'mm', 'a4'); pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, 277, 150); pdf.save(`credential-${result.id}.pdf`) }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div><form onSubmit={verify} className="p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800"><h3 className="text-lg font-semibold mb-6">Verify Credential</h3><div className="space-y-4"><div><label className="block text-sm text-zinc-400 mb-2">Credential ID (numeric)</label><input value={id} onChange={e=>setId(e.target.value)} placeholder="0, 1, 2..." className="w-full px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700 font-mono" required/></div><button disabled={loading} className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl font-medium disabled:opacity-50">{loading ? 'Verifying...' : '✓ Verify On-Chain'}</button></div></form><div className="mt-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800"><div className="text-sm text-zinc-400 mb-2">Enter numeric credential ID to verify on-chain</div><div className="flex flex-wrap gap-2">{[0,1,2,3,4].map(i=><button key={i} onClick={()=>setId(i.toString())} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm font-mono">{i}</button>)}</div></div>{credentials.length > 0 && (<div className="mt-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800"><div className="text-sm text-zinc-400 mb-2">Your issued credentials:</div><div className="flex flex-wrap gap-2">{credentials.slice(-5).map(c=><button key={c.id} onClick={()=>setId(c.chainId?.toString() || c.id)} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-mono">{c.chainId ?? c.id}</button>)}</div></div>)}</div>
          <div>{result ? (<div ref={certRef} className={`p-6 rounded-2xl border ${!result.revoked?'bg-green-950/30 border-green-800/50':'bg-red-950/30 border-red-800/50'}`}><div className="flex items-center justify-between mb-6"><div className="flex items-center gap-4"><div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl ${!result.revoked?'bg-green-500/20':'bg-red-500/20'}`}>{!result.revoked?'✓':'✗'}</div><div><div className="text-xl font-bold">{!result.revoked?'Valid':'Revoked'}</div><div className="text-sm text-zinc-400">Verified on Casper</div></div></div><QRCodeSVG value={`${window.location.origin}?id=${result.id}`} size={70} bgColor="transparent" fgColor="#fff"/></div><div className="grid grid-cols-2 gap-3 mb-4"><div className="p-3 bg-zinc-900/50 rounded-lg"><div className="text-xs text-zinc-500">Title</div><div className="font-medium text-sm">{result.title}</div></div><div className="p-3 bg-zinc-900/50 rounded-lg"><div className="text-xs text-zinc-500">Institution</div><div className="font-medium text-sm">{result.institution}</div></div><div className="p-3 bg-zinc-900/50 rounded-lg"><div className="text-xs text-zinc-500">Type</div><div className="font-medium text-sm capitalize">{result.type}</div></div><div className="p-3 bg-zinc-900/50 rounded-lg"><div className="text-xs text-zinc-500">Issued</div><div className="font-medium text-sm">{new Date(result.issuedAt).toLocaleDateString()}</div></div></div><div className="p-3 bg-zinc-900/50 rounded-lg mb-3"><div className="text-xs text-zinc-500">Credential ID</div><code className="text-sm">{result.id}</code></div>{result.txHash && <div className="p-3 bg-zinc-900/50 rounded-lg mb-3"><div className="text-xs text-zinc-500">Transaction Hash ↗</div><a href={`https://testnet.cspr.live/deploy/${result.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 font-mono break-all">{result.txHash}</a></div>}{result.signature && <div className="p-3 bg-zinc-900/50 rounded-lg mb-4"><div className="text-xs text-zinc-500">Signature</div><code className="text-xs text-zinc-400 break-all">{result.signature}</code></div>}<div className="flex gap-3"><button onClick={exportPDF} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">📄 Export PDF</button><button onClick={()=>{navigator.clipboard.writeText(result.id);setToast({t:'ok',m:'Copied'})}} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">📋 Copy ID</button></div></div>) : (<div className="h-full min-h-[300px] flex items-center justify-center bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800"><div className="text-center text-zinc-500"><div className="text-5xl mb-4">🔍</div><div>Enter credential ID to verify</div></div></div>)}</div>
        </div>
    </div>
  )
}

// Extended credential with IPFS metadata
interface CredentialWithMeta extends Credential {
  metadataHash?: string
  holderName?: string
  description?: string
  imageUrl?: string
  grade?: string
  skills?: string
  licenseNumber?: string
}

function HolderPortal({ pubKey, credentials, setToast }: { pubKey:string, credentials:Credential[], setToast:(t:any)=>void }) {
  const [selected, setSelected] = useState<CredentialWithMeta|null>(null)
  const [chainCreds, setChainCreds] = useState<OnChainCredential[]>([])
  const [ipfsData, setIpfsData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const certRef = useRef<HTMLDivElement>(null)
  const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/'
  
  // Fetch credentials from chain
  const fetchCredentials = async () => {
    if (!pubKey || !isContractConfigured()) return
    setLoading(true)
    try {
      const creds = await getCredentialsByHolder(pubKey)
      console.log('Fetched chain credentials:', creds)
      setChainCreds(creds)
      // Fetch IPFS metadata for each credential
      creds.forEach(c => {
        if (c.metadataHash && !c.metadataHash.startsWith('Qm0')) {
          fetch(`${IPFS_GATEWAY}${c.metadataHash}`)
            .then(r => r.json())
            .then(data => setIpfsData(prev => ({ ...prev, [c.id]: data })))
            .catch(() => {})
        }
      })
      setToast({t:'ok', m:`Found ${creds.length} credential(s) on-chain`})
    } catch (e) {
      console.error('Failed to fetch chain creds:', e)
      setToast({t:'err', m:'Failed to fetch credentials'})
    } finally {
      setLoading(false)
    }
  }
  
  // Fetch on mount
  useEffect(() => {
    if (pubKey && isContractConfigured()) {
      fetchCredentials()
    }
  }, [pubKey])
  
  // Convert chain credentials to local format with IPFS data
  const localCreds = credentials.filter(c => c.holder === pubKey)
  const chainCredsAsLocal: CredentialWithMeta[] = chainCreds.map(c => {
    const meta = ipfsData[c.id] || {}
    return {
      id: c.id,
      issuer: c.issuer,
      holder: c.holder,
      type: c.credType,
      title: meta.title || c.title,
      institution: meta.institution || c.institution,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      revoked: c.revoked,
      onChain: true,
      metadataHash: c.metadataHash,
      holderName: meta.holderName,
      description: meta.description,
      imageUrl: meta.imageUrl,
      grade: meta.grade,
      skills: meta.skills,
      licenseNumber: meta.licenseNumber
    }
  })
  
  // Merge and dedupe
  const allCreds: CredentialWithMeta[] = [...localCreds]
  chainCredsAsLocal.forEach(cc => {
    if (!allCreds.find(lc => lc.id === cc.id)) allCreds.push(cc)
  })
  const myCreds = allCreds

  const exportPDF = async (cred: CredentialWithMeta) => { 
    setSelected(cred)
    await new Promise(r=>setTimeout(r,200))
    if (!certRef.current) return
    const canvas = await html2canvas(certRef.current, { backgroundColor: '#0a0a0f', scale: 2 })
    const pdf = new jsPDF('l', 'mm', 'a4')
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, 277, 150)
    pdf.save(`credential-${cred.id}.pdf`)
    setToast({t:'ok', m:'PDF exported'})
  }

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'degree': return '🎓'
      case 'certificate': return '📜'
      case 'license': return '📋'
      case 'employment': return '💼'
      case 'identity': return '🪪'
      default: return '📄'
    }
  }

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'degree': return 'from-purple-500/20 to-purple-900/20 border-purple-500/30'
      case 'certificate': return 'from-blue-500/20 to-blue-900/20 border-blue-500/30'
      case 'license': return 'from-amber-500/20 to-amber-900/20 border-amber-500/30'
      case 'employment': return 'from-green-500/20 to-green-900/20 border-green-500/30'
      case 'identity': return 'from-cyan-500/20 to-cyan-900/20 border-cyan-500/30'
      default: return 'from-zinc-500/20 to-zinc-900/20 border-zinc-500/30'
    }
  }

  if (!pubKey) return (
    <div className="text-center py-20">
      <div className="w-24 h-24 bg-gradient-to-br from-green-500/20 to-emerald-900/20 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-6 border border-green-500/30">👤</div>
      <h2 className="text-3xl font-bold mb-4">My Credentials</h2>
      <p className="text-zinc-400 mb-8 max-w-md mx-auto">Connect your wallet to view credentials issued to your address on the Casper blockchain</p>
    </div>
  )

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="bg-gradient-to-r from-green-950/50 to-emerald-950/30 rounded-2xl p-6 border border-green-900/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold mb-1">My Credentials</h2>
            <p className="text-zinc-400 text-sm">Verifiable credentials issued to your wallet</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={fetchCredentials} 
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-xl font-medium transition flex items-center gap-2"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <div className="text-center px-4 py-2 bg-zinc-900/50 rounded-xl">
              <div className="text-2xl font-bold text-green-400">{myCreds.length}</div>
              <div className="text-xs text-zinc-500">Total</div>
            </div>
            <div className="text-center px-4 py-2 bg-zinc-900/50 rounded-xl">
              <div className="text-2xl font-bold text-emerald-400">{myCreds.filter(c => !c.revoked).length}</div>
              <div className="text-xs text-zinc-500">Active</div>
            </div>
            <div className="text-center px-4 py-2 bg-zinc-900/50 rounded-xl">
              <div className="text-2xl font-bold text-purple-400">{chainCreds.length}</div>
              <div className="text-xs text-zinc-500">On-Chain</div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-16 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
          <div className="w-16 h-16 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-xl font-semibold mb-2">Loading Credentials</h3>
          <p className="text-zinc-400">Querying Casper blockchain...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && myCreds.length === 0 && (
        <div className="text-center py-16 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
          <div className="text-6xl mb-4">📭</div>
          <h3 className="text-xl font-semibold mb-2">No Credentials Yet</h3>
          <p className="text-zinc-400 mb-4">Credentials issued to your address will appear here</p>
          <code className="text-xs text-zinc-600 bg-zinc-800 px-3 py-1 rounded">{pubKey.slice(0,16)}...{pubKey.slice(-8)}</code>
        </div>
      )}

      {/* Credentials Grid */}
      {!loading && myCreds.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {myCreds.map(c => (
            <div key={c.id} className={`relative overflow-hidden bg-gradient-to-br ${getTypeColor(c.type)} rounded-2xl border p-5 hover:scale-[1.02] transition-all duration-200 cursor-pointer group`} onClick={() => setSelected(c)}>
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-32 h-32 opacity-5 text-8xl pointer-events-none">{getTypeIcon(c.type)}</div>
              
              {/* Header */}
              <div className="flex items-start justify-between mb-4 relative">
                <div className="w-14 h-14 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center text-2xl shadow-lg">
                  {getTypeIcon(c.type)}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${c.revoked ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                    {c.revoked ? '✗ Revoked' : '✓ Valid'}
                  </span>
                  {c.onChain && <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded border border-purple-500/30">⛓ On-Chain</span>}
                </div>
              </div>

              {/* Content */}
              <div className="relative">
                {c.holderName && <div className="text-xs text-zinc-400 mb-1">Issued to: {c.holderName}</div>}
                <h3 className="font-bold text-lg mb-1 line-clamp-2">{c.title}</h3>
                <p className="text-sm text-zinc-400 mb-3">{c.institution}</p>
                
                {/* Extra Info */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-2 py-1 bg-zinc-800/50 rounded text-xs capitalize">{c.type}</span>
                  {c.grade && <span className="px-2 py-1 bg-zinc-800/50 rounded text-xs">{c.grade}</span>}
                  {c.licenseNumber && <span className="px-2 py-1 bg-zinc-800/50 rounded text-xs font-mono">#{c.licenseNumber}</span>}
                </div>

                {/* Date */}
                <div className="text-xs text-zinc-500">
                  Issued {new Date(c.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {c.expiresAt > 0 && ` • Expires ${new Date(c.expiresAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                </div>
              </div>

              {/* Hover Actions */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-2">
                  <button className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs backdrop-blur">View Details</button>
                  <button onClick={(e) => { e.stopPropagation(); exportPDF(c) }} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs backdrop-blur">Export PDF</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div ref={certRef} onClick={e => e.stopPropagation()} className={`bg-gradient-to-br ${getTypeColor(selected.type)} rounded-3xl p-8 max-w-2xl w-full border shadow-2xl max-h-[90vh] overflow-y-auto`}>
            {/* Certificate Header */}
            <div className="text-center mb-6 pb-6 border-b border-white/10">
              <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg">
                {getTypeIcon(selected.type)}
              </div>
              <div className="text-xs uppercase tracking-widest text-zinc-400 mb-2">Certificate of {selected.type}</div>
              <h2 className="text-2xl font-bold mb-2">{selected.title}</h2>
              <p className="text-zinc-400">{selected.institution}</p>
            </div>

            {/* Holder Info */}
            {selected.holderName && (
              <div className="text-center mb-6">
                <div className="text-xs text-zinc-500 mb-1">This credential is issued to</div>
                <div className="text-xl font-semibold">{selected.holderName}</div>
              </div>
            )}

            {/* Description */}
            {selected.description && (
              <div className="mb-6 p-4 bg-zinc-900/50 rounded-xl">
                <p className="text-sm text-zinc-300">{selected.description}</p>
              </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-4 bg-zinc-900/50 rounded-xl">
                <div className="text-xs text-zinc-500 mb-1">Status</div>
                <div className={`font-semibold ${selected.revoked ? 'text-red-400' : 'text-green-400'}`}>
                  {selected.revoked ? '✗ Revoked' : '✓ Valid'}
                </div>
              </div>
              <div className="p-4 bg-zinc-900/50 rounded-xl">
                <div className="text-xs text-zinc-500 mb-1">Type</div>
                <div className="font-semibold capitalize">{selected.type}</div>
              </div>
              <div className="p-4 bg-zinc-900/50 rounded-xl">
                <div className="text-xs text-zinc-500 mb-1">Issue Date</div>
                <div className="font-semibold">{new Date(selected.issuedAt).toLocaleDateString()}</div>
              </div>
              <div className="p-4 bg-zinc-900/50 rounded-xl">
                <div className="text-xs text-zinc-500 mb-1">Expiration</div>
                <div className="font-semibold">{selected.expiresAt ? new Date(selected.expiresAt).toLocaleDateString() : 'Never'}</div>
              </div>
              {selected.grade && (
                <div className="p-4 bg-zinc-900/50 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1">Grade/Status</div>
                  <div className="font-semibold">{selected.grade}</div>
                </div>
              )}
              {selected.licenseNumber && (
                <div className="p-4 bg-zinc-900/50 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1">License Number</div>
                  <div className="font-semibold font-mono">{selected.licenseNumber}</div>
                </div>
              )}
              {selected.skills && (
                <div className="p-4 bg-zinc-900/50 rounded-xl col-span-2">
                  <div className="text-xs text-zinc-500 mb-1">Skills/Specialization</div>
                  <div className="font-semibold">{selected.skills}</div>
                </div>
              )}
            </div>

            {/* Blockchain Info */}
            <div className="space-y-3 mb-6">
              <div className="p-4 bg-zinc-900/50 rounded-xl">
                <div className="text-xs text-zinc-500 mb-1">Credential ID</div>
                <code className="text-sm text-zinc-300">{selected.id}</code>
              </div>
              {selected.metadataHash && (
                <div className="p-4 bg-zinc-900/50 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1">IPFS Metadata</div>
                  <a href={`${IPFS_GATEWAY}${selected.metadataHash}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 font-mono break-all">
                    {selected.metadataHash}
                  </a>
                </div>
              )}
              {selected.txHash && (
                <div className="p-4 bg-zinc-900/50 rounded-xl">
                  <div className="text-xs text-zinc-500 mb-1">Transaction Hash</div>
                  <a href={`https://testnet.cspr.live/deploy/${selected.txHash}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 font-mono break-all">
                    {selected.txHash}
                  </a>
                </div>
              )}
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-white rounded-xl">
                <QRCodeSVG value={`${window.location.origin}/verify?id=${selected.id}`} size={120} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => exportPDF(selected)} className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-medium transition">
                📄 Export PDF
              </button>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/verify?id=${selected.id}`); setToast({t:'ok', m:'Link copied'}) }} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium transition">
                🔗 Share Link
              </button>
              <button onClick={() => setSelected(null)} className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium transition">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
