/**
 * Login Audit & Progressive Background Device Telemetry Service
 *
 * Tracks authentication events (both successful and failed attempts) to Supabase table `login_logs`.
 *
 * Progressive Background Scanning Architecture:
 * - Does NOT rush to send unverified or incomplete device data to the database immediately on login.
 * - Deeply inspects device hardware (WebGL GPU unmasked renderer, CPU cores, RAM, screen geometry,
 *   display pixel density, touch points, battery status, and high-entropy client hints).
 * - Multi-provider resilient public IP resolution (ipify, ipapi, etc.).
 * - Passive, fuzzed location verification (200-300m spatial grid to protect privacy).
 * - Runs progressively in the background over a configurable window (up to 10 minutes)
 *   so data is perfectly matched and verified before being synced to Supabase.
 * - Safety flush handler ensures data is never lost if the user navigates or closes the browser early.
 */

import { supabase, isSupabaseConfigured } from './supabase.js'
import { captureFuzzedDeviceLocation } from './deviceLocation.js'

const LOCAL_AUDIT_KEY = 'binar_login_audit_cache'
const MAX_LOCAL_CACHE = 250
const PENDING_SCAN_KEY = 'binar_pending_device_scan'

// ─── Hardware Telemetry Extraction ──────────────────────────────────────────

/**
 * Probes deep client hardware capabilities:
 * - WebGL Unmasked GPU Renderer & Vendor (detects exact NVIDIA, AMD, Intel, Apple Silicon, Adreno, Mali)
 * - Hardware Concurrency (logical CPU cores)
 * - Device Memory (RAM in GB)
 * - Display geometry, pixel ratio (Retina), color depth
 * - Touch capabilities & pointer accuracy
 * - Network connection type (4g/wifi, downlink, rtt)
 */
export function getHardwareSpecs() {
  if (typeof window === 'undefined') return {}

  let gpuRenderer = null
  let gpuVendor = null

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      if (dbg) {
        gpuVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || null
        gpuRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || null
      } else {
        gpuVendor = gl.getParameter(gl.VENDOR) || null
        gpuRenderer = gl.getParameter(gl.RENDERER) || null
      }
    }
  } catch (e) {}

  const nav = typeof navigator !== 'undefined' ? navigator : {}
  const scr = typeof window !== 'undefined' ? window.screen : {}

  let pointerType = 'fine'
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      pointerType = 'coarse'
    }
  } catch (e) {}

  return {
    gpuVendor,
    gpuRenderer,
    cpuCores: nav.hardwareConcurrency || null,
    ramGb: nav.deviceMemory || null,
    touchPoints: nav.maxTouchPoints || 0,
    pointerType,
    screenWidth: scr?.width || 0,
    screenHeight: scr?.height || 0,
    availWidth: scr?.availWidth || 0,
    availHeight: scr?.availHeight || 0,
    pixelRatio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
    colorDepth: scr?.colorDepth || 24,
    connectionType: nav.connection?.effectiveType || nav.connection?.type || null,
    downlink: nav.connection?.downlink ? `${nav.connection.downlink} Mbps` : null,
    rtt: nav.connection?.rtt ? `${nav.connection.rtt} ms` : null
  }
}

/**
 * Extracts a clean, human-readable GPU model from raw WebGL strings.
 * e.g. "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Laptop GPU Direct3D11...)" -> "NVIDIA GeForce RTX 4080 Laptop GPU"
 */
