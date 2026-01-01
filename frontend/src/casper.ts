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


// Helper to sign and submit deploy via CSPR.click or Casper Wallet
async function signAndSubmitDeploy(deploy: any, publicKey: string, clickRef?: any): Promise<string> {
  const deployJson = DeployUtil.deployToJson(deploy)
  
  // CSPR.click is the preferred method - it handles signing properly
  if (clickRef) {
    const methods = Object.keys(clickRef).filter(k => typeof clickRef[k] === 'function')
    console.log('CSPR.click available methods:', methods)
    
    // Try send() - this is the main method for sending deploys
    if (typeof clickRef.send === 'function') {
      console.log('Using CSPR.click send()')
      try {
        // send() expects the deploy JSON object and public key
        // According to SDK types: send(transaction: string | object, signingPublicKey: string)
        const result = await clickRef.send(deployJson, publicKey)
        console.log('CSPR.click send result:', result)
        if (result?.cancelled) throw new Error('User cancelled signing')
        if (result?.error) throw new Error(result.error)
        if (result?.deployHash) return result.deployHash
        if (result?.transactionHash) return result.transactionHash
      } catch (e: any) {
        console.log('CSPR.click send failed:', e.message)
        // If user cancelled, throw immediately
        if (e.message === 'User cancelled signing') throw e
        // Otherwise continue to try other methods
      }
    }
    
    // Try signAndSend()
    if (typeof clickRef.signAndSend === 'function') {
      console.log('Using CSPR.click signAndSend()')
      try {
        const result = await clickRef.signAndSend(deployJson, publicKey)
        console.log('signAndSend result:', result)
        if (result?.cancelled) throw new Error('User cancelled signing')
        if (result?.error) throw new Error(result.error)
        if (result?.deployHash) return result.deployHash
        if (result?.transactionHash) return result.transactionHash
      } catch (e: any) {
        console.log('signAndSend failed:', e.message)
        if (e.message === 'User cancelled signing') throw e
      }
    }
    
    // Try sign() to get signed deploy back
    if (typeof clickRef.sign === 'function') {
      console.log('Using CSPR.click sign()')
      try {
        const result = await clickRef.sign(deployJson, publicKey)
        console.log('CSPR.click sign result:', result)
        if (result?.cancelled) throw new Error('User cancelled signing')
        if (result?.error) throw new Error(result.error)
        if (result?.deploy) {
          // Got signed deploy, submit it
          const signedDeploy = typeof result.deploy === 'string' ? JSON.parse(result.deploy) : result.deploy
          const deployResult = DeployUtil.deployFromJson(signedDeploy)
          if (!deployResult.err) {
            const hash = await casperClient.putDeploy(deployResult.val)
            return hash
          }
        }
        if (result?.deployHash) return result.deployHash
      } catch (e: any) {
        console.log('CSPR.click sign failed:', e.message)
        if (e.message === 'User cancelled signing') throw e
      }
    }
    
    // Try signDeploy()
    if (typeof clickRef.signDeploy === 'function') {
      console.log('Using CSPR.click signDeploy()')
      try {
        const result = await clickRef.signDeploy(deployJson, publicKey)
        console.log('signDeploy result:', result)
        if (result?.cancelled) throw new Error('User cancelled signing')
        if (result?.error) throw new Error(result.error)
        if (result?.deploy) {
          const signedDeployJson = typeof result.deploy === 'string' ? JSON.parse(result.deploy) : result.deploy
          const deployResult = DeployUtil.deployFromJson(signedDeployJson)
          if (!deployResult.err) {
            const hash = await casperClient.putDeploy(deployResult.val)
            return hash
          }
        }
        if (result?.deployHash) return result.deployHash
      } catch (e: any) {
        console.log('signDeploy failed:', e.message)
        if (e.message === 'User cancelled signing') throw e
      }
    }
  }
  
  // If CSPR.click was available but all methods failed, throw error
  if (clickRef) {
    throw new Error('CSPR.click signing failed. Please try reconnecting your wallet.')
  }
  
  // Try Casper Signer (legacy extension) first - it properly signs deploys
  const CasperSigner = (window as any).casperlabsHelper
  if (CasperSigner) {
    console.log('Found Casper Signer (legacy)')
    try {
      const isConnected = await CasperSigner.isConnected()
      if (!isConnected) {
        await CasperSigner.requestConnection()
      }
      // Casper Signer's sign method properly signs the deploy hash
      const signedDeployJson = await CasperSigner.sign(deployJson, publicKey)
      console.log('Casper Signer signed deploy')
      const deployResult = DeployUtil.deployFromJson(signedDeployJson)
      if (!deployResult.err) {
        const hash = await casperClient.putDeploy(deployResult.val)
        return hash
      }
    } catch (e: any) {
      console.log('Casper Signer failed:', e.message)
    }
  }
  
  // Fallback to Casper Wallet extension
  const CasperWalletProvider = (window as any).CasperWalletProvider
  if (!CasperWalletProvider) {
    throw new Error('No wallet available. Please install Casper Wallet or Casper Signer extension.')
  }
  
  const wallet = CasperWalletProvider()
  const isConnected = await wallet.isConnected()
  if (!isConnected) {
    await wallet.requestConnection()
  }
  
  console.log('Using Casper Wallet extension')
  const walletMethods = Object.keys(wallet).filter(k => typeof wallet[k] === 'function')
  console.log('Wallet methods:', walletMethods)
  
  const deployJsonStr = JSON.stringify(deployJson)
  
  // Use wallet.sign() - note: this may not work for deploy signing
  console.log('Calling wallet.sign()')
  const signResult = await wallet.sign(deployJsonStr, publicKey)
  
  console.log('Sign result keys:', Object.keys(signResult || {}))
  
  if (signResult.cancelled) throw new Error('User cancelled signing')
  
  // If wallet returns a signed deploy, use it
  if (signResult.deploy) {
    console.log('Wallet returned signed deploy')
    const signedDeployJson = typeof signResult.deploy === 'string' 
      ? JSON.parse(signResult.deploy) 
      : signResult.deploy
    
    const result = DeployUtil.deployFromJson(signedDeployJson)
    if (!result.err) {
      const hash = await casperClient.putDeploy(result.val)
      return hash
    }
    
    // Try RPC directly
    const rpcUrl = getRpcUrl()
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'account_put_deploy',
        params: { deploy: signedDeployJson.deploy || signedDeployJson },
        id: Date.now()
      })
    })
    const rpcResult = await rpcResponse.json()
    if (rpcResult.result?.deploy_hash) {
      return rpcResult.result.deploy_hash
    }
  }
  
  // Wallet returned only signature - this won't work for deploy signing
  // The Casper Wallet extension signs the JSON string, not the deploy hash
  throw new Error(
    'The Casper Wallet extension does not support transaction signing. ' +
    'Please install the Casper Signer extension or use CSPR.click with Ledger/Torus.'
  )
}

// Issue credential (requires CSPR.click or Casper Wallet extension)
export async function issueCredential(
  issuerPublicKey: string,
  holderPublicKey: string,
  credentialType: string,
  title: string,
  expiresAt: number,
  metadataHash: string,
  clickRef?: any
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

    const deployHash = await signAndSubmitDeploy(deploy, issuerPublicKey, clickRef)
    return { deployHash }
  } catch (e: any) {
    console.error('Error issuing credential:', e)
    throw e
  }
}

// Revoke credential (requires CSPR.click or Casper Wallet extension)
export async function revokeCredential(
  issuerPublicKey: string,
  credentialId: number,
  reason: string,
  clickRef?: any
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

    const deployHash = await signAndSubmitDeploy(deploy, issuerPublicKey, clickRef)
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
