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

// Cache for the actual contract hash (resolved from package)
let resolvedContractHash: string | null = null

// Get current state root hash
async function getStateRootHash(): Promise<string | null> {
  try {
    const rpcUrl = getRpcUrl()
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'chain_get_state_root_hash',
        params: [],
        id: Date.now()
      })
    })
    const data = await response.json()
    return data.result?.state_root_hash || null
  } catch (e) {
    console.error('Error getting state root hash:', e)
    return null
  }
}

// Get the actual contract hash from a contract package
async function getContractHashFromPackage(): Promise<string | null> {
  if (resolvedContractHash) return resolvedContractHash
  if (!CONTRACT_HASH) return null
  
  try {
    const stateRootHash = await getStateRootHash()
    if (!stateRootHash) return null
    
    const rpcUrl = getRpcUrl()
    const packageHash = CONTRACT_HASH.replace('contract-package-', '').replace('hash-', '')
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'state_get_item',
        params: {
          state_root_hash: stateRootHash,
          key: `hash-${packageHash}`,
          path: []
        },
        id: Date.now()
      })
    })
    const data = await response.json()
    
    if (data.result?.stored_value?.ContractPackage) {
      const versions = data.result.stored_value.ContractPackage.versions
      if (versions && versions.length > 0) {
        const latestVersion = versions[versions.length - 1]
        resolvedContractHash = latestVersion.contract_hash
        console.log('Resolved contract hash from package:', resolvedContractHash)
        
        // Set it on the contract client
        if (resolvedContractHash) {
          contractClient.setContractHash(resolvedContractHash)
        }
        return resolvedContractHash
      }
    }
  } catch (e) {
    console.error('Failed to resolve contract hash:', e)
  }
  return null
}

// Initialize contract hash resolution
getContractHashFromPackage()

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

// Get events length from contract's __events_length named key
async function getEventsLength(): Promise<number> {
  try {
    const contractHash = await getContractHashFromPackage()
    if (!contractHash) return 0
    
    const stateRootHash = await getStateRootHash()
    if (!stateRootHash) {
      console.log('Could not get state root hash')
      return 0
    }
    
    const rpcUrl = getRpcUrl()
    
    // First get the contract to find the __events_length URef
    const contractResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'state_get_item',
        params: {
          state_root_hash: stateRootHash,
          key: contractHash,
          path: []
        },
        id: Date.now()
      })
    })
    const contractData = await contractResponse.json()
    console.log('Contract data:', contractData)
    
    // Find __events_length in named_keys
    const namedKeys = contractData.result?.stored_value?.Contract?.named_keys || []
    const eventsLengthKey = namedKeys.find((nk: any) => nk.name === '__events_length')
    if (!eventsLengthKey) {
      console.log('__events_length not found in named keys:', namedKeys.map((k: any) => k.name))
      return 0
    }
    
    // Query the URef directly
    const lengthResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'state_get_item',
        params: {
          state_root_hash: stateRootHash,
          key: eventsLengthKey.key,
          path: []
        },
        id: Date.now()
      })
    })
    const lengthData = await lengthResponse.json()
    console.log('__events_length result:', lengthData)
    
    if (lengthData.result?.stored_value?.CLValue?.parsed !== undefined) {
      return parseInt(lengthData.result.stored_value.CLValue.parsed)
    }
    return 0
  } catch (e) {
    console.error('Error getting events length:', e)
    return 0
  }
}

// Cache for events dictionary URef
let eventsDictURef: string | null = null

// Get the __events dictionary URef from contract
async function getEventsDictURef(): Promise<string | null> {
  if (eventsDictURef) return eventsDictURef
  
  try {
    const contractHash = await getContractHashFromPackage()
    if (!contractHash) return null
    
    const stateRootHash = await getStateRootHash()
    if (!stateRootHash) return null
    
    const rpcUrl = getRpcUrl()
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'state_get_item',
        params: {
          state_root_hash: stateRootHash,
          key: contractHash,
          path: []
        },
        id: Date.now()
      })
    })
    const data = await response.json()
    
    // Find __events in named_keys
    const namedKeys = data.result?.stored_value?.Contract?.named_keys || []
    const eventsKey = namedKeys.find((nk: any) => nk.name === '__events')
    if (eventsKey) {
      console.log('Found __events URef:', eventsKey.key)
      eventsDictURef = eventsKey.key
      return eventsDictURef
    }
    return null
  } catch (e) {
    console.error('Error getting events dict:', e)
    return null
  }
}

