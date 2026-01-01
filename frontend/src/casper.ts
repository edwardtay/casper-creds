/// <reference types="vite/client" />
import { CasperClient, CLPublicKey, DeployUtil, RuntimeArgs, CLValueBuilder, Contracts } from 'casper-js-sdk'

const RPC_URL = import.meta.env.VITE_CASPER_RPC || 'https://node.testnet.casper.network/rpc'
const CONTRACT_HASH = import.meta.env.VITE_CONTRACT_HASH || ''
const CHAIN_NAME = import.meta.env.VITE_CASPER_NETWORK || 'casper-test'

// Use proxy in development to avoid CORS
const getRpcUrl = () => {
  if (import.meta.env.DEV) {
    return '/casper-rpc' // Vite proxy
  }
  // In production (Vercel), use our serverless function proxy
  return '/api/rpc'
}

// Initialize Casper client
const casperClient = new CasperClient(RPC_URL)
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
  status: number // 0=valid, 1=revoked, 2=expired, 3=issuer_inactive
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
    
    // Query the credential directly from contract storage
    const credential = await contractClient.queryContractDictionary(
      'credentials',
      credentialId.toString()
    )
    
    if (!credential) return null

    // Parse the credential data
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
    
    const credential = await contractClient.queryContractDictionary(
      'credentials',
      credentialId.toString()
    )
    
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

// Issue credential (requires wallet signing)
// Supports both CSPR.click SDK and direct Casper Wallet
export async function issueCredential(
  issuerPublicKey: string,
  holderPublicKey: string,
  credentialType: string,
  title: string,
  expiresAt: number,
  metadataHash: string,
  clickRef?: any // Optional CSPR.click SDK reference
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

    const deployJson = DeployUtil.deployToJson(deploy)
    
    // Debug: log clickRef structure
    console.log('clickRef:', clickRef)
    console.log('clickRef type:', typeof clickRef)
    if (clickRef) {
      console.log('clickRef.send:', clickRef.send)
      console.log('clickRef.send type:', typeof clickRef.send)
      console.log('clickRef keys:', Object.keys(clickRef))
    }
    
    // Try CSPR.click SDK if available
    if (clickRef && typeof clickRef.send === 'function') {
      try {
        console.log('Using CSPR.click SDK to send deploy...')
        const result = await clickRef.send(deployJson, issuerPublicKey)
        console.log('CSPR.click result:', result)
        if (result?.cancelled) throw new Error('User cancelled signing')
        if (result?.error) throw new Error(result.error)
        if (result?.deployHash) return { deployHash: result.deployHash }
        if (result?.transactionHash) return { deployHash: result.transactionHash }
        throw new Error('No transaction hash returned from CSPR.click')
      } catch (e: any) {
        console.error('CSPR.click send failed:', e.message)
        // Don't fallback - if user is using CSPR.click, they don't have Casper Wallet
        throw e
      }
    }
    
    // Fallback to direct Casper Wallet extension
    const wallet = (window as any).CasperWalletProvider?.()
    if (!wallet) throw new Error('No wallet available. Install Casper Wallet browser extension.')
    
    console.log('Using Casper Wallet extension...')
    const signResult = await wallet.signDeploy(deployJson, issuerPublicKey)
    
    if (signResult.cancelled) throw new Error('User cancelled signing')
    if (!signResult.deploy) throw new Error('No signed deploy returned')
    
    const signedDeployResult = DeployUtil.deployFromJson(signResult.deploy)
    if (signedDeployResult.err) throw new Error('Failed to parse signed deploy')
    
    const signedDeploy = signedDeployResult.val
    const result = await casperClient.putDeploy(signedDeploy)
    
    return { deployHash: result }
  } catch (e: any) {
    console.error('Error issuing credential:', e)
    throw e
  }
}

