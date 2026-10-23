import { supabase, isSupabaseConfigured } from './supabase.js'

/**
 * Live Exam Sync Engine
 * 
 * Provides real-time synchronization between Teacher question edits and Student exam rooms:
 * - Broadcasts live edits (typos, question numbers, options, correct answers, points, media)
 * - Listens via BroadcastChannel (instant local/same-browser window sync)
 * - Listens via Supabase Realtime broadcast channels
 * - Listens to Postgres changes on the `questions` table
 * - Resilient heartbeat fallback polling to guarantee 100% sync even through flaky networks
 */

export async function broadcastExamLiveUpdate(examId, details = {}) {
  if (!examId) return null

  const payload = {
    examId,
    timestamp: Date.now(),
    type: details.type || 'EXAM_LIVE_UPDATE',
    message: details.message || 'Pembaruan butir soal telah diterapkan oleh guru pengawas.',
    questionNumber: details.questionNumber || null,
    questionId: details.questionId || null,
    ...details,
  }

  // 1. Same-device / local tabs instant BroadcastChannel
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(`binar_exam_live_${examId}`)
      bc.postMessage(payload)
      setTimeout(() => {
        try { bc.close() } catch (e) {}
      }, 500)
    }
  } catch (err) {
    console.warn('[LiveExamSync] BroadcastChannel post error:', err)
  }

  // 2. Supabase Realtime channel broadcast to all student clients
  if (isSupabaseConfigured && supabase) {
    try {
      const channel = supabase.channel(`exam_live_${examId}`)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'exam_live_update',
            payload
          }).then(() => {
            setTimeout(() => {
              try { supabase.removeChannel(channel) } catch (e) {}
            }, 3000)
          })
        }
      })
    } catch (err) {
      console.warn('[LiveExamSync] Supabase broadcast error:', err)
    }
  }

  return payload
}

/**
 * Subscribes to live exam updates for a given examId.
 * Invokes onUpdate(payload) whenever a teacher publishes a question or exam change.
 * 
 * @param {string} examId 
 * @param {Function} onUpdate 
 * @returns {Function} unsubscribe cleanup function
 */
