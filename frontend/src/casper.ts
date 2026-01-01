/// <reference types="vite/client" />
import { CasperClient, CLPublicKey, DeployUtil, RuntimeArgs, CLValueBuilder, Contracts } from 'casper-js-sdk'

const CONTRACT_HASH = import.meta.env.VITE_CONTRACT_HASH || ''
const CHAIN_NAME = import.meta.env.VITE_CASPER_NETWORK || 'casper-test'

// Use proxy to avoid CORS
const getRpcUrl = () => {
  if (import.meta.env.DEV) {
    return '/casper-rpc' // Vite proxy
  }
  // In production (Vercel), use our serverless function proxy
  return '/api/rpc'
}

// Initialize Casper client with proxy URL to avoid CORS
const casperClient = new CasperClient(getRpcUrl())
const contractClient = new Contracts.Contract(casperClient)

// Set contract hash if available
if (CONTRACT_HASH) {
  const cleanHash = CONTRACT_HASH.replace('contract-package-', 'hash-')
  contractClient.setContractHash(cleanHash)
}

export interface OnChainCredential {
  id: string
  issuer: string
  holder: string
  credType: string
  title: string
  institution: string
  issuedAt: number
  expiresAt: number
  revoked: boolean
  metadataHash: string
}

export interface VerificationResult {
  isValid: boolean
  status: number
  credential: OnChainCredential
  issuerName: string
  issuerActive: boolean
}


// Get total credentials count from contract
export async function getTotalCredentials(): Promise<number> {
  try {
    if (!CONTRACT_HASH) return 0
    const result = await contractClient.queryContractData(['cred_count'])
    return parseInt(result.toString())
  } catch (e) {
    console.error('Error getting total:', e)
    return 0
  }
}

// Verify credential on-chain
export async function verifyCredentialOnChain(credentialId: number): Promise<VerificationResult | null> {
  try {
    if (!CONTRACT_HASH) return null
    const credential = await contractClient.queryContractDictionary('credentials', credentialId.toString())
    if (!credential) return null
    const data = credential.data as any
    return {
      isValid: !data.revoked && (data.expires_at === 0 || Date.now() < data.expires_at),
      status: data.revoked ? 1 : (data.expires_at > 0 && Date.now() > data.expires_at ? 2 : 0),
      credential: {
        id: credentialId.toString(),
        issuer: data.issuer?.data?.data || '',
        holder: data.holder?.data?.data || '',
        credType: data.cred_type || '',
        title: data.title || '',
        institution: data.institution || '',
        issuedAt: parseInt(data.issued_at || '0'),
        expiresAt: parseInt(data.expires_at || '0'),
        revoked: data.revoked || false,
        metadataHash: data.metadata_hash || ''
      },
      issuerName: data.institution || 'Unknown',
      issuerActive: true
    }
  } catch (e) {
    console.error('Error verifying credential:', e)
    return null
  }
}

// Get credential by ID from contract
export async function getCredentialFromChain(credentialId: number): Promise<OnChainCredential | null> {
  try {
    if (!CONTRACT_HASH) return null
    const credential = await contractClient.queryContractDictionary('credentials', credentialId.toString())
    if (!credential) return null
    const data = credential.data as any
    return {
      id: credentialId.toString(),
      issuer: data.issuer?.data?.data || '',
      holder: data.holder?.data?.data || '',
      credType: data.cred_type || '',
      title: data.title || '',
      institution: data.institution || '',
      issuedAt: parseInt(data.issued_at || '0'),
      expiresAt: parseInt(data.expires_at || '0'),
      revoked: data.revoked || false,
      metadataHash: data.metadata_hash || ''
    }
  } catch (e) {
    console.error('Error getting credential:', e)
    return null
  }
}


