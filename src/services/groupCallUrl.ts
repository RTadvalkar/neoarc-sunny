/**
 * Utility for constructing and copying public join links for Sunny Group Calls.
 */

export function getPublicAppOrigin(): string {
  return window.location.origin.replace(/\/$/, '');
}

export function buildGroupCallJoinUrl(groupId: string, sessionId: string): string {
  const origin = getPublicAppOrigin();
  return `${origin}/?groupId=${encodeURIComponent(groupId)}&callSession=${encodeURIComponent(sessionId)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, trying fallback:', err);
    }
  }

  // Fallback copy mechanism
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copyToClipboard failed:', err);
    return false;
  }
}