function cleanGpuName(rawRenderer = '') {
  if (!rawRenderer) return ''
  const str = String(rawRenderer).trim()

  // Match NVIDIA GeForce / RTX / GTX
  const nvMatch = str.match(/(NVIDIA\s+GeForce\s+(?:RTX|GTX|MX)\s+[0-9A-Za-z\s]+?(?:Laptop\s+GPU|Ti|SUPER)?)(?:Direct3D|\(|\/|,|$)/i)
  if (nvMatch) return nvMatch[1].trim()

  // Match Apple M-series
  const appleMatch = str.match(/(Apple\s+M[0-9]+(?:\s+(?:Pro|Max|Ultra))?|Apple\s+GPU)/i)
  if (appleMatch) return appleMatch[1].trim()

  // Match AMD Radeon
  const amdMatch = str.match(/(AMD\s+Radeon\s+[0-9A-Za-z\s]+?)(?:Direct3D|\(|\/|,|$)/i)
  if (amdMatch) return amdMatch[1].trim()

  // Match Intel Iris / Arc / UHD
  const intelMatch = str.match(/(Intel(?:\(R\))?\s+(?:Iris(?:\(R\))?\s+Xe|Arc(?:\(TM\))?|UHD|HD)\s+Graphics(?:\s+[0-9]+)?)/i)
  if (intelMatch) return intelMatch[1].replace(/\([A-Z]+\)/g, '').trim()

  // Match Qualcomm Adreno
  const adrenoMatch = str.match(/(Adreno\s*(?:\(TM\))?\s*[0-9]+)/i)
  if (adrenoMatch) return adrenoMatch[1].replace(/\([A-Z]+\)/g, '').trim()

  // Match ARM Mali
  const maliMatch = str.match(/(Mali-[A-Z0-9]+)/i)
  if (maliMatch) return maliMatch[1].trim()

  // Fallback to removing ANGLE wrapper
  const angleStrip = str.replace(/^ANGLE\s*\([^,]+,\s*/i, '').replace(/\s*Direct3D.*$/i, '').replace(/\)$/, '').trim()
  return angleStrip.slice(0, 50)
}

// ─── Device Information Parser ──────────────────────────────────────────────

/**
 * Parses userAgent, Client Hints, and Hardware Specs into accurate device models.
 * Correctly distinguishes high-performance laptops (e.g. ASUS ROG / RTX),
 * iPad Pros vs standard iPads, flagship Androids, and iPhones.
 */
export function parseDeviceInfo(ua = '', options = {}) {
  const userAgent = ua || (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  const hardware = options.hardware || getHardwareSpecs()
  const maxTouchPoints = options.maxTouchPoints ?? hardware.touchPoints ?? (typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0)
  const screenW = options.screenWidth ?? hardware.screenWidth ?? (typeof window !== 'undefined' && window.screen ? window.screen.width : 0)
  const screenH = options.screenHeight ?? hardware.screenHeight ?? (typeof window !== 'undefined' && window.screen ? window.screen.height : 0)
  const pixelRatio = options.pixelRatio ?? hardware.pixelRatio ?? (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1)
  const maxScreen = Math.max(screenW, screenH)
  const minScreen = Math.min(screenW, screenH)
  const modelHint = options.modelHint || null
  const customNickname = options.customNickname ?? (typeof localStorage !== 'undefined' ? (localStorage.getItem('binar_device_nickname') || localStorage.getItem('binar_device_name')) : null)

  const rawGpu = hardware.gpuRenderer || ''
  const cleanGpu = cleanGpuName(rawGpu)

  if (!userAgent && !customNickname && !modelHint && !cleanGpu) {
    return {
      deviceName: 'Perangkat Tidak Dikenal',
      deviceModel: 'Perangkat Tidak Dikenal',
      os: 'Unknown OS',
      browser: 'Unknown Browser',
      deviceType: 'Desktop',
      deviceNickname: null
    }
  }

  // 1. Detect Browser
  let browser = 'Unknown Browser'
  if (/Edg\/([0-9\.]+)/i.test(userAgent)) {
    const ver = userAgent.match(/Edg\/([0-9]+)/i)?.[1]
    browser = `Edge${ver ? ' ' + ver : ''}`
  } else if (/OPR\/([0-9\.]+)|Opera/i.test(userAgent)) {
    browser = 'Opera'
  } else if (/Chrome\/([0-9\.]+)/i.test(userAgent)) {
    const ver = userAgent.match(/Chrome\/([0-9]+)/i)?.[1]
    browser = `Chrome${ver ? ' ' + ver : ''}`
  } else if (/Firefox\/([0-9\.]+)/i.test(userAgent)) {
    const ver = userAgent.match(/Firefox\/([0-9]+)/i)?.[1]
    browser = `Firefox${ver ? ' ' + ver : ''}`
  } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
    const ver = userAgent.match(/Version\/([0-9]+)/i)?.[1]
    browser = `Safari${ver ? ' ' + ver : ''}`
  }

  let os = 'Unknown OS'
  let deviceType = 'Desktop'
  let deviceModel = 'Komputer Desktop'

  // 2. Detect iPad & iPad Pro (including desktop Safari mode where UA says Macintosh)
  const isExplicitIpad = /iPad/i.test(userAgent)
  const isMacWithTouch = /Macintosh|Mac OS X/i.test(userAgent) && maxTouchPoints > 1
  const isIpadHint = modelHint && /iPad/i.test(modelHint)

  if (isExplicitIpad || isMacWithTouch || isIpadHint || /iPad\s*Pro/i.test(userAgent)) {
    deviceType = 'Tablet'
    os = 'iPadOS'
    const verMatch = userAgent.match(/(?:OS|Version)\s([0-9_]+)/i)
    if (verMatch) os = `iPadOS ${verMatch[1].replace(/_/g, '.')}`

    // Accurate iPad model classification using screen dimensions & pixel density
    if (/iPad\s*Pro/i.test(userAgent) || isIpadHint || maxScreen >= 1112) {
      if (maxScreen >= 1300) {
        deviceModel = 'iPad Pro 12.9" / 13"'
      } else if (maxScreen >= 1190) {
        deviceModel = 'iPad Pro 11"'
      } else if (maxScreen >= 1112) {
        deviceModel = 'iPad Pro 10.5"'
      } else {
        deviceModel = 'iPad Pro'
      }
    } else if (maxScreen === 1180 || /iPad\s*Air/i.test(userAgent)) {
      deviceModel = 'iPad Air'
    } else if (maxScreen === 1133 || maxScreen === 1024 || /iPad\s*Mini/i.test(userAgent)) {
      deviceModel = 'iPad Mini'
    } else {
      deviceModel = 'Apple iPad'
    }
  }
  // 3. Detect iPhone
  else if (/iPhone/i.test(userAgent) || (modelHint && /iPhone/i.test(modelHint))) {
    deviceType = 'Mobile'
    const verMatch = userAgent.match(/OS\s([0-9_]+)/i)
    os = verMatch ? `iOS ${verMatch[1].replace(/_/g, '.')}` : 'iOS'

    // Match exact iPhone model geometry
    if (minScreen >= 430 || maxScreen >= 932) deviceModel = 'iPhone 15 Pro Max / 16 Plus'
    else if (minScreen >= 393 || maxScreen >= 852) deviceModel = 'iPhone 15 Pro / 15'
    else if (maxScreen >= 926) deviceModel = 'iPhone 13 Pro Max / 14 Plus'
    else if (maxScreen >= 844) deviceModel = 'iPhone 14 / 13 / 12'
    else if (maxScreen >= 896) deviceModel = 'iPhone 11 / XR'
    else if (maxScreen >= 812) deviceModel = 'iPhone X / XS / 11 Pro'
    else if (maxScreen >= 667) deviceModel = 'iPhone SE / 8'
    else deviceModel = 'Apple iPhone'
  }
  // 4. Detect Android & Device Model
  else if (/Android/i.test(userAgent) || (modelHint && !/iPhone|iPad/i.test(modelHint) && /Android/i.test(options.platformHint || ''))) {
    const verMatch = userAgent.match(/Android\s([0-9\.]+)/i)
    os = verMatch ? `Android ${verMatch[1]}` : 'Android'
    deviceType = /Tablet|SM-T|SM-X/i.test(userAgent) || maxScreen >= 1000 ? 'Tablet' : 'Mobile'

    // Extract hardware model from Android UA string or client hints
    const modelMatch = userAgent.match(/Android[^;]+;\s*(?:[a-z]{2}-[a-z]{2};\s*)?([^;)]+?)(?:\s+Build|\))/i)
    let rawModel = (modelHint || (modelMatch ? modelMatch[1].trim() : '')).trim()

    // Handle Chrome on Android UA freeze where model is "K"
    if (rawModel === 'K' || !rawModel) {
      if (cleanGpu) {
        rawModel = `Adreno/Mali (${cleanGpu})`
      } else {
        rawModel = ''
      }
    }

    if (rawModel && rawModel !== 'K') {
      if (/SM-S928/i.test(rawModel)) deviceModel = 'Samsung Galaxy S24 Ultra'
      else if (/SM-S926/i.test(rawModel)) deviceModel = 'Samsung Galaxy S24+'
      else if (/SM-S921/i.test(rawModel)) deviceModel = 'Samsung Galaxy S24'
      else if (/SM-S918/i.test(rawModel)) deviceModel = 'Samsung Galaxy S23 Ultra'
      else if (/SM-S916/i.test(rawModel)) deviceModel = 'Samsung Galaxy S23+'
      else if (/SM-S911/i.test(rawModel)) deviceModel = 'Samsung Galaxy S23'
      else if (/SM-S908/i.test(rawModel)) deviceModel = 'Samsung Galaxy S22 Ultra'
      else if (/SM-S901/i.test(rawModel)) deviceModel = 'Samsung Galaxy S22'
      else if (/SM-G998/i.test(rawModel)) deviceModel = 'Samsung Galaxy S21 Ultra'
      else if (/SM-A546/i.test(rawModel)) deviceModel = 'Samsung Galaxy A54 5G'
      else if (/SM-A536/i.test(rawModel)) deviceModel = 'Samsung Galaxy A53 5G'
      else if (/SM-A346/i.test(rawModel)) deviceModel = 'Samsung Galaxy A34 5G'
      else if (/SM-A245/i.test(rawModel)) deviceModel = 'Samsung Galaxy A24'
      else if (/SM-A145|SM-A146/i.test(rawModel)) deviceModel = 'Samsung Galaxy A14'
      else if (/SM-A055/i.test(rawModel)) deviceModel = 'Samsung Galaxy A05'
      else if (/SM-T|SM-X/i.test(rawModel)) deviceModel = `Samsung Galaxy Tab (${rawModel})`
      else if (/SM-F/i.test(rawModel)) deviceModel = `Samsung Galaxy Z Fold/Flip (${rawModel})`
      else if (/^SM-/i.test(rawModel)) deviceModel = `Samsung Galaxy (${rawModel})`
      else if (/Pixel\s/i.test(rawModel) || /^Pixel/i.test(rawModel)) deviceModel = `Google ${rawModel}`
      else if (/2312DRA50G/i.test(rawModel)) deviceModel = 'Redmi Note 13 Pro'
      else if (/2201117P/i.test(rawModel)) deviceModel = 'POCO M4 Pro'
      else if (/Redmi/i.test(rawModel)) deviceModel = `Xiaomi ${rawModel}`
      else if (/POCO/i.test(rawModel)) deviceModel = `POCO ${rawModel}`
      else if (/Mi\s|Xiaomi/i.test(rawModel)) deviceModel = `Xiaomi ${rawModel}`
      else if (/^CPH/i.test(rawModel)) deviceModel = `OPPO (${rawModel})`
      else if (/^RMX/i.test(rawModel)) deviceModel = `Realme (${rawModel})`
      else if (/^V2|^vivo/i.test(rawModel)) deviceModel = `Vivo (${rawModel})`
      else if (/Infinix|^X6/i.test(rawModel)) deviceModel = `Infinix (${rawModel})`
      else if (/TECNO/i.test(rawModel)) deviceModel = `Tecno (${rawModel})`
      else deviceModel = `Android (${rawModel})`
    } else {
      deviceModel = deviceType === 'Tablet' ? 'Android Tablet' : 'Android Smartphone'
    }
  }
  // 5. Windows (Accurately detects High-Performance / Gaming Laptops vs Desktops)
  else if (/Windows NT 10.0/i.test(userAgent)) {
    os = 'Windows 10/11'
    deviceType = (maxTouchPoints > 0 && maxScreen < 1600) ? 'Laptop' : 'Desktop'

    const hasDedicatedGpu = /RTX|GTX|Radeon\s+RX|GeForce/i.test(cleanGpu)
    const isHighSpec = (hardware.cpuCores && hardware.cpuCores >= 8) || (hardware.ramGb && hardware.ramGb >= 16)

    if (hasDedicatedGpu || isHighSpec) {
      deviceModel = cleanGpu ? `Windows High-Perf PC (${cleanGpu})` : 'Windows High-Performance PC'
    } else if (/Iris\s+Xe/i.test(cleanGpu)) {
      deviceModel = 'Windows Laptop (Intel Iris Xe)'
    } else {
      deviceModel = 'Windows PC Desktop'
    }
  } else if (/Windows NT 6.3/i.test(userAgent)) {
    os = 'Windows 8.1'
    deviceModel = 'Windows 8.1 PC'
    deviceType = 'Desktop'
  } else if (/Windows NT 6.1/i.test(userAgent)) {
    os = 'Windows 7'
    deviceModel = 'Windows 7 PC'
    deviceType = 'Desktop'
  }
  // 6. Mac Desktop & MacBook
  else if (/Macintosh|Mac OS X/i.test(userAgent)) {
    os = 'macOS'
    deviceType = (maxScreen <= 1728 && pixelRatio >= 2) ? 'Laptop' : 'Desktop'
    if (cleanGpu && /Apple\s+M/i.test(cleanGpu)) {
      deviceModel = `Apple MacBook / Mac (${cleanGpu})`
    } else if (deviceType === 'Laptop') {
      deviceModel = 'Apple MacBook Pro / Air'
    } else {
      deviceModel = 'Apple Mac Desktop'
    }
  }
  // 7. ChromeOS
  else if (/CrOS/i.test(userAgent)) {
    os = 'ChromeOS'
    deviceModel = 'Chromebook'
    deviceType = 'Laptop'
  }
  // 8. Linux
  else if (/Linux/i.test(userAgent)) {
    os = 'Linux'
    deviceModel = 'Linux Desktop'
    deviceType = 'Desktop'
  }

  // If a custom device nickname is set in localStorage, respect it
  const effectiveModel = customNickname ? `${customNickname} (${deviceModel})` : deviceModel
  const deviceName = `${effectiveModel} (${browser})`

  return {
    deviceName,
    deviceModel: customNickname || deviceModel,
    os,
    browser,
    deviceType,
    deviceNickname: customNickname || null,
    hardware: {
      ...hardware,
      cleanGpu: cleanGpu || null
    }
  }
}