// Revoke credential (requires wallet signing)
// Supports both CSPR.click SDK and direct Casper Wallet
export async function revokeCredential(
  issuerPublicKey: string,
  credentialId: number,
  reason: string,
  clickRef?: any // Optional CSPR.click SDK reference
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

    const deployJson = DeployUtil.deployToJson(deploy)
    
    // Try CSPR.click SDK if available
    if (clickRef && typeof clickRef.send === 'function') {
      try {
        console.log('Using CSPR.click SDK to send revoke...')
        const result = await clickRef.send(deployJson, issuerPublicKey)
        if (result?.cancelled) throw new Error('User cancelled signing')
        if (result?.error) throw new Error(result.error)
        if (result?.deployHash) return { deployHash: result.deployHash }
        if (result?.transactionHash) return { deployHash: result.transactionHash }
        throw new Error('No transaction hash returned from CSPR.click')
      } catch (e: any) {
        console.error('CSPR.click send failed:', e.message)
        throw e
      }
    }
    
    // Fallback to direct Casper Wallet extension
    const wallet = (window as any).CasperWalletProvider?.()
    if (!wallet) throw new Error('No wallet available. Install Casper Wallet browser extension.')
    
    const signResult = await wallet.signDeploy(deployJson, issuerPublicKey)
    
    if (signResult.cancelled) throw new Error('User cancelled signing')
    if (!signResult.deploy) throw new Error('No signed deploy returned')
    
    const signedDeployResult = DeployUtil.deployFromJson(signResult.deploy)
    if (signedDeployResult.err) throw new Error('Failed to parse signed deploy')
    
    const signedDeploy = signedDeployResult.val
    const result = await casperClient.putDeploy(signedDeploy)
    
    return { deployHash: result }
  } catch (e: any) {
    console.error('Error revoking credential:', e)
    throw e
  }
}

// Get chain stats - using proxy in dev to avoid CORS
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

// Check if contract is configured
export function isContractConfigured(): boolean {
  return !!CONTRACT_HASH
}

// Get contract hash
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
    await new Promise(r => setTimeout(r, 5000)) // Check every 5 seconds
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

// Upload metadata to IPFS via Pinata (if configured) or return mock hash
export async function uploadToIPFS(metadata: CredentialMetadata): Promise<string> {
  // If Pinata is configured, use it
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
          pinataMetadata: {
            name: `credential-${metadata.title}-${Date.now()}`
          }
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        return data.IpfsHash // Returns CID like "QmXyz..."
      }
    } catch (e) {
      console.error('Pinata upload failed:', e)
    }
  }
  
  // Fallback: Generate a deterministic hash from metadata (mock IPFS)
  const content = JSON.stringify(metadata)
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i)
    hash = hash & hash
  }
  return `Qm${Math.abs(hash).toString(16).padStart(44, '0')}`
}

// Upload image/file to IPFS via Pinata (privacy-preserving)
export async function uploadImageToIPFS(file: File): Promise<string> {
  if (!PINATA_API_KEY || !PINATA_SECRET) {
    throw new Error('IPFS not configured')
  }
  
  const formData = new FormData()
  formData.append('file', file)
  formData.append('pinataMetadata', JSON.stringify({
    name: `credential-image-${Date.now()}`
  }))
  
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'pinata_api_key': PINATA_API_KEY,
      'pinata_secret_api_key': PINATA_SECRET
    },
    body: formData
  })
  
  if (!response.ok) {
    throw new Error('Failed to upload image to IPFS')
  }
  
  const data = await response.json()
  return data.IpfsHash
}

// Fetch metadata from IPFS
export async function fetchFromIPFS(cid: string): Promise<CredentialMetadata | null> {
  if (!cid || cid.startsWith('Qm0')) return null // Skip mock hashes
  
  try {
    const response = await fetch(`${IPFS_GATEWAY}${cid}`)
    if (response.ok) {
      return await response.json()
    }
  } catch (e) {
    console.error('IPFS fetch failed:', e)
  }
  return null
}

// Check if IPFS is configured (Pinata)
export function isIPFSConfigured(): boolean {
  return !!(PINATA_API_KEY && PINATA_SECRET)
}
