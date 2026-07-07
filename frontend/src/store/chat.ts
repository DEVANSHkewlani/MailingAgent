/**
 * Chat Store — tracks user conversations, active thread message history,
 * and communicates with orchestrator chat API endpoints.
 */

import { atom } from 'nanostores'
import {
  fetchConversations,
  fetchMessages,
  createConversation,
  sendMessage,
  deleteConversation,
  type Conversation,
  type Message,
} from '../lib/api'

export const $conversations = atom<Conversation[]>([])
export const $activeConversationId = atom<string | null>(null)
export const $messages = atom<Message[]>([])
export const $chatLoading = atom<boolean>(false)
export const $chatSending = atom<boolean>(false)
export const $chatError = atom<string | null>(null)
// Incremented after every successful agent run to trigger inbox/alerts refresh
export const $emailRefreshSignal = atom<number>(0)

export async function loadConversations(userId: string) {
  $chatLoading.set(true)
  $chatError.set(null)
  try {
    const list = await fetchConversations(userId)
    $conversations.set(list)
    if (list.length > 0 && !$activeConversationId.get()) {
      await selectConversation(list[0].conversation_id)
    }
  } catch (err: any) {
    $chatError.set(err.message || 'Failed to fetch conversations')
  } finally {
    $chatLoading.set(false)
  }
}

export async function selectConversation(conversationId: string) {
  $activeConversationId.set(conversationId)
  $chatLoading.set(true)
  $chatError.set(null)
  try {
    const list = await fetchMessages(conversationId)
    $messages.set(list)
  } catch (err: any) {
    $chatError.set(err.message || 'Failed to fetch message history')
  } finally {
    $chatLoading.set(false)
  }
}

export async function startNewConversation(userId: string) {
  const newId = crypto.randomUUID()
  const title = `Chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  
  $chatLoading.set(true)
  try {
    await createConversation(newId, userId, title)
    const newConv: Conversation = {
      conversation_id: newId,
      title,
      updated_at: new Date().toISOString(),
    }
    $conversations.set([newConv, ...$conversations.get()])
    $activeConversationId.set(newId)
    $messages.set([])
  } catch (err: any) {
    alert(`Failed to start conversation: ${err.message}`)
  } finally {
    $chatLoading.set(false)
  }
}

export async function handleSendMessage(userId: string, instruction: string) {
  let activeId = $activeConversationId.get()
  if (!activeId) {
    activeId = crypto.randomUUID()
    const title = 'Inbox Command'
    await createConversation(activeId, userId, title)
    $conversations.set([{ conversation_id: activeId, title, updated_at: new Date().toISOString() }])
    $activeConversationId.set(activeId)
  }

  const userMsg: Message = { role: 'user', content: instruction }
  $messages.set([...$messages.get(), userMsg])
  $chatSending.set(true)

  try {
    const result = await sendMessage(activeId, userId, instruction)
    const assistantMsg: Message = { role: 'assistant', content: result.response || 'Done.' }
    $messages.set([...$messages.get(), assistantMsg])
    // Signal inbox & alerts views to refresh their data
    $emailRefreshSignal.set($emailRefreshSignal.get() + 1)
  } catch (err: any) {
    $messages.set([
      ...$messages.get(),
      { role: 'assistant', content: `⚠️ Error running agent graph: ${err.message}` },
    ])
  } finally {
    $chatSending.set(false)
  }
}

export async function handleDeleteConversation(conversationId: string) {
  try {
    await deleteConversation(conversationId)
    const updated = $conversations.get().filter(c => c.conversation_id !== conversationId)
    $conversations.set(updated)
    
    if ($activeConversationId.get() === conversationId) {
      if (updated.length > 0) {
        selectConversation(updated[0].conversation_id)
      } else {
        $activeConversationId.set(null)
        $messages.set([])
      }
    }
  } catch (err: any) {
    alert(`Failed to delete conversation: ${err.message}`)
  }
}