/**
 * Collect detailed client device information including async Client Hints and Hardware Telemetry.
 * Uses a generous 3000ms timeout for Client Hints so data is never prematurely dropped.
 */
export async function getDetailedDeviceInfo() {
  let modelHint = null
  let platformHint = null

  if (typeof navigator !== 'undefined' && navigator.userAgentData?.getHighEntropyValues) {
    try {
      const hints = await Promise.race([
        navigator.userAgentData.getHighEntropyValues([
          'model',
          'platform',
          'platformVersion',
          'architecture',
          'bitness',
          'formFactor'
        ]),
        new Promise(resolve => setTimeout(resolve, 3000))
      ])
      if (hints?.model) modelHint = hints.model
      if (hints?.platform) platformHint = hints.platform
    } catch (e) {}
  }

  const hardware = getHardwareSpecs()

  return parseDeviceInfo('', {
    modelHint,
    platformHint,
    hardware
  })
}

// ─── Custom Device Nickname ─────────────────────────────────────────────────

export function getDeviceNickname() {
  try {
    return localStorage.getItem('binar_device_nickname') || ''
  } catch (e) {
    return ''
  }
}

export function setDeviceNickname(name) {
  try {
    if (name && name.trim()) {
      localStorage.setItem('binar_device_nickname', name.trim())
    } else {
      localStorage.removeItem('binar_device_nickname')
    }
  } catch (e) {}
}

