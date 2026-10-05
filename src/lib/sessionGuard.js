/**
 * Session Guard Module — Single Active Session Enforcement
 * 
 * Rules:
 * - Level 1 (Student/Parent) & Level 2 (Officer):
 *   Strictly limited to 1 active login session at a time across all devices, windows, and apps.
 *   Simultaneous logins in another device or window are prohibited and automatically terminated.
 * 
 * - Level 3 (Teacher) & Level 4 (Admin):
 *   Exempt — freely allowed to login on multiple devices and windows at the same time.
 */

import { supabase, isSupabaseConfigured } from './supabase.js'

const SESSION_TOKEN_KEY = 'binar_active_session_token'
const TAB_ID_KEY = 'binar_active_tab_id'
const KICKOUT_REASON_KEY = 'binar_kickout_reason'
const CHANNEL_NAME = 'binar_single_session_sync'
const TAB_LOCK_PREFIX = 'binar_tab_lock_'

/**
 * Returns true if the user level requires strict single active session enforcement.
 * Level 1 = Student / Parent
 * Level 2 = Officer
 * Level 3 = Teacher (Unrestricted)
 * Level 4 = Admin (Unrestricted)
 */
export function isSingleSessionEnforced(level) {
  const lvl = Number(level) || 1
  return lvl <= 2
}

/**
 * Get current window's active session token from sessionStorage.
 */
export function getLocalSessionToken() {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || null
  } catch (e) {
    return null
  }
}

/**
 * Set current window's active session token in sessionStorage.
 */
export function setLocalSessionToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY)
    }
  } catch (e) {}
}

/**
 * Get or create a unique identifier for this window/tab instance.
 */
export function getTabInstanceId() {
  try {
    let tabId = sessionStorage.getItem(TAB_ID_KEY)
    if (!tabId) {
      tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      sessionStorage.setItem(TAB_ID_KEY, tabId)
    }
    return tabId
  } catch (e) {
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }
}

/**
 * Register a new active session in the database for Level 1 & 2 users.
 * Generates a unique token, saves it locally, and updates profiles table in Supabase.
 */
export async function registerActiveSession(userId, level) {
  if (!isSingleSessionEnforced(level)) {
    setLocalSessionToken(null)
    return null
  }

  const token = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  setLocalSessionToken(token)
  try {
    sessionStorage.setItem(TAB_ID_KEY, tabId)
    // Claim tab lock
    localStorage.setItem(
      `${TAB_LOCK_PREFIX}${userId}`,
      JSON.stringify({ tabId, token, time: Date.now() })
    )
  } catch (e) {}

  if (isSupabaseConfigured && supabase) {
    try {
      const deviceName = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 150) : 'web'
      await supabase
        .from('profiles')
        .update({
          active_session_id: token,
          last_login_at: new Date().toISOString(),
          last_login_device: deviceName
        })
        .eq('id', userId)
    } catch (err) {
      console.warn('[SessionGuard] Failed to register active_session_id in database:', err)
    }
  }

  // Broadcast to any other open tabs on this browser to terminate immediately
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const bc = new BroadcastChannel(CHANNEL_NAME)
      bc.postMessage({
        type: 'NEW_LOGIN_CLAIM',
        userId,
        sessionToken: token,
        tabId,
        timestamp: Date.now()
      })
      bc.close()
    } catch (e) {}
  }

  return token
}

/**
 * Clear the active session from database when the user voluntarily logs out.
 */
export async function clearActiveSession(userId, level) {
  if (!isSingleSessionEnforced(level)) return

  const myToken = getLocalSessionToken()
  setLocalSessionToken(null)

  try {
    sessionStorage.removeItem(TAB_ID_KEY)
    localStorage.removeItem(`${TAB_LOCK_PREFIX}${userId}`)
  } catch (e) {}

  if (isSupabaseConfigured && supabase && myToken) {
    try {
      // Only clear if the active_session_id in database still belongs to this session
      await supabase
        .from('profiles')
        .update({ active_session_id: null })
        .eq('id', userId)
        .eq('active_session_id', myToken)
    } catch (err) {
      console.warn('[SessionGuard] Failed to clear active_session_id on logout:', err)
    }
  }
}

/**
 * Starts real-time watchdog for Level 1 & 2 users.
 * Checks for:
 * 1. BroadcastChannel events (other tabs/windows in same browser)
 * 2. Supabase Realtime events (other devices/browsers)
 * 3. Heartbeat polling fallback (every 5 seconds)
 * 4. Visibilitychange & focus events (immediate check when tab is focused)
 * 
 * Returns cleanup function.
 */
