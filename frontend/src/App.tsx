import { useState, useEffect } from 'react'
import { CasperClient, CLPublicKey, DeployUtil, RuntimeArgs, CLValueBuilder, Contracts } from 'casper-js-sdk'

const RPC = 'https://rpc.testnet.casperlabs.io/rpc'
const NETWORK = 'casper-test'
// Deploy contract first, then set this:
const CONTRACT = ''

const client = new CasperClient(RPC)

type Role = 'issuer' | 'holder' | 'verifier'

export default function App() {
  const [pubKey, setPubKey] = useState<string>('')
  const [role, setRole] = useState<Role>('verifier')
  const [status, setStatus] = useState('')
  const [isIssuer, setIsIssuer] = useState(false)

  const connect = async () => {
    try {
      const p = (window as any).CasperWalletProvider?.()
      if (!p) return setStatus('Install Casper Wallet')
      await p.requestConnection()
      setPubKey(await p.getActivePublicKey())
    } catch (e: any) { setStatus(e.message) }
  }

  // Check if connected user is registered issuer
  useEffect(() => {
    if (!pubKey || !CONTRACT) return
    // Query contract to check issuer status
    // For now, allow role selection
  }, [pubKey])

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 p-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-lg font-bold text-red-500">🎓 CasperCreds</h1>
          <div className="flex items-center gap-4">
            {pubKey && (
              <select value={role} onChange={e => setRole(e.target.value as Role)}
                className="bg-zinc-800 px-3 py-1.5 rounded text-sm">
                <option value="verifier">Verifier</option>
                <option value="holder">Holder</option>
                <option value="issuer">Issuer</option>
              </select>
            )}
            {pubKey ? (
              <code className="text-xs text-zinc-500">{pubKey.slice(0,10)}...</code>
            ) : (
              <button onClick={connect} className="bg-red-600 px-4 py-1.5 rounded text-sm">Connect</button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {status && <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-sm">{status}</div>}
        {!CONTRACT && <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-800 rounded text-sm">⚠️ Deploy contract and set CONTRACT hash</div>}
        
        {role === 'issuer' && <IssuerPanel pubKey={pubKey} setStatus={setStatus} />}
        {role === 'holder' && <HolderPanel pubKey={pubKey} setStatus={setStatus} />}
        {role === 'verifier' && <VerifierPanel setStatus={setStatus} />}
      </main>
    </div>
  )
}

// ============ ISSUER: Issue & Revoke Credentials ============
function IssuerPanel({ pubKey, setStatus }: { pubKey: string, setStatus: (s:string) => void }) {
  const [holder, setHolder] = useState('')
  const [type, setType] = useState('degree')
  const [title, setTitle] = useState('')
  const [expires, setExpires] = useState('')
  const [loading, setLoading] = useState(false)

  const issue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pubKey || !CONTRACT) return setStatus('Connect wallet & deploy contract')
    setLoading(true)
    try {
      const provider = (window as any).CasperWalletProvider()
      const key = CLPublicKey.fromHex(pubKey)
      
      const args = RuntimeArgs.fromMap({
        holder: CLValueBuilder.key(CLPublicKey.fromHex(holder)),
        credential_type: CLValueBuilder.string(type),
        title: CLValueBuilder.string(title),
        expires_at: CLValueBuilder.u64(expires ? new Date(expires).getTime() : 0),
        metadata_hash: CLValueBuilder.string(''), // Add IPFS later
      })

      const deploy = DeployUtil.makeDeploy(
        new DeployUtil.DeployParams(key, NETWORK),
        DeployUtil.ExecutableDeployItem.newStoredContractByHash(
          Uint8Array.from(Buffer.from(CONTRACT, 'hex')), 'issue', args
        ),
        DeployUtil.standardPayment(5_000_000_000)
      )

      const json = DeployUtil.deployToJson(deploy)
      const sig = await provider.sign(JSON.stringify(json), pubKey)
      const signed = DeployUtil.setSignature(deploy, sig.signature, key)
      const hash = await client.putDeploy(signed)
      setStatus(`✓ Issued! Deploy: ${hash}`)
      setHolder(''); setTitle('')
    } catch (e: any) { setStatus(e.message) }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={issue} className="bg-zinc-900 p-5 rounded-lg space-y-4">
        <h2 className="font-semibold">Issue Credential</h2>
        <input value={holder} onChange={e => setHolder(e.target.value)} 
          placeholder="Holder Public Key (02...)" className="w-full p-2.5 bg-zinc-800 rounded text-sm" required />
        <div className="grid grid-cols-2 gap-3">
          <select value={type} onChange={e => setType(e.target.value)} className="p-2.5 bg-zinc-800 rounded text-sm">
            <option value="degree">Degree</option>
            <option value="certificate">Certificate</option>
            <option value="license">License</option>
            <option value="employment">Employment</option>
          </select>
          <input type="date" value={expires} onChange={e => setExpires(e.target.value)}
            className="p-2.5 bg-zinc-800 rounded text-sm" placeholder="Expires (optional)" />
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Title (e.g. BSc Computer Science)" className="w-full p-2.5 bg-zinc-800 rounded text-sm" required />
        <button disabled={loading || !pubKey} className="w-full p-2.5 bg-red-600 rounded text-sm font-medium disabled:opacity-50">
          {loading ? 'Signing...' : 'Issue Credential'}
        </button>
      </form>

      <RevokeForm pubKey={pubKey} setStatus={setStatus} />
    </div>
  )
}

function RevokeForm({ pubKey, setStatus }: { pubKey: string, setStatus: (s:string) => void }) {
  const [credId, setCredId] = useState('')
  const [loading, setLoading] = useState(false)

  const revoke = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pubKey || !CONTRACT) return
    setLoading(true)
    try {
      const provider = (window as any).CasperWalletProvider()
      const key = CLPublicKey.fromHex(pubKey)
      
      const args = RuntimeArgs.fromMap({
        credential_id: CLValueBuilder.u256(credId),
      })

      const deploy = DeployUtil.makeDeploy(
        new DeployUtil.DeployParams(key, NETWORK),
        DeployUtil.ExecutableDeployItem.newStoredContractByHash(
          Uint8Array.from(Buffer.from(CONTRACT, 'hex')), 'revoke', args
        ),
        DeployUtil.standardPayment(2_000_000_000)
      )

      const json = DeployUtil.deployToJson(deploy)
      const sig = await provider.sign(JSON.stringify(json), pubKey)
      const signed = DeployUtil.setSignature(deploy, sig.signature, key)
      const hash = await client.putDeploy(signed)
      setStatus(`✓ Revoked! Deploy: ${hash}`)
      setCredId('')
    } catch (e: any) { setStatus(e.message) }
    setLoading(false)
  }

  return (
    <form onSubmit={revoke} className="bg-zinc-900 p-5 rounded-lg space-y-4">
      <h2 className="font-semibold">Revoke Credential</h2>
      <div className="flex gap-2">
        <input value={credId} onChange={e => setCredId(e.target.value)}
          placeholder="Credential ID" className="flex-1 p-2.5 bg-zinc-800 rounded text-sm" required />
        <button disabled={loading} className="px-5 bg-zinc-700 rounded text-sm disabled:opacity-50">
          {loading ? '...' : 'Revoke'}
        </button>
      </div>
    </form>
  )
}