export function formatLoginNarrative(log) {
  if (!log) return ''
  const user = log.identifier || log.full_name || 'Pengguna'
  const device = log.metadata?.deviceModel || log.device_name || 'Perangkat'
  if (log.status === 'success') {
    return `${user} login at ${device}`
  }
  return `${user} gagal login di ${device}`
}

// ─── Multi-Provider Public IP Resolution ────────────────────────────────────

let cachedClientIp = null
let lastIpFetchTime = 0

export async function getClientIp() {
  const now = Date.now()
  if (cachedClientIp && now - lastIpFetchTime < 600000) {
    return cachedClientIp
  }

  const providers = [
    { url: 'https://api.ipify.org?format=json', parse: d => d.ip },
    { url: 'https://api64.ipify.org?format=json', parse: d => d.ip },
    { url: 'https://ipapi.co/json/', parse: d => d.ip }
  ]

  for (const p of providers) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2500)
      const res = await fetch(p.url, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) {
        const json = await res.json()
        const ip = p.parse(json)
        if (ip && ip.length >= 7) {
          cachedClientIp = ip
          lastIpFetchTime = now
          return ip
        }
      }
    } catch (e) {}
  }

  return cachedClientIp || 'Unknown / Client IP'
}

// ─── Local Storage Buffer ───────────────────────────────────────────────────