export function startSessionGuard(user, onConflict) {
  if (!user || !isSingleSessionEnforced(user.level)) {
    return () => {} // Level 3 & 4: Unrestricted, no-op
  }

  const myTabId = getTabInstanceId()
  let myToken = getLocalSessionToken()
  if (!myToken) {
    myToken = user.session?.active_session_token || null
    if (myToken) setLocalSessionToken(myToken)
  }

  let isTerminated = false

  function triggerConflict(reason) {
    if (isTerminated) return
    isTerminated = true
    try {
      sessionStorage.setItem(KICKOUT_REASON_KEY, reason || 'concurrent_session')
    } catch (e) {}
    if (typeof onConflict === 'function') {
      onConflict(reason || 'concurrent_session')
    }
  }

  // 1. Check local tab lock for same-browser multi-window prevention
  function checkTabLock() {
    if (isTerminated) return
    try {
      const raw = localStorage.getItem(`${TAB_LOCK_PREFIX}${user.id}`)
      if (raw) {
        const lock = JSON.parse(raw)
        // If another tab has an active lock updated in the last 4 seconds
        if (lock.tabId && lock.tabId !== myTabId && Date.now() - lock.time < 4000) {
          console.warn('[SessionGuard] Another active window/tab holds the lock.')
          triggerConflict('other_window')
          return
        }
      }
      // Update our own lock
      localStorage.setItem(
        `${TAB_LOCK_PREFIX}${user.id}`,
        JSON.stringify({ tabId: myTabId, token: myToken, time: Date.now() })
      )
    } catch (e) {}
  }

  // Run initial lock check
  checkTabLock()

  // 2. Check database session validity (cross-device enforcement)
  async function checkDatabaseSession() {
    if (isTerminated || !isSupabaseConfigured || !supabase || !user.id) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('active_session_id')
        .eq('id', user.id)
        .maybeSingle()

      if (error || !data) return

      // If active_session_id in DB exists and doesn't match our local token, another device took over!
      if (data.active_session_id && myToken && data.active_session_id !== myToken) {
        console.warn('[SessionGuard] Another device logged in. Current session token mismatch.')
        triggerConflict('other_device')
      } else if (!myToken && data.active_session_id) {
        setLocalSessionToken(data.active_session_id)
        myToken = data.active_session_id
      }
    } catch (err) {
      console.warn('[SessionGuard] Error checking database session:', err)
    }
  }

  // Perform initial DB check
  checkDatabaseSession()

  // 3. BroadcastChannel for instant same-browser windows/tabs sync
  let bc = null
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(CHANNEL_NAME)
      bc.onmessage = (event) => {
        if (isTerminated || !event?.data) return
        const { type, userId, sessionToken, tabId } = event.data

        if (userId === user.id) {
          // If a new login occurred anywhere on this browser
          if (type === 'NEW_LOGIN_CLAIM' && tabId !== myTabId) {
            console.warn('[SessionGuard] Detected new login in another window/tab of this browser.')
            triggerConflict('other_window')
          }
          // If another window is probing for active tabs
          else if (type === 'PING_ACTIVE_WINDOW' && tabId !== myTabId) {
            try {
              bc.postMessage({
                type: 'PONG_ACTIVE_WINDOW',
                userId: user.id,
                activeTabId: myTabId,
                targetTabId: tabId
              })
            } catch (e) {}
          }
          // If another tab answered that it is already running
          else if (type === 'PONG_ACTIVE_WINDOW' && event.data.targetTabId === myTabId) {
            console.warn('[SessionGuard] Another window is already running this user.')
            triggerConflict('other_window')
          }
        }
      }

      // Announce this window to see if an active window already exists
      bc.postMessage({
        type: 'PING_ACTIVE_WINDOW',
        userId: user.id,
        tabId: myTabId,
        sessionToken: myToken
      })
    } catch (e) {
      console.warn('[SessionGuard] BroadcastChannel setup failed:', e)
    }
  }

  // 4. Supabase Realtime Subscription (Instant cross-device WebSocket alert)
  let realtimeChannel = null
  if (isSupabaseConfigured && supabase && user.id) {
    try {
      realtimeChannel = supabase
        .channel(`session_guard_${user.id}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          },
          (payload) => {
            if (isTerminated) return
            const newActiveId = payload.new?.active_session_id
            if (newActiveId && myToken && newActiveId !== myToken) {
              console.warn('[SessionGuard] Realtime update: new active_session_id detected from another device.')
              triggerConflict('other_device')
            }
          }
        )
        .subscribe()
    } catch (rtErr) {
      console.warn('[SessionGuard] Realtime subscription error:', rtErr)
    }
  }

  // 5. Periodic Heartbeats:
  // - Tab lock refresh every 1.5 seconds
  // - DB session check every 5 seconds
  const tabLockInterval = setInterval(checkTabLock, 1500)
  const dbInterval = setInterval(checkDatabaseSession, 5000)

  // 6. Visibility and Focus Handlers (immediate check when user switches back to this tab)
  function handleFocusOrVisibility() {
    if (!document.hidden) {
      checkTabLock()
      checkDatabaseSession()
    }
  }
  window.addEventListener('visibilitychange', handleFocusOrVisibility)
  window.addEventListener('focus', handleFocusOrVisibility)

  // Clean lock on window unload
  function handleUnload() {
    try {
      const raw = localStorage.getItem(`${TAB_LOCK_PREFIX}${user.id}`)
      if (raw) {
        const lock = JSON.parse(raw)
        if (lock.tabId === myTabId) {
          localStorage.removeItem(`${TAB_LOCK_PREFIX}${user.id}`)
        }
      }
    } catch (e) {}
  }
  window.addEventListener('beforeunload', handleUnload)

  // Return Cleanup Function
  return () => {
    isTerminated = true
    clearInterval(tabLockInterval)
    clearInterval(dbInterval)
    window.removeEventListener('visibilitychange', handleFocusOrVisibility)
    window.removeEventListener('focus', handleFocusOrVisibility)
    window.removeEventListener('beforeunload', handleUnload)
    if (bc) {
      try { bc.close() } catch (e) {}
    }
    if (realtimeChannel && isSupabaseConfigured && supabase) {
      try { supabase.removeChannel(realtimeChannel) } catch (e) {}
    }
  }
}
