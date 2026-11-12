/** Decoupled UI intents so any page can open global dialogs in the shell. */
export function openSendEventDialog() {
  window.dispatchEvent(new CustomEvent("hookfire:send-event"));
}