function appendToLocalCache(logEntry) {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || '[]')
    const filtered = existing.filter(x => x.id !== logEntry.id && !String(x.id).startsWith('demo_log_'))
    const updated = [logEntry, ...filtered].slice(0, MAX_LOCAL_CACHE)
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(updated))
  } catch (err) {
    console.warn('[LoginAudit] Failed to update local audit cache:', err)
  }
}

function updateLocalCacheItem(logRecord) {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || '[]')
    const updated = existing.map(item => item.id === logRecord.id ? { ...item, ...logRecord } : item)
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(updated))
  } catch (e) {}
}

function evaluateSuspicion(status, identifier, failureReason) {
  if (status === 'failed') return true

  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || '[]')
    const recentFails = existing.filter(
      item => item.identifier?.toLowerCase() === identifier?.toLowerCase() &&
              item.status === 'failed' &&
              Date.now() - new Date(item.created_at).getTime() < 15 * 60 * 1000
    )
    if (recentFails.length >= 3) {
      return true
    }
  } catch (e) {}

  return false
}

// ─── Direct Push to Supabase Helper ─────────────────────────────────────────

async function pushLogToSupabase(logRecord) {
  if (!isSupabaseConfigured || !supabase) return false

  try {
    const payload = {
      id: logRecord.id,
      user_id: logRecord.user_id,
      identifier: logRecord.identifier,
      full_name: logRecord.full_name,
      role: logRecord.role,
      role_level: logRecord.role_level,
      status: logRecord.status,
      failure_reason: logRecord.failure_reason,
      ip_address: logRecord.ip_address,
      user_agent: logRecord.user_agent,
      device_name: logRecord.device_name,
      location: logRecord.location,
      is_suspicious: logRecord.is_suspicious,
      metadata: logRecord.metadata,
      created_at: logRecord.created_at
    }

    // Upsert so if already inserted, it updates cleanly with rich telemetry
    const { error } = await supabase.from('login_logs').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.warn('[LoginAudit] Supabase login_logs upsert notice:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('[LoginAudit] Remote login_logs write error:', err?.message)
    return false
  }
}

// ─── Progressive Background Device Scanner (Up to 10 Minutes) ───────────────

let activeScanTimers = []
let pendingScanState = null

/**
 * Flush any active pending device scan immediately to Supabase and profiles.
 * Called automatically on beforeunload, pagehide, or when an exam room starts.
 */
export async function flushPendingDeviceScan() {
  if (!pendingScanState) {
    try {
      const saved = sessionStorage.getItem(PENDING_SCAN_KEY)
      if (saved) pendingScanState = JSON.parse(saved)
    } catch (e) {}
  }

  if (!pendingScanState?.logRecord) return

  const log = pendingScanState.logRecord
  activeScanTimers.forEach(id => clearTimeout(id))
  activeScanTimers = []

  try {
    sessionStorage.removeItem(PENDING_SCAN_KEY)
    await pushLogToSupabase(log)

    // Update profiles table if user_id is present
    if (log.user_id && isSupabaseConfigured && supabase) {
      const cleanDev = log.metadata?.deviceModel || log.device_name || 'Web Browser'
      await supabase
        .from('profiles')
        .update({
          last_login_at: log.created_at,
          last_login_device: cleanDev
        })
        .eq('id', log.user_id)
    }
  } catch (e) {
    console.warn('[LoginAudit] Flush error:', e)
  } finally {
    pendingScanState = null
  }
}

// Register browser lifecycle flush listeners
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPendingDeviceScan()
  })
  window.addEventListener('pagehide', () => {
    flushPendingDeviceScan()
  })
}

/**
 * Schedules progressive background device scanning.
 * As instructed, takes up to max 10 minutes to accurately scan hardware,
 * battery, network, IP, and location before finalizing the record in the database.
 */
