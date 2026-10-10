/**
 * User-facing explanations for Supabase Auth errors, especially email
 * delivery problems (rate limits, SMTP failures). Never hides the fact that an
 * email was not sent, and never weakens what's required to sign in.
 */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('only request this after')) {
    return 'Too many emails have been sent recently, so this one wasn’t sent. Please wait a while and try again.';
  }
  if (m.includes('error sending') || m.includes('smtp') || m.includes('email address not authorized')) {
    return 'We couldn’t send the email right now. Nothing was changed — please try again later. (The site’s email service may not be configured yet.)';
  }
  if (m.includes('email not confirmed')) return 'Please confirm your email address first — check your inbox for the confirmation link.';
  if (m.includes('invalid login credentials')) return 'That email and password don’t match an account.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with that email already exists. Try signing in or resetting your password.';
  if (m.includes('is invalid') && m.includes('email')) return 'That email address isn’t accepted. Please use a real, reachable address.';
  if (m.includes('password should be')) return message;
  return message;
}