// Helper to sign and submit deploy via Casper Wallet
async function signAndSubmitDeploy(deploy: any, publicKey: string): Promise<string> {
  const CasperWalletProvider = (window as any).CasperWalletProvider
  if (!CasperWalletProvider) {
    throw new Error('Casper Wallet extension not found. Please install it from casper.network')
  }
  
  const wallet = CasperWalletProvider()
  const isConnected = await wallet.isConnected()
  if (!isConnected) {
    await wallet.requestConnection()
  }
  
  const deployJson = DeployUtil.deployToJson(deploy)
  
  // The wallet.sign() method signs a message, but for deploys we need to sign the deploy hash
  // Try passing the deploy hash directly instead of the full JSON
  const deployHashBytes = deploy.hash as Uint8Array
  const deployHashHex = Array.from(deployHashBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  
  console.log('Deploy hash to sign:', deployHashHex)
  
  let signResult: any
  
  // Try signDeploy first - it should return the full signed deploy
  if (typeof wallet.signDeploy === 'function') {
    console.log('Using wallet.signDeploy with JSON object')
    try {
      signResult = await wallet.signDeploy(deployJson, publicKey)
      console.log('signDeploy result keys:', Object.keys(signResult || {}))
    } catch (e: any) {
      console.log('signDeploy failed:', e.message)
      // Fall back to sign with deploy hash
      signResult = await wallet.sign(deployHashHex, publicKey)
    }
  } else {
    // Sign the deploy hash, not the full JSON
    console.log('Using wallet.sign with deploy hash')
    signResult = await wallet.sign(deployHashHex, publicKey)
  }
  
  console.log('Sign result keys:', Object.keys(signResult || {}))
  
  if (signResult.cancelled) throw new Error('User cancelled signing')
  
  let signedDeploy: any
  
  if (signResult.deploy) {
    // Wallet returned signed deploy directly
    console.log('Using signResult.deploy')
    const signedDeployJson = typeof signResult.deploy === 'string' 
      ? JSON.parse(signResult.deploy) 
      : signResult.deploy
    const result = DeployUtil.deployFromJson(signedDeployJson)
    if (result.err) throw new Error('Failed to parse signed deploy: ' + result.err)
    signedDeploy = result.val
  } else if (signResult.signatureHex || signResult.signature) {
    // Wallet returned signature - prefer signatureHex (string) over signature (object)
    let sigHex: string
    
    if (signResult.signatureHex && typeof signResult.signatureHex === 'string') {
      console.log('Using signResult.signatureHex')
      sigHex = signResult.signatureHex.startsWith('0x') 
        ? signResult.signatureHex.slice(2) 
        : signResult.signatureHex
    } else {
      console.log('Using signResult.signature, type:', typeof signResult.signature)
      const sig = signResult.signature
      if (typeof sig === 'string') {
        sigHex = sig.startsWith('0x') ? sig.slice(2) : sig
      } else if (sig instanceof Uint8Array) {
        sigHex = Array.from(sig).map((b: number) => b.toString(16).padStart(2, '0')).join('')
      } else if (Array.isArray(sig)) {
        sigHex = sig.map((b: number) => b.toString(16).padStart(2, '0')).join('')
      } else {
        throw new Error('Unknown signature format: ' + typeof sig)
      }
    }
    
    console.log('Signature hex (first 20 chars):', sigHex.substring(0, 20))
    console.log('Signature hex length:', sigHex.length)
    
    // Ed25519 signatures need 01 prefix
    let fullSigHex = sigHex
    if (sigHex.length === 128) {
      fullSigHex = '01' + sigHex
    }
    
    // Reconstruct deploy and add approval directly to JSON
    // This avoids SDK serialization issues
    const signedDeployJson = JSON.parse(JSON.stringify(deployJson))
    signedDeployJson.deploy.approvals = [{
      signer: publicKey,
      signature: fullSigHex
    }]
    
    console.log('Added approval to deploy JSON')
    
    const deployResult = DeployUtil.deployFromJson(signedDeployJson)
    if (deployResult.err) throw new Error('Failed to reconstruct signed deploy: ' + deployResult.err)
    signedDeploy = deployResult.val
  } else {
    throw new Error('Wallet returned no signature or deploy. Keys: ' + Object.keys(signResult).join(', '))
  }
  
  console.log('Submitting deploy with approvals:', signedDeploy.approvals?.length)
  const deployHash = await casperClient.putDeploy(signedDeploy)
  return deployHash
}

// Issue credential (requires Casper Wallet extension)
export async function issueCredential(
  issuerPublicKey: string,
  holderPublicKey: string,
  credentialType: string,
  title: string,
  expiresAt: number,
  metadataHash: string
): Promise<{ deployHash: string } | null> {
  try {
    if (!CONTRACT_HASH) throw new Error('Contract not configured')
    
    const issuerKey = CLPublicKey.fromHex(issuerPublicKey)
    const holderKey = CLPublicKey.fromHex(holderPublicKey)
    
    const args = RuntimeArgs.fromMap({
      holder: holderKey,
      credential_type: CLValueBuilder.string(credentialType),
      title: CLValueBuilder.string(title),
      expires_at: CLValueBuilder.u64(expiresAt),
      metadata_hash: CLValueBuilder.string(metadataHash)
    })

    const deploy = contractClient.callEntrypoint(
      'issue',
      args,
      issuerKey,
      CHAIN_NAME,
      '5000000000' // 5 CSPR gas
    )

    const deployHash = await signAndSubmitDeploy(deploy, issuerPublicKey)
    return { deployHash }
  } catch (e: any) {
    console.error('Error issuing credential:', e)
    throw e
  }
}

// Revoke credential (requires Casper Wallet extension)
export async function revokeCredential(
  issuerPublicKey: string,
  credentialId: number,
  reason: string
): Promise<{ deployHash: string } | null> {
  try {
    if (!CONTRACT_HASH) throw new Error('Contract not configured')
    
    const issuerKey = CLPublicKey.fromHex(issuerPublicKey)
    
    const args = RuntimeArgs.fromMap({
      id: CLValueBuilder.u256(credentialId),
      reason: CLValueBuilder.string(reason)
    })

    const deploy = contractClient.callEntrypoint(
      'revoke',
      args,
      issuerKey,
      CHAIN_NAME,
      '3000000000' // 3 CSPR gas
    )

    const deployHash = await signAndSubmitDeploy(deploy, issuerPublicKey)
    return { deployHash }
  } catch (e: any) {
    console.error('Error revoking credential:', e)
    throw e
  }
}


// Get chain stats
export async function getChainStats() {
  try {
    const rpcUrl = getRpcUrl()
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'info_get_status',
        params: [],
        id: 1
      })
    })
    const data = await response.json()
    if (data.result) {
      return {
        blockHeight: data.result.last_added_block_info?.height || 0,
        era: data.result.last_added_block_info?.era_id || 0,
        peers: data.result.peers?.length || 0,
        stateRootHash: data.result.last_added_block_info?.state_root_hash || '',
        buildVersion: data.result.build_version || ''
      }
    }
  } catch (e) {
    console.error('Error getting chain stats:', e)
  }
  return null
}