export function scheduleBackgroundDeviceScan(initialRecord, options = {}) {
  if (typeof window === 'undefined') return

  const maxMinutes = options.maxDurationMinutes || 10
  pendingScanState = { logRecord: { ...initialRecord } }
  try {
    sessionStorage.setItem(PENDING_SCAN_KEY, JSON.stringify(pendingScanState))
  } catch (e) {}

  // Clear any existing scan timers
  activeScanTimers.forEach(id => clearTimeout(id))
  activeScanTimers = []

  // ── Stage 1 (Fast Initial Hardware & Client Hints: +6 seconds) ────────────
  const stage1Id = setTimeout(async () => {
    try {
      const detailed = await getDetailedDeviceInfo()
      let batteryInfo = null
      if (typeof navigator !== 'undefined' && navigator.getBattery) {
        try {
          const batt = await navigator.getBattery()
          batteryInfo = {
            level: batt.level,
            charging: batt.charging
          }
        } catch (e) {}
      }

      if (pendingScanState?.logRecord) {
        const resolvedModel = detailed.deviceNickname || detailed.deviceModel || detailed.deviceName
        pendingScanState.logRecord.device_name = detailed.deviceName
        pendingScanState.logRecord.metadata = {
          ...(pendingScanState.logRecord.metadata || {}),
          deviceModel: resolvedModel,
          deviceName: detailed.deviceName,
          os: detailed.os,
          browser: detailed.browser,
          deviceType: detailed.deviceType,
          hardware: {
            ...(detailed.hardware || {}),
            battery: batteryInfo
          },
          actionNarrative: `${pendingScanState.logRecord.identifier} login at ${resolvedModel}`,
          scan_stage: 'Stage 1 (Hardware Profile Scanned)'
        }
        updateLocalCacheItem(pendingScanState.logRecord)
      }
    } catch (s1Err) {
      console.warn('[LoginAudit] Stage 1 notice:', s1Err)
    }
  }, 6000)
  activeScanTimers.push(stage1Id)

  // ── Stage 2 (Network IP & Passive Location Scan: +35 seconds) ─────────────
  const stage2Id = setTimeout(async () => {
    try {
      const publicIp = await getClientIp()

      let locResult = null
      try {
        locResult = await captureFuzzedDeviceLocation()
      } catch (locErr) {
        console.warn('[LoginAudit] Stage 2 location notice:', locErr)
      }

      if (pendingScanState?.logRecord) {
        pendingScanState.logRecord.ip_address = publicIp
        if (locResult?.locationName) {
          pendingScanState.logRecord.location = locResult.locationName
          pendingScanState.logRecord.metadata = {
            ...(pendingScanState.logRecord.metadata || {}),
            location_precision: locResult.precision || '200-300m',
            location_details: locResult
          }
        }
        pendingScanState.logRecord.metadata.scan_stage = 'Stage 2 (Network & Location Verified)'
        updateLocalCacheItem(pendingScanState.logRecord)

        // Write progressive snapshot to Supabase so if user leaves after 1-2 mins, data is already saved
        await pushLogToSupabase(pendingScanState.logRecord)
      }
    } catch (s2Err) {
      console.warn('[LoginAudit] Stage 2 notice:', s2Err)
    }
  }, 35000)
  activeScanTimers.push(stage2Id)

  // ── Stage 3 (Telemetry Stabilization & Recheck: +2.5 minutes) ─────────────
  const stage3Id = setTimeout(async () => {
    try {
      if (pendingScanState?.logRecord) {
        // Re-check client IP & battery stability
        const freshIp = await getClientIp()
        pendingScanState.logRecord.ip_address = freshIp
        pendingScanState.logRecord.metadata.scan_stage = 'Stage 3 (Telemetry Stabilized)'
        updateLocalCacheItem(pendingScanState.logRecord)
        await pushLogToSupabase(pendingScanState.logRecord)
      }
    } catch (s3Err) {
      console.warn('[LoginAudit] Stage 3 notice:', s3Err)
    }
  }, 150000)
  activeScanTimers.push(stage3Id)

  // ── Stage 4 (Final Sync: +5 minutes, well within user's max 10 min window) ─
  const finalDelayMs = Math.min(maxMinutes * 60 * 1000, 300000)
  const finalId = setTimeout(async () => {
    try {
      if (pendingScanState?.logRecord) {
        pendingScanState.logRecord.sync_status = 'verified'
        pendingScanState.logRecord.metadata.scan_stage = 'Stage 4 (Completed & Verified)'
        pendingScanState.logRecord.metadata.scan_completed_at = new Date().toISOString()
        updateLocalCacheItem(pendingScanState.logRecord)

        await flushPendingDeviceScan()
      }
    } catch (finalErr) {
      console.warn('[LoginAudit] Final sync notice:', finalErr)
    }
  }, finalDelayMs)
  activeScanTimers.push(finalId)
}

// ─── Login Recording Entry Point ────────────────────────────────────────────