export function subscribeToExamLiveUpdates(examId, onUpdate) {
  if (!examId || typeof onUpdate !== 'function') return () => {}

  let bc = null
  let realtimeChannel = null
  let postgresChannel = null
  let examChannel = null
  let heartbeatTimer = null
  let lastUpdateTimestamp = Date.now()

  const handleUpdate = (payload) => {
    lastUpdateTimestamp = Date.now()
    onUpdate(payload)
  }

  // 1. Listen via local BroadcastChannel
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(`binar_exam_live_${examId}`)
      bc.onmessage = (event) => {
        if (event?.data?.examId === examId) {
          handleUpdate(event.data)
        }
      }
    }
  } catch (err) {
    console.warn('[LiveExamSync] BroadcastChannel subscribe error:', err)
  }

  // 2. Listen via Supabase Realtime Broadcast
  if (isSupabaseConfigured && supabase) {
    try {
      realtimeChannel = supabase
        .channel(`exam_live_${examId}`)
        .on('broadcast', { event: 'exam_live_update' }, (message) => {
          if (message?.payload?.examId === examId) {
            handleUpdate(message.payload)
          }
        })
        .subscribe()
    } catch (err) {
      console.warn('[LiveExamSync] Realtime channel setup error:', err)
    }

    // 3. Listen to Postgres Changes on questions table for this exam_id
    try {
      postgresChannel = supabase
        .channel(`exam_db_questions_${examId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'questions',
          filter: `exam_id=eq.${examId}`
        }, () => {
          handleUpdate({ examId, type: 'DB_QUESTIONS_CHANGED', timestamp: Date.now() })
        })
        .subscribe()
    } catch (err) {
      console.warn('[LiveExamSync] Postgres changes setup error:', err)
    }

    // 4. Listen to Postgres Changes on exams table for status changes (close/unpublish)
    try {
      examChannel = supabase
        .channel(`exam_db_status_${examId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'exams',
          filter: `id=eq.${examId}`
        }, (payload) => {
          const newStatus = payload?.new?.status
          if (newStatus && newStatus !== 'published') {
            handleUpdate({
              examId,
              type: 'EXAM_UNPUBLISHED',
              targetStatus: newStatus,
              message: newStatus === 'closed'
                ? 'Ujian telah ditutup secara resmi oleh guru pengawas. Seluruh jawaban Anda telah otomatis dikumpulkan dan dinilai.'
                : 'Ujian telah di-unpublish oleh guru pengawas. Seluruh jawaban Anda telah otomatis dikumpulkan dan dinilai.'
            })
          } else {
            handleUpdate({ examId, type: 'DB_EXAM_CHANGED', timestamp: Date.now() })
          }
        })
        .subscribe()
    } catch (err) {
      console.warn('[LiveExamSync] Postgres exam status setup error:', err)
    }
  }

  // 5. Fallback Polling / Heartbeat
  // Every 15 seconds, check if the exam status has closed/unpublished or updated
  const checkSync = async () => {
    if (!isSupabaseConfigured || !supabase) return
    try {
      const { data: examData } = await supabase
        .from('exams')
        .select('id, status, updated_at')
        .eq('id', examId)
        .maybeSingle()

      if (examData?.status && examData.status !== 'published') {
        handleUpdate({
          examId,
          type: 'EXAM_UNPUBLISHED',
          targetStatus: examData.status,
          message: examData.status === 'closed'
            ? 'Ujian telah ditutup secara resmi oleh guru pengawas. Seluruh jawaban Anda telah otomatis dikumpulkan dan dinilai.'
            : 'Ujian telah di-unpublish oleh guru pengawas. Seluruh jawaban Anda telah otomatis dikumpulkan dan dinilai.'
        })
        return
      }

      if (examData?.updated_at) {
        const remoteTime = new Date(examData.updated_at).getTime()
        if (remoteTime > lastUpdateTimestamp) {
          lastUpdateTimestamp = remoteTime
          handleUpdate({ examId, type: 'HEARTBEAT_SYNC', timestamp: remoteTime })
        }
      }
    } catch (e) {}
  }

  heartbeatTimer = setInterval(checkSync, 15000)

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkSync()
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Cleanup function
  return () => {
    if (bc) {
      try { bc.close() } catch (e) {}
    }
    if (realtimeChannel && supabase) {
      try { supabase.removeChannel(realtimeChannel) } catch (e) {}
    }
    if (postgresChannel && supabase) {
      try { supabase.removeChannel(postgresChannel) } catch (e) {}
    }
    if (examChannel && supabase) {
      try { supabase.removeChannel(examChannel) } catch (e) {}
    }
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}

/**
 * Quickly updates a single question in Supabase and broadcasts to all active student clients.
 * Useful for fast corrections during live monitoring without full page reload.
 */
export async function liveUpdateSingleQuestion(examId, questionId, questionData) {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Database Supabase tidak terhubung' }
  }

  try {
    const updatePayload = {
      ...questionData,
      updated_at: new Date().toISOString()
    }
    // Remove undefined or helper fields
    delete updatePayload.exam_id
    delete updatePayload.id

    const { data: updatedQ, error: qErr } = await supabase
      .from('questions')
      .update(updatePayload)
      .eq('id', questionId)
      .select()
      .single()

    if (qErr) throw qErr

    // Update parent exam's updated_at
    await supabase
      .from('exams')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', examId)

    // Broadcast live to all students
    await broadcastExamLiveUpdate(examId, {
      type: 'QUESTION_UPDATED',
      questionId,
      questionNumber: updatedQ?.number,
      message: `Soal No. ${updatedQ?.number || ''} telah diperbarui oleh guru.`
    })

    return { success: true, data: updatedQ }
  } catch (err) {
    console.error('[LiveExamSync] liveUpdateSingleQuestion error:', err)
    return { success: false, error: err.message || 'Gagal memperbarui butir soal' }
  }
}
