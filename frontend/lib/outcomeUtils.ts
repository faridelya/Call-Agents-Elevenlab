export const OUTCOME_META: Record<string, { label: string; color: string; icon: string }> = {
  // Goal achieved
  goal_achieved:         { label: 'Goal Achieved',       color: '#00D082', icon: '★' },
  order_confirmed:       { label: 'Order Confirmed',     color: '#00C2B8', icon: '✦' },
  agreed_on_service:     { label: 'Agreed on Service',   color: '#00D082', icon: '◆' },
  appointment_booked:    { label: 'Appointment Booked',  color: '#00C2B8', icon: '◈' },
  payment_collected:     { label: 'Payment Collected',   color: '#00D082', icon: '◉' },
  issue_resolved:        { label: 'Issue Resolved',      color: '#00C2B8', icon: '●' },
  // Positive progress
  interested:            { label: 'Interested',          color: '#38BDF8', icon: '◆' },
  demo_scheduled:        { label: 'Demo Scheduled',      color: '#7C6EFA', icon: '◈' },
  // Follow-up
  callback_requested:    { label: 'Callback Requested',  color: '#7C6EFA', icon: '◉' },
  callback_scheduled:    { label: 'Callback Scheduled',  color: '#7C6EFA', icon: '◉' },
  follow_up_needed:      { label: 'Follow-up Needed',    color: '#A89AF9', icon: '◎' },
  want_to_connect_later: { label: 'Connect Later',       color: '#7C6EFA', icon: '◈' },
  // Incomplete contact
  voicemail_left:        { label: 'Voicemail Left',      color: '#A89AF9', icon: '◎' },
  voicemail:             { label: 'Voicemail',           color: '#A89AF9', icon: '◎' },
  no_answer:             { label: 'No Answer',           color: '#3D607A', icon: '○' },
  gatekeeper:            { label: 'Gatekeeper',          color: '#F0B429', icon: '◇' },
  // Declined
  not_interested:        { label: 'Not Interested',      color: '#FF4D6D', icon: '✕' },
  not_qualified:         { label: 'Not Qualified',       color: '#FF4D6D', icon: '⊗' },
  // Administrative
  do_not_call:           { label: 'Do Not Call',         color: '#FF4D6D', icon: '⊘' },
  wrong_number:          { label: 'Wrong Number',        color: '#F0B429', icon: '◇' },
  call_disconnected:     { label: 'Disconnected',        color: '#3D607A', icon: '○' },
  completed:             { label: 'Completed',           color: '#00C2B8', icon: '●' },
  no_outcome:            { label: 'No Outcome',          color: '#2A3F55', icon: '·' },
  // Transfer
  transferred_to_human:  { label: 'Transferred to Human', color: '#F59E0B', icon: '↗' },
};

export function getOutcomeColor(o?: string): string {
  return OUTCOME_META[o ?? '']?.color ?? '#3D607A';
}

export function getOutcomeLabel(o?: string): string {
  if (!o) return '—';
  return OUTCOME_META[o]?.label ?? o.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getOutcomeIcon(o?: string): string {
  return OUTCOME_META[o ?? '']?.icon ?? '●';
}