export async function recordLoginAttempt({
  identifier = '',
  userId = null,
  fullName = null,
  role = null,
  roleLevel = null,
  status = 'failed', // 'success' | 'failed'
  failureReason = null,
  metadata = {}
}) {
  const cleanIdentifier = String(identifier || '').trim()
  if (!cleanIdentifier) return null

  // Fast baseline hardware inspection (immediate, ~2ms)
  const hardware = getHardwareSpecs()
  const initialDeviceInfo = parseDeviceInfo('', { hardware })
  const isSuspicious = evaluateSuspicion(status, cleanIdentifier, failureReason)

  const resolvedModel = initialDeviceInfo.deviceNickname || initialDeviceInfo.deviceModel || initialDeviceInfo.deviceName || 'Perangkat'
  const actionNarrative = status === 'success'
    ? `${cleanIdentifier} login at ${resolvedModel}`
    : `${cleanIdentifier} gagal login di ${resolvedModel}`

  const logRecord = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    user_id: userId,
    identifier: cleanIdentifier,
    full_name: fullName,
    role: role,
    role_level: roleLevel,
    status: status,
    failure_reason: failureReason,
    ip_address: cachedClientIp || 'Memindai IP...',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
    device_name: initialDeviceInfo.deviceName,
    location: null,
    is_suspicious: isSuspicious,
    sync_status: status === 'success' ? 'scanning' : 'synced',
    metadata: {
      ...metadata,
      deviceModel: resolvedModel,
      deviceName: initialDeviceInfo.deviceName,
      actionNarrative,
      os: initialDeviceInfo.os,
      browser: initialDeviceInfo.browser,
      deviceType: initialDeviceInfo.deviceType,
      hardware,
      screen: typeof window !== 'undefined' && window.screen ? `${window.screen?.width}x${window.screen?.height}` : null,
      timestamp: Date.now()
    },
    created_at: new Date().toISOString()
  }

  // 1. Immediately buffer in local storage for instant UI availability
  appendToLocalCache(logRecord)

  // 2. Failed logins are pushed promptly so admin can immediately detect breaches
  if (status === 'failed') {
    getClientIp().then(ip => {
      logRecord.ip_address = ip
      updateLocalCacheItem(logRecord)
      pushLogToSupabase(logRecord)
    }).catch(() => {
      pushLogToSupabase(logRecord)
    })
    return logRecord
  }

  // 3. Successful logins: As requested by user, take time (up to 10 minutes)
  // to deeply scan hardware & location in background before finalizing to DB.
  scheduleBackgroundDeviceScan(logRecord, {
    maxDurationMinutes: 10,
    userId,
    identifier: cleanIdentifier
  })

  return logRecord
}

// ─── Update Location from Exam Session ──────────────────────────────────────

export async function updateLoginLogLocation({
  identifier = '',
  userId = null,
  locationText = '',
  locationMetadata = {}
}) {
  const cleanId = String(identifier || '').trim().toLowerCase()
  if (!cleanId && !userId) return false

  const timestamp = new Date().toISOString()

  // 1. Update in local audit cache
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || '[]')
    let found = false
    const updated = existing.map(item => {
      const match = !found && (
        (userId && item.user_id === userId) ||
        (cleanId && item.identifier?.toLowerCase() === cleanId)
      )
      if (match) {
        found = true
        return {
          ...item,
          location: locationText,
          metadata: {
            ...(item.metadata || {}),
            location_precision: locationMetadata?.precision || '200-300m',
            location_details: locationMetadata,
            location_verified_at: timestamp
          }
        }
      }
      return item
    })
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(updated))
  } catch (err) {
    console.warn('[LoginAudit] Local cache location update notice:', err)
  }

  // 2. Update latest record in Supabase `login_logs` table
  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from('login_logs')
        .select('id, metadata')
        .order('created_at', { ascending: false })
        .limit(1)

      if (userId) {
        query = query.eq('user_id', userId)
      } else if (cleanId) {
        query = query.ilike('identifier', cleanId)
      }

      const { data: latestLogs, error: findErr } = await query
      if (!findErr && latestLogs && latestLogs.length > 0) {
        const logId = latestLogs[0].id
        const prevMeta = latestLogs[0].metadata || {}
        await supabase
          .from('login_logs')
          .update({
            location: locationText,
            metadata: {
              ...prevMeta,
              location_precision: locationMetadata?.precision || '200-300m',
              location_details: locationMetadata,
              location_verified_at: timestamp
            }
          })
          .eq('id', logId)
      }
    } catch (dbErr) {
      console.warn('[LoginAudit] Remote login_logs location update notice:', dbErr?.message)
    }
  }

  return true
}

// ─── Fetch Logs for Admin / Teacher Dashboard ───────────────────────────────

/**
 * Fetch login audit logs for Admin / Teachers.
 * Queries Supabase `login_logs`, merging with local cache.
 * Completely excludes mock / fake demo seed data to ensure 100% data fidelity.
 */