// Parse Odra event from raw bytes/data
// Odra uses Casper Event Standard (CES) which stores events as serialized structs
function parseCredentialIssuedEvent(eventData: any): OnChainCredential | null {
  try {
    console.log('Parsing event data:', JSON.stringify(eventData, null, 2))
    
    // The event data is a byte array (List<U8>)
    // Format: [name_length(u32), name_bytes..., event_data...]
    // For CredentialIssued: name = "event_CredentialIssued"
    
    let bytes: number[] = []
    
    if (Array.isArray(eventData)) {
      bytes = eventData
    } else if (typeof eventData === 'string') {
      // Hex string
      for (let i = 0; i < eventData.length; i += 2) {
        bytes.push(parseInt(eventData.substring(i, i + 2), 16))
      }
    } else {
      return null
    }
    
    if (bytes.length < 30) return null
    
    // Read name length (first 4 bytes, little-endian u32)
    const nameLength = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)
    
    // Read event name
    const nameBytes = bytes.slice(4, 4 + nameLength)
    const eventName = String.fromCharCode(...nameBytes)
    console.log('Event name:', eventName, 'length:', nameLength)
    
    // Check if this is a CredentialIssued event
    if (!eventName.includes('CredentialIssued')) {
      console.log('Not a CredentialIssued event, skipping')
      return null
    }
    
    // Parse the event data after the name
    // CredentialIssued { id: U256, issuer: Address, holder: Address, cred_type: String, timestamp: u64 }
    const dataStart = 4 + nameLength
    const dataBytes = bytes.slice(dataStart)
    
    // Parse U256 id (32 bytes, little-endian)
    // For small numbers, just read first few bytes
    let id = 0
    for (let i = 0; i < Math.min(8, dataBytes.length); i++) {
      id += dataBytes[i] * Math.pow(256, i)
    }
    
    // Parse issuer Address (1 byte tag + 32 bytes hash)
    // Tag: 0x00 = Account, 0x01 = Contract
    const issuerStart = 32 // After U256
    const issuerTag = dataBytes[issuerStart]
    const issuerHash = dataBytes.slice(issuerStart + 1, issuerStart + 33)
    const issuerHex = issuerHash.map(b => b.toString(16).padStart(2, '0')).join('')
    const issuer = issuerTag === 0 ? `account-hash-${issuerHex}` : `contract-${issuerHex}`
    
    // Parse holder Address (1 byte tag + 32 bytes hash)
    const holderStart = issuerStart + 33
    const holderTag = dataBytes[holderStart]
    const holderHash = dataBytes.slice(holderStart + 1, holderStart + 33)
    const holderHex = holderHash.map(b => b.toString(16).padStart(2, '0')).join('')
    const holder = holderTag === 0 ? `account-hash-${holderHex}` : `contract-${holderHex}`
    
    // Parse cred_type String (4 byte length + bytes)
    const credTypeStart = holderStart + 33
    const credTypeLen = dataBytes[credTypeStart] | (dataBytes[credTypeStart + 1] << 8) | 
                        (dataBytes[credTypeStart + 2] << 16) | (dataBytes[credTypeStart + 3] << 24)
    const credTypeBytes = dataBytes.slice(credTypeStart + 4, credTypeStart + 4 + credTypeLen)
    const credType = String.fromCharCode(...credTypeBytes)
    
    // Parse timestamp u64 (8 bytes, little-endian)
    const timestampStart = credTypeStart + 4 + credTypeLen
    let timestamp = 0
    for (let i = 0; i < 8 && timestampStart + i < dataBytes.length; i++) {
      timestamp += dataBytes[timestampStart + i] * Math.pow(256, i)
    }
    
    console.log('Parsed event:', { id, issuer, holder, credType, timestamp })
    
    return {
      id: String(id),
      issuer,
      holder,
      credType,
      title: '', // Not in event
      institution: '',
      issuedAt: timestamp,
      expiresAt: 0,
      revoked: false,
      metadataHash: ''
    }
  } catch (e) {
    console.error('Error parsing event:', e)
    return null
  }
}