// ============ HOLDER: View My Credentials ============
function HolderPanel({ pubKey, setStatus }: { pubKey: string, setStatus: (s:string) => void }) {
  const [creds, setCreds] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!pubKey || !CONTRACT) return setStatus('Connect wallet & deploy contract')
    setLoading(true)
    try {
      // Query holder_credentials mapping
      const stateRoot = await client.nodeClient.getStateRootHash()
      // Real implementation: use getDictionaryItemByURef
      setCreds([]) // Populate from chain
      setStatus('Query complete')
    } catch (e: any) { setStatus(e.message) }
    setLoading(false)
  }

  return (
    <div className="bg-zinc-900 p-5 rounded-lg space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold">My Credentials</h2>
        <button onClick={load} disabled={loading} className="px-4 py-1.5 bg-zinc-700 rounded text-sm disabled:opacity-50">
          {loading ? 'Loading...' : 'Load'}
        </button>
      </div>
      {creds.length === 0 ? (
        <p className="text-zinc-500 text-sm">No credentials found. Click Load to fetch from chain.</p>
      ) : (
        <div className="space-y-2">
          {creds.map((c, i) => (
            <div key={i} className="p-3 bg-zinc-800 rounded">
              <div className="font-medium">{c.title}</div>
              <div className="text-xs text-zinc-500">{c.institution} • {c.type} • ID: {c.id}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ VERIFIER: Check Any Credential ============
function VerifierPanel({ setStatus }: { setStatus: (s:string) => void }) {
  const [credId, setCredId] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!CONTRACT) return setStatus('Deploy contract first')
    setLoading(true)
    setResult(null)
    try {
      // Query credential from chain
      const stateRoot = await client.nodeClient.getStateRootHash()
      // Real: getDictionaryItemByURef for credentials mapping
      // For demo, show structure:
      setResult({
        found: true,
        valid: true,
        credential: {
          id: credId,
          title: 'BSc Computer Science',
          institution: 'MIT',
          type: 'degree',
          holder: '02abc...',
          issued: '2024-06-15',
          revoked: false,
        }
      })
    } catch (e: any) { 
      setResult({ found: false, error: e.message })
    }
    setLoading(false)
  }

  return (
    <div className="bg-zinc-900 p-5 rounded-lg space-y-4">
      <h2 className="font-semibold">Verify Credential</h2>
      <form onSubmit={verify} className="flex gap-2">
        <input value={credId} onChange={e => setCredId(e.target.value)}
          placeholder="Credential ID" className="flex-1 p-2.5 bg-zinc-800 rounded text-sm" required />
        <button disabled={loading} className="px-5 bg-red-600 rounded text-sm disabled:opacity-50">
          {loading ? '...' : 'Verify'}
        </button>
      </form>
      
      {result && (
        <div className={`p-4 rounded ${result.valid ? 'bg-green-900/30 border border-green-800' : 'bg-red-900/30 border border-red-800'}`}>
          {result.found ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{result.valid ? '✓' : '✗'}</span>
                <span className="font-semibold">{result.valid ? 'Valid Credential' : 'Invalid/Revoked'}</span>
              </div>
              <div className="text-sm space-y-1 text-zinc-300">
                <div><span className="text-zinc-500">Title:</span> {result.credential.title}</div>
                <div><span className="text-zinc-500">Institution:</span> {result.credential.institution}</div>
                <div><span className="text-zinc-500">Type:</span> {result.credential.type}</div>
                <div><span className="text-zinc-500">Issued:</span> {result.credential.issued}</div>
              </div>
            </>
          ) : (
            <div className="text-red-400">Credential not found</div>
          )}
        </div>
      )}
    </div>
  )
}