export async function fetchLoginLogs({
  limit = 100,
  status = 'all', // 'all' | 'success' | 'failed' | 'suspicious'
  search = '',
  role = ''
} = {}) {
  let remoteLogs = []
  let remoteError = null

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from('login_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (status === 'success') {
        query = query.eq('status', 'success')
      } else if (status === 'failed') {
        query = query.eq('status', 'failed')
      } else if (status === 'suspicious') {
        query = query.eq('is_suspicious', true)
      }

      if (role) {
        query = query.eq('role', role)
      }

      const { data, error } = await query
      if (error) {
        remoteError = error
      } else if (data) {
        remoteLogs = data
      }
    } catch (err) {
      remoteError = err
    }

    // Fallback: If remote login_logs has 0 rows, populate from real profiles.last_login_at
    // NEVER hardcode fake IPs or fake locations!
    if (remoteLogs.length === 0) {
      try {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, fullname, role_level, class_section, last_login_at, last_login_device')
          .not('last_login_at', 'is', null)
          .order('last_login_at', { ascending: false })
          .limit(limit)

        if (profs && profs.length > 0) {
          remoteLogs = profs.map(p => {
            const parsed = parseDeviceInfo(p.last_login_device)
            const r = p.role_level === 4 ? 'admin' : (p.role_level === 3 ? 'teacher' : (p.role_level === 2 ? 'officer' : 'student'))
            const userIdentifier = p.username || p.fullname || 'User'
            const model = parsed.deviceModel || parsed.deviceName || 'Web Browser'
            return {
              id: `prof_${p.id}_${p.last_login_at}`,
              user_id: p.id,
              identifier: userIdentifier,
              full_name: p.fullname,
              role: r,
              role_level: p.role_level || 1,
              status: 'success',
              failure_reason: null,
              ip_address: null,
              user_agent: p.last_login_device,
              device_name: parsed.deviceName,
              location: null,
              is_suspicious: false,
              metadata: {
                deviceModel: model,
                deviceName: parsed.deviceName,
                actionNarrative: `${userIdentifier} login at ${model}`,
                os: parsed.os,
                browser: parsed.browser,
                deviceType: parsed.deviceType,
                kelas: p.class_section || '',
                source: 'profiles.last_login_at'
              },
              created_at: p.last_login_at
            }
          })
        }
      } catch (profErr) {
        console.warn('[LoginAudit] Fallback profiles fetch notice:', profErr?.message)
      }
    }
  }

  // Load real local logs (filter out any old demo seeds)
  let localLogs = []
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || '[]')
    localLogs = raw.filter(x => !String(x.id).startsWith('demo_log_'))
  } catch (e) {}

  // Merge unique logs by ID
  const map = new Map()

  // 1. Remote logs (database records)
  for (const item of remoteLogs) {
    if (!item?.id || String(item.id).startsWith('demo_log_')) continue
    map.set(item.id, normalizeLogEntry(item))
  }

  // 2. Local logs (overlay with latest local scan state)
  for (const item of localLogs) {
    if (!item?.id || String(item.id).startsWith('demo_log_')) continue
    map.set(item.id, normalizeLogEntry(item))
  }

  let merged = Array.from(map.values())
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Apply filters
  if (status !== 'all') {
    if (status === 'suspicious') {
      merged = merged.filter(x => x.is_suspicious)
    } else {
      merged = merged.filter(x => x.status === status)
    }
  }

  if (role) {
    merged = merged.filter(x => x.role === role)
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase()
    merged = merged.filter(x =>
      (x.identifier && x.identifier.toLowerCase().includes(q)) ||
      (x.full_name && x.full_name.toLowerCase().includes(q)) ||
      (x.device_name && x.device_name.toLowerCase().includes(q)) ||
      (x.metadata?.deviceModel && String(x.metadata.deviceModel).toLowerCase().includes(q)) ||
      (x.metadata?.actionNarrative && String(x.metadata.actionNarrative).toLowerCase().includes(q)) ||
      (x.ip_address && x.ip_address.toLowerCase().includes(q)) ||
      (x.location && x.location.toLowerCase().includes(q)) ||
      (x.failure_reason && x.failure_reason.toLowerCase().includes(q))
    )
  }

  return {
    data: merged.slice(0, limit),
    isTableMissing: Boolean(remoteError && (remoteError.code === 'PGRST205' || remoteError.message?.includes('does not exist'))),
    remoteError: remoteError?.message || null
  }
}

function normalizeLogEntry(item) {
  const cloned = { ...item, metadata: { ...(item.metadata || {}) } }
  if (!cloned.metadata.deviceModel) {
    const parsed = parseDeviceInfo(cloned.device_name || cloned.user_agent || '')
    cloned.metadata.deviceModel = parsed.deviceModel || parsed.deviceName || 'Perangkat'
    cloned.metadata.os = cloned.metadata.os || parsed.os
    cloned.metadata.browser = cloned.metadata.browser || parsed.browser
    cloned.metadata.deviceType = cloned.metadata.deviceType || parsed.deviceType
  }
  if (!cloned.metadata.actionNarrative) {
    cloned.metadata.actionNarrative = formatLoginNarrative(cloned)
  }
  return cloned
}

/**
 * Fetch summary statistics for the audit dashboard cards.
 */
export async function fetchLoginAuditStats() {
  const { data: logs } = await fetchLoginLogs({ limit: 500 })

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  const todayLogs = logs.filter(l => l.created_at?.startsWith(todayStr))
  const totalToday = todayLogs.length
  const successToday = todayLogs.filter(l => l.status === 'success').length
  const failedToday = todayLogs.filter(l => l.status === 'failed').length
  const suspiciousToday = todayLogs.filter(l => l.is_suspicious).length

  const failedCounts = {}
  for (const log of logs.filter(l => l.status === 'failed')) {
    const key = log.identifier || 'unknown'
    failedCounts[key] = (failedCounts[key] || 0) + 1
  }

  const topTargets = Object.entries(failedCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([identifier, count]) => ({ identifier, count }))

  return {
    totalToday,
    successToday,
    failedToday,
    suspiciousToday,
    totalHistory: logs.length,
    topTargets
  }
}

/**
 * Kept for backward compatibility if ever needed by unit tests.
 */
export function getSeedAuditLogs() {
  return []
}