// Fetch a single event by index from __events dictionary
async function getEventByIndex(dictURef: string, index: number): Promise<any> {
  try {
    const stateRootHash = await getStateRootHash()
    if (!stateRootHash) return null
    
    const rpcUrl = getRpcUrl()
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'state_get_dictionary_item',
        params: {
          state_root_hash: stateRootHash,
          dictionary_identifier: {
            URef: {
              seed_uref: dictURef,
              dictionary_item_key: index.toString()
            }
          }
        },
        id: Date.now()
      })
    })
    const data = await response.json()
    console.log(`Event ${index}:`, data)
    
    if (data.result?.stored_value?.CLValue) {
      return data.result.stored_value.CLValue.parsed || data.result.stored_value.CLValue.bytes
    }
    return null
  } catch (e) {
    console.error(`Error fetching event ${index}:`, e)
    return null
  }
}

// Get all CredentialIssued events from chain
export async function getCredentialEvents(): Promise<OnChainCredential[]> {
  try {
    if (!CONTRACT_HASH) return []
    
    const eventsLength = await getEventsLength()
    console.log('Total events on chain:', eventsLength)
    if (eventsLength === 0) return []
    
    const dictURef = await getEventsDictURef()
    if (!dictURef) {
      console.log('Could not find __events dictionary')
      return []
    }
    
    const credentials: OnChainCredential[] = []
    
    // Fetch events (limit to last 100 for performance)
    const startIdx = Math.max(0, eventsLength - 100)
    for (let i = startIdx; i < eventsLength; i++) {
      const eventData = await getEventByIndex(dictURef, i)
      if (eventData) {
        const cred = parseCredentialIssuedEvent(eventData)
        if (cred) {
          credentials.push(cred)
        }
      }
    }
    
    return credentials
  } catch (e) {
    console.error('Error getting credential events:', e)
    return []
  }
}

// Get total credentials count from events
export async function getTotalCredentials(): Promise<number> {
  try {
    if (!CONTRACT_HASH) return 0
    
    // Count CredentialIssued events
    const eventsLength = await getEventsLength()
    console.log('Total events on chain:', eventsLength)
    
    // For now, return events count as approximation
    // (In production, you'd filter for CredentialIssued events only)
    return eventsLength
  } catch (e) {
    console.error('Error getting total:', e)
    return 0
  }
}