export function isContractConfigured(): boolean {
  return !!CONTRACT_HASH
}

export function getContractHash(): string {
  return CONTRACT_HASH
}

// Wait for deploy to be processed
export async function waitForDeploy(deployHash: string, timeoutMs = 120000): Promise<boolean> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await casperClient.getDeploy(deployHash)
      if (result && result[1]?.execution_results?.length > 0) {
        const execResult = result[1].execution_results[0]
        return execResult.result.Success !== undefined
      }
    } catch (e) {
      // Deploy not found yet, keep waiting
    }
    await new Promise(r => setTimeout(r, 5000))
  }
  return false
}

// ==================== IPFS FUNCTIONS ====================

const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY || ''
const PINATA_SECRET = import.meta.env.VITE_PINATA_SECRET_KEY || ''
const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/'

export interface CredentialMetadata {
  title: string
  type: string
  institution: string
  holder: string
  issuer: string
  issuedAt: number
  startDate?: number
  expiresAt: number
  description?: string
  imageUrl?: string
  holderName?: string
  grade?: string
  skills?: string
  licenseNumber?: string
  idNumber?: string
}

export async function uploadToIPFS(metadata: CredentialMetadata): Promise<string> {
  if (PINATA_API_KEY && PINATA_SECRET) {
    try {
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_SECRET
        },
        body: JSON.stringify({
          pinataContent: metadata,
          pinataMetadata: { name: `credential-${metadata.title}-${Date.now()}` }
        })
      })
      if (response.ok) {
        const data = await response.json()
        return data.IpfsHash
      }
    } catch (e) {
      console.error('Pinata upload failed:', e)
    }
  }
  // Fallback mock hash
  const content = JSON.stringify(metadata)
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i)
    hash = hash & hash
  }
  return `Qm${Math.abs(hash).toString(16).padStart(44, '0')}`
}

export async function uploadImageToIPFS(file: File): Promise<string> {
  if (!PINATA_API_KEY || !PINATA_SECRET) {
    throw new Error('IPFS not configured')
  }
  const formData = new FormData()
  formData.append('file', file)
  formData.append('pinataMetadata', JSON.stringify({ name: `credential-image-${Date.now()}` }))
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'pinata_api_key': PINATA_API_KEY,
      'pinata_secret_api_key': PINATA_SECRET
    },
    body: formData
  })
  if (!response.ok) throw new Error('Failed to upload image to IPFS')
  const data = await response.json()
  return data.IpfsHash
}

export async function fetchFromIPFS(cid: string): Promise<CredentialMetadata | null> {
  if (!cid || cid.startsWith('Qm0')) return null
  try {
    const response = await fetch(`${IPFS_GATEWAY}${cid}`)
    if (response.ok) return await response.json()
  } catch (e) {
    console.error('IPFS fetch failed:', e)
  }
  return null
}

export function isIPFSConfigured(): boolean {
  return !!(PINATA_API_KEY && PINATA_SECRET)
}