// Verify credential on-chain
export async function verifyCredentialOnChain(credentialId: number): Promise<VerificationResult | null> {
  try {
    if (!CONTRACT_HASH) return null
    
    // Ensure contract hash is resolved
    await getContractHashFromPackage()
    
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
    
    // Ensure contract hash is resolved
    await getContractHashFromPackage()
    
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

// Get all credentials for a holder by querying events
export async function getCredentialsByHolder(holderPublicKey: string): Promise<OnChainCredential[]> {
  try {
    if (!CONTRACT_HASH) return []
    
    // Convert public key to account hash for comparison
    const holderKey = CLPublicKey.fromHex(holderPublicKey)
    const accountHash = holderKey.toAccountHashStr().replace('account-hash-', '').toLowerCase()
    
    console.log('Querying credentials for holder:', accountHash)
    
    // Get all credential events
    const allCreds = await getCredentialEvents()
    console.log('All credential events:', allCreds.length)
    
    // Filter by holder
    const holderCreds = allCreds.filter(cred => {
      const credHolder = cred.holder.replace('account-hash-', '').toLowerCase()
      return credHolder.includes(accountHash) || accountHash.includes(credHolder)
    })
    
    console.log('Credentials for holder:', holderCreds.length)
    return holderCreds
  } catch (e) {
    console.error('Error getting credentials by holder:', e)
    return []
  }
}


// Helper to sign and submit deploy via CSPR.click or Casper Wallet
async function signAndSubmitDeploy(deploy: any, publicKey: string, clickRef?: any): Promise<string> {
  const deployJson = DeployUtil.deployToJson(deploy)

  // Try to get CSPR.click SDK from window if not passed
  const sdk = clickRef || (window as any).csprclick
  console.log('signAndSubmitDeploy - clickRef passed:', !!clickRef, 'window.csprclick:', !!(window as any).csprclick)

  // CSPR.click is the preferred method - it handles signing properly
  if (sdk && typeof sdk.send === 'function') {
    console.log('Using CSPR.click SDK')
    const methods = Object.keys(sdk).filter(k => typeof sdk[k] === 'function')
    console.log('CSPR.click available methods:', methods)

    // Try send() - this is the main method for sending deploys
    console.log('Using CSPR.click send()')
    try {
      // send() expects the deploy JSON object and public key
      // According to SDK types: send(transaction: string | object, signingPublicKey: string)
      const result = await sdk.send(deployJson, publicKey)
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

    // Try sign() to get signed deploy back
    if (typeof sdk.sign === 'function') {
      console.log('Using CSPR.click sign()')
      try {
        const result = await sdk.sign(deployJson, publicKey)
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

    // If we got here, CSPR.click methods didn't return a hash
    throw new Error('CSPR.click signing failed. Please try reconnecting your wallet.')
  }

  // If CSPR.click SDK is available but send() isn't, something is wrong
  if (sdk) {
    console.log('CSPR.click SDK found but send() method missing')
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
  // Log available methods for debugging
  const walletMethods = Object.keys(wallet).filter(k => typeof wallet[k] === 'function')
  console.log('Wallet methods:', walletMethods)

  // Verify Chain Name
  if (deploy.header.chainName !== CHAIN_NAME) {
    console.warn(`Deploy chain name (${deploy.header.chainName}) does not match env (${CHAIN_NAME})`)
  }

  // Clean deploy JSON for signing: remove the outer "deploy" wrapper if present
  const rawDeploy = (deployJson as any).deploy || deployJson
  const deployJsonStr = JSON.stringify(rawDeploy)
  console.log('Signing raw deploy JSON:', deployJsonStr)

  // Use signDeploy if available (preferred for newer wallet), otherwise sign
  let signResult
  if (typeof wallet.signDeploy === 'function') {
    console.log('Calling wallet.signDeploy()')
    signResult = await wallet.signDeploy(deployJsonStr, publicKey)
  } else {
    console.log('Calling wallet.sign()')
    signResult = await wallet.sign(deployJsonStr, publicKey)
  }

  console.log('Sign result keys:', Object.keys(signResult || {}))

  if (signResult.cancelled) throw new Error('User cancelled signing')

  // If wallet returns a signed deploy (legacy behavior or specific wallets)
  if (signResult.deploy) {
    // ... existing logic for signed deploy return ...
    console.log('Wallet returned full deploy, using it.')
    const signedDeployJson = typeof signResult.deploy === 'string'
      ? JSON.parse(signResult.deploy)
      : signResult.deploy

    const deployObj = signedDeployJson.deploy || signedDeployJson
    try {
      const result = DeployUtil.deployFromJson(deployObj)
      if (!result.err) {
        return await casperClient.putDeploy(result.val)
      }
    } catch (e) { console.warn('SDK check failed', e) }

    // RPC Fallback
    const rpcUrl = getRpcUrl()
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'account_put_deploy',
        params: { deploy: deployObj },
        id: Date.now()
      })
    })
    const rpcResult = await rpcResponse.json()
    if (rpcResult.result?.deploy_hash) return rpcResult.result.deploy_hash
    if (rpcResult.error) throw new Error(rpcResult.error.message)
  }

  // If wallet returned only signature (standard behavior for signDeploy)
  if (signResult.signature) {
    console.log('Wallet returned signature. Using direct RPC submission...')

    // Quick hex conversion helper
    const toHex = (data: any) => {
      if (typeof data === 'string') return data;
      return Array.from(new Uint8Array(data))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    let signatureHex = toHex(signResult.signature)
    if (signResult.signatureHex) signatureHex = signResult.signatureHex

    // Ensure signature has the algorithm tag (01 for ed25519, 02 for secp256k1)
    // Wallet usually returns raw 64 bytes (128 hex chars)
    // Node expects 65 bytes (130 hex chars) with tag
    if (signatureHex.length === 128) {
      const tag = publicKey.substring(0, 2)
      console.log(`Adding signature tag ${tag} to raw signature`)
      signatureHex = tag + signatureHex
    }

    console.log('Signature Hex:', signatureHex, 'Length:', signatureHex.length)

    // Prepare valid approval object
    const approval = {
      signer: publicKey,
      signature: signatureHex
    }

    // Convert ORIGINAL deploy to JSON first
    // This gives us a plain JS object we can modify without SDK class errors
    const deployJsonWrapper = DeployUtil.deployToJson(deploy)
    const deployObj = (deployJsonWrapper as any).deploy || deployJsonWrapper

    // Initialize approvals if missing
    if (!deployObj.approvals) deployObj.approvals = []

    // Append our new approval
    // Check for duplicates first
    const exists = deployObj.approvals.some((a: any) => a.signer === publicKey)
    if (!exists) {
      deployObj.approvals.push(approval)
    }

    console.log('Submitting via RPC with approvals:', deployObj.approvals.length)

    // Submit directly to RPC
    // This bypasses SDK's "expected class instance" checks
    const rpcUrl = getRpcUrl()
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'account_put_deploy',
        params: { deploy: deployObj },
        id: Date.now()
      })
    })

    const rpcResult = await rpcResponse.json()
    console.log('RPC Result:', JSON.stringify(rpcResult))

    if (rpcResult.result?.deploy_hash) {
      return rpcResult.result.deploy_hash
    }

    if (rpcResult.error) {
      throw new Error(`RPC Error: ${rpcResult.error.message} (Code: ${rpcResult.error.code})`)
    }

    throw new Error('Unknown RPC response format')
  }

  throw new Error('Wallet signing failed: No signature or deploy returned.')
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
    console.log("DEBUG: Global CONTRACT_HASH value:", CONTRACT_HASH)

    if (!CONTRACT_HASH) throw new Error('Contract not configured')

    const issuerKey = CLPublicKey.fromHex(issuerPublicKey)
    const holderKey = CLPublicKey.fromHex(holderPublicKey)

    // Odra's Address type is a tagged union: 0x00 + account_hash (for accounts)
    // Get the raw account hash (32 bytes)
    const holderAccountHashHex = holderKey.toAccountHashStr().replace('account-hash-', '')
    
    console.log('Holder public key:', holderPublicKey)
    console.log('Holder account hash hex:', holderAccountHashHex)

    // For Odra Address, we need to pass it as Key::Account
    // The casper-js-sdk CLValueBuilder.key() should handle this correctly
    const holderAsKey = CLValueBuilder.key(holderKey)

    const args = RuntimeArgs.fromMap({
      holder: holderAsKey,
      credential_type: CLValueBuilder.string(credentialType),
      title: CLValueBuilder.string(title),
      expires_at: CLValueBuilder.u64(expiresAt),
      metadata_hash: CLValueBuilder.string(metadataHash)
    })

    let session: any;
    const payment = DeployUtil.standardPayment(15000000000) // 15 CSPR to be safe

    // Detect if we are calling a Contract Package (Versioned) or direct Contract
    // Resilience: Check for prefix OR known package hash start (in case env var is stripped)
    const isPackage = CONTRACT_HASH.includes('contract-package-') || CONTRACT_HASH.startsWith('fc4506');

    // Helper for browser-safe hex conversion
    const hexToBytes = (hex: string) => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return bytes;
    }

    if (isPackage) {
      // Remove prefix if present, otherwise assume it's already raw hex
      const packageHashHex = CONTRACT_HASH.replace('contract-package-', '')

      // Use browser-safe conversion
      const packageHash = hexToBytes(packageHashHex)

      // entryPoint, args, packageHash, version (null = latest)
      session = DeployUtil.ExecutableDeployItem.newStoredVersionContractByHash(
        packageHash,
        null,
        'issue',
        args
      )
    } else {
      const contractHashHex = CONTRACT_HASH.replace('hash-', '').replace('contract-', '')

      const contractHash = hexToBytes(contractHashHex)

      session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
        contractHash,
        'issue',
        args
      )
    }

    const deploy = DeployUtil.makeDeploy(
      new DeployUtil.DeployParams(issuerKey, CHAIN_NAME),
      session,
      payment
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
